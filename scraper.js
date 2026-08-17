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

// A tökéletes álca, hogy a banki tűzfalak (SAP, Workday) ne tiltsanak le
const BROWSER_HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

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

        // BIZTONSÁGI HÁLÓ: Ha hálózati hiba volt, nem töröljük az adatbázist!
        if (frissAllasok.length === 0) {
            console.log("⚠️ Nulla állást találtunk. Ez valószínűleg hálózati hiba, a biztonság kedvéért kihagyjuk a takarítást, hogy ne vesszenek el az adatok!");
            continue; 
        }

        const freshJobIds = new Set();

        // 2. MÉLY-KAPARÁS
        console.log(`⏳ Mély-kaparás és részletes adatok letöltése folyamatban...`);
        
        for (let i = 0; i < frissAllasok.length; i++) {
          const job = frissAllasok[i];
          const rawString = job.url || company.name + job.title;
          const jobId = crypto.createHash('md5').update(rawString).digest('hex');
          freshJobIds.add(jobId);
          
          process.stdout.write(`   🔎 [${i+1}/${frissAllasok.length}] Olvasás: ${job.title.substring(0, 30)}... `);
          
          const deepDetails = await enrichJobDetails(job.url);
          console.log(deepDetails ? "Kész!" : "Hiba.");

          let finalJob = {
            company_id: companyId,
            company_name: company.name || "Névtelen cég",
            title: job.title || "Névtelen pozíció",
            location: (deepDetails && deepDetails.location) ? deepDetails.location : (job.location || "Nincs megadva"),
            url: job.url, 
            date_posted: (deepDetails && deepDetails.datePosted) ? deepDetails.datePosted : (job.datePosted || new Date().toISOString()),
            scraped_at: admin.firestore.FieldValue.serverTimestamp(),
          };

          if (deepDetails) {
             finalJob.short_description = deepDetails.short_description || job.description || "További információkért kattints a jelentkezés gombra.";
             finalJob.long_description = deepDetails.long_description || "";
             finalJob.employment_type = deepDetails.employment_type || "";
             finalJob.experience_level = deepDetails.experience_level || "";
             finalJob.subsidiary = deepDetails.subsidiary || "";
             finalJob.apply_url = deepDetails.apply_url || job.url;
          } else {
             finalJob.short_description = job.description || "További információkért kattints a jelentkezésre.";
          }
          
          await db.collection("jobs").doc(jobId).set(finalJob, { merge: true });
          
          // Fél másodperc pihenő, hogy ne blokkoljon a szerver
          await new Promise(r => setTimeout(r, 500));
        }

        // 3. OKOS TAKARÍTÁS (Már biztonságos, mert frissAllasok > 0)
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
// 2. MÉLY-KAPARÓ (DEEP SCRAPER)
// ============================================================================
async function enrichJobDetails(jobUrl) {
  try {
    const res = await fetch(jobUrl, { headers: BROWSER_HEADERS });
    const html = await res.text();
    const $ = cheerio.load(html);

    let details = {
      apply_url: jobUrl, short_description: "", long_description: "",
      employment_type: "", experience_level: "", subsidiary: "",
      datePosted: "", location: ""
    };

    // 1. Metaadatok kinyerése a felsorolásokból és szövegekből
    $('span, p, div, li, b, strong').each((i, el) => {
      const txt = $(el).text().replace(/\s+/g, ' ').trim();
      const lower = txt.toLowerCase();

      if (lower.includes('foglalkoztatás típusa') || lower.includes('foglalkoztatás jellege')) {
        details.employment_type = $(el).next().text().trim() || txt.split(':')[1]?.trim() || txt.replace(/foglalkoztatás (típusa|jellege):?/i, '').trim();
      }
      if (lower.includes('tapasztalati szint')) {
        details.experience_level = $(el).next().text().trim() || txt.split(':')[1]?.trim() || txt.replace(/tapasztalati szint:?/i, '').trim();
      }
      if (lower.includes('leányvállalat')) {
        details.subsidiary = $(el).next().text().trim() || txt.split(':')[1]?.trim() || txt.replace(/leányvállalat:?/i, '').trim();
      }
      if (lower.includes('meghirdetés dátuma') || lower.includes('dátum')) {
        details.datePosted = $(el).next().text().trim() || txt.split(':')[1]?.trim() || txt.replace(/(meghirdetés dátuma|dátum):?/i, '').trim();
      }
      if (lower.includes('helyszín') && !lower.includes('keresés')) {
        details.location = $(el).next().text().trim() || txt.split(':')[1]?.trim() || txt.replace(/helyszín:?/i, '').trim();
      }
    });

    // Ha a parser véletlenül túl hosszú szöveget szedett ki a metaadatokhoz, töröljük
    for(let key in details) {
        if(typeof details[key] === 'string' && details[key].length > 80 && key !== 'short_description' && key !== 'long_description' && key !== 'apply_url') {
            details[key] = ""; 
        }
    }

    // 2. Jelentkezés Gomb 
    const applyBtn = $('a').filter(function() {
      const t = $(this).text().toLowerCase();
      const h = $(this).attr('href') || '';
      return t.includes('jelentkezés') || t.includes('apply') || h.includes('apply');
    }).first();

    if (applyBtn.length > 0) {
      let aUrl = applyBtn.attr('href');
      if (aUrl.startsWith('/')) aUrl = new URL(aUrl, jobUrl).href;
      details.apply_url = aUrl;
    }

    // 3. Leírás (Rövid és Hosszú) kinyerése okos formázással
    let descContainer = $('.jobdescription');
    if (descContainer.length === 0) descContainer = $('.job-description');
    if (descContainer.length === 0) descContainer = $('main');

    if (descContainer.length > 0) {
      descContainer.find('br').replaceWith('\n');
      descContainer.find('li').prepend('• ').append('\n');
      descContainer.find('p, div, h1, h2, h3').append('\n\n');

      let plainText = descContainer.text().trim();
      plainText = plainText.replace(/\n{3,}/g, '\n\n'); // Dupla sortörések normalizálása

      const paragraphs = plainText.split('\n\n').filter(p => p.trim().length > 40);

      if (paragraphs.length > 0) {
        details.short_description = paragraphs[0].trim();
        details.long_description = paragraphs.slice(1).join('\n\n').trim();
      }
    }

    return details;
  } catch (e) {
    return null;
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
      const response = await fetch(currentUrl, { headers: BROWSER_HEADERS });
      const rawText = await response.text();
      let pageHasJobs = false;

      // 1. JSON API
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

      // 2. RSS / XML feed
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

      // 3. HTML (Schema.org / Fallback)
      if (!pageHasJobs) {
        const $ = cheerio.load(rawText);
        $('script[type="application/ld+json"]').each((i, el) => {
          try {
            const data = JSON.parse($(el).html());
            const items = Array.isArray(data) ? data : [data];
            items.forEach((item) => {
              if (item["@type"] === "JobPosting") {
                extractedJobs.push({
                  title: item.title || "Névtelen",
                  url: item.url || currentUrl,
                  location: item.jobLocation?.address?.addressLocality || "Nincs",
                  description: item.description || "",
                });
              }
            });
          } catch (err) {}
        });
        
        if (extractedJobs.length === 0) {
          $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim().replace(/\s+/g, ' ');
            if (href && (href.includes('/job/') || href.includes('/position/')) && text.length > 5) {
              extractedJobs.push({
                title: text,
                url: href.startsWith('http') ? href : new URL(href, currentUrl).href,
                location: "Részletek a linken"
              });
            }
          });
        }
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