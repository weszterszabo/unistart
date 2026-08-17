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
  "Accept": "application/json, text/html, application/xhtml+xml, application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Referer": "https://jobs.bosch.com/"
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
            location: (deepDetails && deepDetails.location) ? deepDetails.location : (job.location || "Magyarország"),
            url: job.url, 
            apply_url: job.url,
            date_posted: (deepDetails && deepDetails.datePosted) ? deepDetails.datePosted : (job.datePosted || new Date().toISOString()),
            scraped_at: admin.firestore.FieldValue.serverTimestamp(),
            employment_type: deepDetails ? deepDetails.employment_type || job.employment_type || "" : "",
            experience_level: deepDetails ? deepDetails.experience_level || job.experience_level || "" : "",
            subsidiary: deepDetails ? deepDetails.subsidiary || "" : "",
            
            // Felesleges leírások törlése az adatbázisból
            short_description: admin.firestore.FieldValue.delete(),
            long_description: admin.firestore.FieldValue.delete(),
            description: admin.firestore.FieldValue.delete()
          };
          
          await db.collection("jobs").doc(jobId).set(finalJob, { merge: true });
          await new Promise(r => setTimeout(r, 400));
        }

        // Takarítás
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
// 2. MÉLY-KAPARÓ
// ============================================================================
async function enrichJobDetails(jobUrl) {
  if (!jobUrl || !jobUrl.startsWith('http')) return null;
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
// 3. OKOS JSON ADATKINYERŐ SEGÉD
// ============================================================================
function findJobArrayInJson(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  
  // Minden létező HR és API kulcsnév ellenőrzése (Bosch: documents, SmartRecruiters: content)
  const candidateKeys = ['documents', 'content', 'elements', 'hits', 'results', 'items', 'data', 'jobs', 'docs', 'list'];
  for (const key of candidateKeys) {
    if (Array.isArray(data[key]) && data[key].length > 0) {
      return data[key];
    }
  }

  // Rekurzív keresés 1 szinttel mélyebben
  for (const key of Object.keys(data)) {
    if (data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])) {
      for (const subKey of candidateKeys) {
        if (Array.isArray(data[key][subKey]) && data[key][subKey].length > 0) {
          return data[key][subKey];
        }
      }
    }
  }
  return [];
}

// ============================================================================
// 4. ALAP LISTA LETÖLTŐ
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
    if (page > 1 && !baseUrl.includes('pagesize=250')) {
      currentUrl = baseUrl.includes('?') ? `${baseUrl}&startrow=${startrow}` : `${baseUrl}?startrow=${startrow}`;
    }
    
    console.log(`   ⬇️ Oldal ${page} letöltése...`);
    try {
      const response = await fetch(currentUrl, { headers: BROWSER_HEADERS });
      const rawText = await response.text();
      let pageHasJobs = false;

      // 1. OKOS JSON API FELDOLGOZÓ (Bosch, SmartRecruiters, stb.)
      if (rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
        try {
          const data = JSON.parse(rawText);
          const jobArray = findJobArrayInJson(data);
          
          jobArray.forEach(item => {
            const title = item.name || item.title || item.jobTitle || item.job_title || item.headline || "Névtelen pozíció";
            
            // Link feloldása (Bosch url / SmartRecruiters link / rel link)
            let jobUrl = item.url || item.smartRecruitersUrl || item.link || item.applyUrl || item.detailUrl || "";
            if (jobUrl && jobUrl.startsWith('/')) {
              jobUrl = new URL(jobUrl, "https://jobs.bosch.com").href;
            }
            if (!jobUrl && item.id) {
              jobUrl = `https://jobs.smartrecruiters.com/BoschGroup/${item.id}`;
            }

            // Helyszín feloldása
            let loc = "";
            if (typeof item.location === 'string') loc = item.location;
            else if (item.location && typeof item.location === 'object') {
              loc = item.location.city || item.location.name || item.location.addressLocality || "";
            }
            loc = loc || item.city || item.city_name || item.workplace || "Magyarország";

            if (title && jobUrl) {
              extractedJobs.push({
                title: title,
                url: jobUrl,
                location: loc,
                employment_type: item.typeOfEmployment?.label || item.employment_type || "",
                experience_level: item.experienceLevel?.label || item.experience_level || ""
              });
            }
          });
          pageHasJobs = extractedJobs.length > 0;
        } catch (e) {
          console.error("   ❌ JSON Parse Hiba:", e.message);
        }
      }

      // 2. RSS / XML
      if (!pageHasJobs && (rawText.includes('<?xml') || rawText.includes('<rss') || rawText.includes('<feed'))) {
        const $ = cheerio.load(rawText, { xmlMode: true });
        $('item, entry').each((i, el) => {
          extractedJobs.push({
            title: $(el).find('title').text().trim() || "Névtelen",
            url: $(el).find('link').text().trim() || currentUrl,
            location: "Magyarország"
          });
        });
        pageHasJobs = extractedJobs.length > 0;
      }

      // 3. HTML Fallback
      if (!pageHasJobs) {
        const $ = cheerio.load(rawText);
        $('a').each((i, el) => {
          const href = $(el).attr('href');
          const text = $(el).text().trim().replace(/\s+/g, ' ');
          if (href && (href.includes('/job/') || href.includes('/position/')) && text.length > 5) {
            extractedJobs.push({
              title: text,
              url: href.startsWith('http') ? href : new URL(href, currentUrl).href,
              location: "Magyarország"
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
    
    // Ha a Bosch pagesize=250 linket használtuk, az összes állás megérkezett az 1. oldalon!
    if (baseUrl.includes('pagesize=250') || newJobsOnPage === 0 || (page > 1 && uniqueOnPage.length < lastPageCount)) {
      break;
    }
    
    lastPageCount = uniqueOnPage.length;
    startrow += 25;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return allExtractedJobs;
}

runScraper();