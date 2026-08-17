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
        
        const frissAllasok = await scrapeJobsFromUrl(company.career_url);
        console.log(`✅ Alap listán talált állások: ${frissAllasok.length} db`);

        if (frissAllasok.length === 0) {
            console.log("⚠️ Nulla állást találtunk. Biztonsági okokból kihagyjuk a takarítást!");
            continue; 
        }

        const freshJobIds = new Set();

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
            apply_url: job.url, // Eredeti link a gombhoz
            date_posted: (deepDetails && deepDetails.datePosted) ? deepDetails.datePosted : (job.datePosted || new Date().toISOString()),
            scraped_at: admin.firestore.FieldValue.serverTimestamp(),
            employment_type: deepDetails ? deepDetails.employment_type || "" : "",
            experience_level: deepDetails ? deepDetails.experience_level || "" : "",
            subsidiary: deepDetails ? deepDetails.subsidiary || "" : "",
            
            // TÖRÖLJÜK A FELESLEGES ADATOKAT AZ ADATBÁZISBÓL IS!
            short_description: admin.firestore.FieldValue.delete(),
            long_description: admin.firestore.FieldValue.delete(),
            description: admin.firestore.FieldValue.delete()
          };
          
          await db.collection("jobs").doc(jobId).set(finalJob, { merge: true });
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
// 2. MÉLY-KAPARÓ (CSAK A SZÜKSÉGES ADATOKRA)
// ============================================================================
async function enrichJobDetails(jobUrl) {
  try {
    const res = await fetch(jobUrl, { headers: BROWSER_HEADERS });
    const html = await res.text();
    const $ = cheerio.load(html);

    let details = {
      employment_type: "", experience_level: "", subsidiary: "",
      datePosted: "", location: ""
    };

    let locFound = $('.jobGeoLocation, .job-location, .location, [data-automation="job-location"]').first().text().trim();
    if (locFound && locFound.length < 80) {
        details.location = locFound;
    }

    $('span, p, div, li, b, strong').each((i, el) => {
      const txt = $(el).text().replace(/\s+/g, ' ').trim();
      const lower = txt.toLowerCase();

      if (lower.includes('foglalkoztatás típusa') || lower.includes('foglalkoztatás jellege')) {
        let val = $(el).next().text().trim() || txt.split(':')[1]?.trim() || txt.replace(/foglalkoztatás (típusa|jellege):?/i, '').trim();
        if(val.length < 50) details.employment_type = val;
      }
      if (lower.includes('tapasztalati szint')) {
        let val = $(el).next().text().trim() || txt.split(':')[1]?.trim() || txt.replace(/tapasztalati szint:?/i, '').trim();
        if(val.length < 50) details.experience_level = val;
      }
      if (lower.includes('leányvállalat')) {
        let val = $(el).next().text().trim() || txt.split(':')[1]?.trim() || txt.replace(/leányvállalat:?/i, '').trim();
        if(val.length < 100) details.subsidiary = val;
      }
      if (lower.includes('meghirdetés dátuma') || lower.includes('dátum')) {
        let val = $(el).next().text().trim() || txt.split(':')[1]?.trim() || txt.replace(/(meghirdetés dátuma|dátum):?/i, '').trim();
        if(val.length < 50) details.datePosted = val;
      }
      if (!details.location && lower.includes('helyszín') && !lower.includes('keresés')) {
        let val = $(el).next().text().trim() || txt.split(':')[1]?.trim() || txt.replace(/helyszín:?/i, '').trim();
        if(val.length < 80) details.location = val;
      }
    });

    return details;
  } catch (e) {
    return null;
  }
}

// ============================================================================
// 3. ALAP LISTA LETÖLTŐ
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

      if (rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
        try {
          const data = JSON.parse(rawText);
          let jobArray = Array.isArray(data) ? data : data.items || data.results || data.data || data.jobs || [];
          jobArray.forEach(item => {
            extractedJobs.push({
              title: item.title || item.name || item.jobTitle || "Névtelen",
              url: item.url || item.applyUrl || currentUrl,
              location: item.location || item.city || ""
            });
          });
          pageHasJobs = extractedJobs.length > 0;
        } catch (e) {}
      }

      if (!pageHasJobs && (rawText.includes('<?xml') || rawText.includes('<rss') || rawText.includes('<feed'))) {
        const $ = cheerio.load(rawText, { xmlMode: true });
        $('item, entry').each((i, el) => {
          extractedJobs.push({
            title: $(el).find('title').text().trim() || "Névtelen",
            url: $(el).find('link').text().trim() || currentUrl,
            location: ""
          });
        });
        pageHasJobs = extractedJobs.length > 0;
      }

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
                  location: item.jobLocation?.address?.addressLocality || ""
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
                location: ""
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