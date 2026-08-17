const admin = require("firebase-admin");
const cheerio = require("cheerio");
const crypto = require("crypto"); // ÚJ: Kriptográfiai modul az egyedi azonosítókhoz!

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

// BIZTONSÁGI HÁLÓ: Ne fagyjon le a Firestore, ha hiányzik egy adat!
db.settings({ ignoreUndefinedProperties: true }); 

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
        console.log(`✅ Összesen talált állások (minden oldal): ${frissAllasok.length} db`);

        const freshJobIds = new Set();

        for (const job of frissAllasok) {
          // TÖKÉLETES MEGOLDÁS: MD5 Hash generálása a linkből, így 100%-ig egyedi lesz az ID!
          const rawString = job.url || company.name + job.title;
          const jobId = crypto.createHash('md5').update(rawString).digest('hex');
          
          freshJobIds.add(jobId);
          
          await db.collection("jobs").doc(jobId).set({
            company_id: companyId,
            company_name: company.name || "Névtelen cég",
            title: job.title || "Névtelen pozíció",
            description: job.description || "További információkért kattints a jelentkezés gombra.",
            location: job.location || "Nincs megadva",
            url: job.url,
            date_posted: job.datePosted || new Date().toISOString(),
            scraped_at: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        // "OKOS TAKARÍTÁS"
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
      currentUrl = baseUrl.includes('?') 
        ? `${baseUrl}&startrow=${startrow}` 
        : `${baseUrl}?startrow=${startrow}`;
    }
    
    console.log(`   ⬇️ Oldal ${page} letöltése...`);

    try {
      const response = await fetch(currentUrl, {
        headers: {
          "Accept": "application/json, application/rss+xml, text/html, */*",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      });

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
              datePosted: item.datePosted || new Date().toISOString(),
              description: (item.description || "").replace(/(<([^>]+)>)/gi, "").substring(0, 300)
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
            datePosted: $(el).find('pubDate, updated').text() || new Date().toISOString(),
            description: $(el).find('description, summary').text().replace(/(<([^>]+)>)/gi, "").substring(0, 300)
          });
        });
        pageHasJobs = extractedJobs.length > 0;
      }

      // 3. HTML és Schema.org
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
                  datePosted: item.datePosted || new Date().toISOString(),
                  description: item.description ? item.description.replace(/(<([^>]+)>)/gi, "").substring(0, 300) : "",
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
                location: "Részletek a linken",
                datePosted: new Date().toISOString()
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

    if (newJobsOnPage === 0) {
      console.log(`   ⏹️  Nincs több ÚJ állás, lapozás vége.`);
      break;
    }

    if (page > 1 && uniqueOnPage.length < lastPageCount) {
      console.log(`   ⏹️  Kevesebb állás érkezett (${uniqueOnPage.length} < ${lastPageCount}). Elértük a lista végét!`);
      break;
    }
    
    lastPageCount = uniqueOnPage.length;
    startrow += 25;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return allExtractedJobs;
}

runScraper();