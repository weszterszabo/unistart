const admin = require("firebase-admin");
const cheerio = require("cheerio");
const crypto = require("crypto");

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} else {
  console.error("Hiba: A FIREBASE_SERVICE_ACCOUNT_KEY hiányzik!");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true }); 

// ============================================================================
// 1. FŐ FUTTATÓ FUNKCIÓ
// ============================================================================
async function runScraper() {
  console.log("🚀 Állásgyűjtő szkript elindult...");
  try {
    const companiesSnapshot = await db.collection("companies").get();
    if (companiesSnapshot.empty) {
      console.log("⚠️ Nincsenek cégek a 'companies' gyűjteményben.");
      return;
    }

    for (const doc of companiesSnapshot.docs) {
      const companyId = doc.id;
      const company = doc.data();
      
      if (company.career_url) {
        console.log(`\n🔍 Feldolgozás: ${company.name || "Cég"} -> ${company.career_url}`);
        
        // 1. Alap lista letöltése
        const frissAllasok = await scrapeJobsFromUrl(company.career_url);
        console.log(`✅ Alap listán talált állások: ${frissAllasok.length} db`);

        const freshJobIds = new Set();

        // 2. MÉLY-KAPARÁS: Végigmegyünk minden egyes álláson, és letöltjük a részleteket!
        console.log(`⏳ Mély-kaparás és részletes adatok letöltése folyamatban... (ez eltarthat egy percig)`);
        
        for (let i = 0; i < frissAllasok.length; i++) {
          const job = frissAllasok[i];
          const rawString = job.url || company.name + job.title;
          const jobId = crypto.createHash('md5').update(rawString).digest('hex');
          freshJobIds.add(jobId);
          
          process.stdout.write(`   🔎 [${i+1}/${frissAllasok.length}] Olvasás: ${job.title.substring(0, 30)}... `);
          
          // Belépünk az álláshirdetés oldalára
          const deepDetails = await enrichJobDetails(job.url);
          console.log(deepDetails ? "Kész!" : "Hiba.");

          let finalJob = {
            company_id: companyId,
            company_name: company.name || "Névtelen cég",
            title: job.title || "Névtelen pozíció",
            location: job.location || "Nincs megadva",
            url: job.url, // Eredeti link
            date_posted: job.datePosted || new Date().toISOString(),
            scraped_at: admin.firestore.FieldValue.serverTimestamp(),
          };

          // Ha sikeresen kiszedtük a mély adatokat, hozzáadjuk őket!
          if (deepDetails) {
             finalJob.short_description = deepDetails.short_description || job.description || "További információkért kattints a jelentkezés gombra.";
             finalJob.long_description = deepDetails.long_description || "";
             finalJob.employment_type = deepDetails.employment_type || "";
             finalJob.experience_level = deepDetails.experience_level || "";
             finalJob.subsidiary = deepDetails.subsidiary || "";
             finalJob.apply_url = deepDetails.apply_url || job.url;
             if (deepDetails.datePosted) finalJob.date_posted = deepDetails.datePosted;
          } else {
             finalJob.short_description = job.description || "További információkért kattints a jelentkezésre.";
          }
          
          await db.collection("jobs").doc(jobId).set(finalJob, { merge: true });
          
          // Késleltetés, hogy a CIB szervere ne tiltson ki minket a túl gyors kattintásokért!
          await new Promise(r => setTimeout(r, 500));
        }

        // 3. OKOS TAKARÍTÁS
        const existingJobsSnapshot = await db.collection("jobs").where("company_id", "==", companyId).get();
        let deletedCount = 0;
        for (const jobDoc of existingJobsSnapshot.docs) {
          if (!freshJobIds.has(jobDoc.id)) {
            await db.collection("jobs").doc(jobDoc.id).delete();
            deletedCount++;
          }
        }
        if (deletedCount > 0) {
          console.log(`   🗑️  Takarítás: ${deletedCount} db elavult állás törölve az adatbázisból.`);
        }
      }
    }
    console.log("\n🎉 Szinkronizáció sikeresen befejeződött!");
  } catch (error) {
    console.error("❌ Hiba történt:", error);
    process.exit(1);
  }
}

// ============================================================================
// 2. MÉLY-KAPARÓ (DEEP SCRAPER) - EZ OLVAS BELE A HIRDETÉSBE
// ============================================================================
async function enrichJobDetails(jobUrl) {
  try {
    const res = await fetch(jobUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    let details = {
      apply_url: jobUrl,
      short_description: "",
      long_description: "",
      employment_type: "",
      experience_level: "",
      subsidiary: "",
      datePosted: ""
    };

    // 1. Metaadatok kinyerése (Foglalkoztatás, Tapasztalat, stb.)
    $('span, p, div, li').each((i, el) => {
      const txt = $(el).text().replace(/\s+/g, ' ').trim();
      const lower = txt.toLowerCase();

      if (lower.includes('foglalkoztatás típusa')) {
        const val = txt.split(':')[1]?.trim() || $(el).next().text().trim();
        if (val && val.length < 50) details.employment_type = val;
      }
      if (lower.includes('tapasztalati szint')) {
        const val = txt.split(':')[1]?.trim() || $(el).next().text().trim();
        if (val && val.length < 50) details.experience_level = val;
      }
      if (lower.includes('leányvállalat')) {
        const val = txt.split(':')[1]?.trim() || $(el).next().text().trim();
        if (val && val.length < 100) details.subsidiary = val;
      }
      if (lower.includes('meghirdetés dátuma')) {
        const val = txt.split(':')[1]?.trim() || $(el).next().text().trim();
        if (val && val.length < 50) details.datePosted = val;
      }
    });

    // 2. Tényleges Jelentkezés Gomb / Link megtalálása
    const applyBtn = $('a').filter(function() {
      const t = $(this).text().toLowerCase();
      const h = $(this).attr('href') || '';
      return t.includes('jelentkezés') || t.includes('apply now') || h.includes('apply');
    }).first();

    if (applyBtn.length > 0) {
      let aUrl = applyBtn.attr('href');
      if (aUrl.startsWith('/')) aUrl = new URL(aUrl, jobUrl).href;
      details.apply_url = aUrl;
    }

    // 3. A Leírás (Rövid és Hosszú) kinyerése és szépítése
    let descContainer = $('.jobdescription');
    if (descContainer.length === 0) descContainer = $('.job-description');
    if (descContainer.length === 0) descContainer = $('main');

    if (descContainer.length > 0) {
      // Hogy a felsorolások szépek maradjanak (megőrizzük a '•' jeleket és sortöréseket)
      descContainer.find('br').replaceWith('\n');
      descContainer.find('li').prepend('• ').append('\n');
      descContainer.find('p, div, h1, h2, h3').append('\n\n');

      let plainText = descContainer.text().trim();
      plainText = plainText.replace(/\n{3,}/g, '\n\n'); // Dupla sortörések normalizálása

      // Szétvágjuk bekezdésekre (amik elég hosszúak ahhoz, hogy szövegek legyenek)
      const paragraphs = plainText.split('\n\n').filter(p => p.trim().length > 40);

      if (paragraphs.length > 0) {
        details.short_description = paragraphs[0].trim(); // Az első blokk a rövid leírás
        details.long_description = paragraphs.slice(1).join('\n\n').trim(); // A többi a hosszú
      }
    }

    return details;
  } catch (e) {
    return null; // Ha hiba van, visszaadjuk üresen, de nem fagy le
  }
}

// ============================================================================
// 3. ALAP LISTA LETÖLTŐ (LAPOZÁSSAL)
// ============================================================================
async function scrapeJobsFromUrl(baseUrl) {
  const allExtractedJobs = [];
  const seenUrls = new Set();
  let startrow = 0;
  const maxPages = 10;
  let lastPageCount = 0;

  for (let page = 1; page <= maxPages; page++) {
    const extractedJobs = [];
    let currentUrl = baseUrl;
    if (page > 1) {
      currentUrl = baseUrl.includes('?') ? `${baseUrl}&startrow=${startrow}` : `${baseUrl}?startrow=${startrow}`;
    }
    
    console.log(`   ⬇️ Oldal ${page} letöltése...`);
    try {
      const response = await fetch(currentUrl, {
        headers: { "Accept": "application/json, application/rss+xml, text/html, */*", "User-Agent": "Mozilla/5.0" },
      });
      const rawText = await response.text();
      let pageHasJobs = false;

      // 1. JSON
      if (rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
        try {
          const data = JSON.parse(rawText);
          let jobArray = Array.isArray(data) ? data : data.items || data.results || data.data || data.jobs || [];
          jobArray.forEach(item => {
            extractedJobs.push({
              title: item.title || item.name || item.jobTitle || "Névtelen",
              url: item.url || item.applyUrl || currentUrl,
              location: item.location || item.city || "Nincs",
              description: item.description || ""
            });
          });
          pageHasJobs = extractedJobs.length > 0;
        } catch (e) {}
      }

      // 2. RSS
      if (!pageHasJobs && (rawText.includes('<?xml') || rawText.includes('<rss') || rawText.includes('<feed'))) {
        const $ = cheerio.load(rawText, { xmlMode: true });
        $('item, entry').each((i, el) => {
          extractedJobs.push({
            title: $(el).find('title').text().trim() || "Névtelen",
            url: $(el).find('link').text().trim() || currentUrl,
            location: "Magyarország",
            description: $(el).find('description, summary').text().replace(/(<([^>]+)>)/gi, "")
          });
        });
        pageHasJobs = extractedJobs.length > 0;
      }

      // 3. HTML
      if (!pageHasJobs) {
        const $ = cheerio.load(rawText);
        $('a').each((i, el) => {
          const href = $(el).attr('href');
          const text = $(el).text().trim().replace(/\s+/g, ' ');
          if (href && (href.includes('/job/') || href.includes('/position/')) && text.length > 5) {
            extractedJobs.push({
              title: text,
              url: href.startsWith('http') ? href : new URL(href, currentUrl).href,
              location: "Részletek a linken",
              description: ""
            });
          }
        });
      }
    } catch (error) {
      console.error(`   ❌ Hiba az oldal letöltésekor:`, error.message);
    }

    const uniqueOnPage = extractedJobs.filter((v, i, a) => a.findIndex(t => (t.url === v.url)) === i);
    let newJobsOnPage = 0;
    
    for (const job of uniqueOnPage) {
      if (!seenUrls.has(job.url)) {
        seenUrls.add(job.url);
        allExtractedJobs.push(job);
        newJobsOnPage++;
      }
    }
    
    console.log(`   ✔️  ÚJ találat ezen az oldalon: ${newJobsOnPage} db`);
    if (newJobsOnPage === 0 || (page > 1 && uniqueOnPage.length < lastPageCount)) break;
    
    lastPageCount = uniqueOnPage.length;
    startrow += 25;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return allExtractedJobs;
}

runScraper();