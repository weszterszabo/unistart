const admin = require("firebase-admin");
const cheerio = require("cheerio");

// 1. Firebase Admin hitelesítés a GitHub Secret-ből kapott kulccsal
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} else {
  console.error("Hiba: A FIREBASE_SERVICE_ACCOUNT_KEY környezeti változó hiányzik!");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// 2. Fő futtató funkció
async function runScraper() {
  console.log("🚀 Állásgyűjtő szkript elindult...");

  try {
    const companiesSnapshot = await db.collection("companies").get();

    if (companiesSnapshot.empty) {
      console.log("⚠️ Nincsenek cégek a 'companies' gyűjteményben. Adj hozzá cégeket Firestore-ban!");
      return;
    }

    for (const doc of companiesSnapshot.docs) {
      const company = doc.data();

      if (company.career_url) {
        console.log(`🔍 Feldolgozás: ${company.name || "Cég"} -> ${company.career_url}`);
        const frissAllasok = await scrapeJobsFromUrl(company.career_url);
        console.log(`✅ Talált állások: ${frissAllasok.length} db`);

        for (const job of frissAllasok) {
          const jobId = (job.url || company.name + job.title)
            .replace(/[^a-zA-Z0-9]/g, "")
            .substring(0, 50);

          await db.collection("jobs").doc(jobId).set({
            company_id: doc.id,
            company_name: company.name || "Névtelen cég",
            title: job.title,
            description: job.description,
            location: job.location,
            url: job.url,
            date_posted: job.datePosted,
            scraped_at: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }
      }
    }
    console.log("🎉 Szinkronizáció sikeresen befejeződött!");
  } catch (error) {
    console.error("❌ Hiba történt a gyűjtés során:", error);
    process.exit(1);
  }
}

// 3. Hibrid letöltő: API + Schema.org + Okos HTML Fallback
async function scrapeJobsFromUrl(url) {
  const extractedJobs = [];

  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json, text/html, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
      },
    });

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      console.log("   📡 JSON API válasz észlelve...");
      const data = await response.json();
      
      let jobArray = [];
      if (Array.isArray(data)) jobArray = data;
      else if (data.items && Array.isArray(data.items)) jobArray = data.items;
      else if (data.results && Array.isArray(data.results)) jobArray = data.results;
      else if (data.data && Array.isArray(data.data)) jobArray = data.data;
      else if (data.jobs && Array.isArray(data.jobs)) jobArray = data.jobs;

      jobArray.forEach(item => {
        extractedJobs.push({
          title: item.title || item.name || item.jobTitle || "Névtelen pozíció",
          url: item.url || item.applyUrl || item.jobUrl || url,
          location: item.location || item.city || "Nincs megadva",
          datePosted: item.datePosted || item.createdAt || new Date().toISOString(),
          description: (item.description || item.summary || "").replace(/(<([^>]+)>)/gi, "").substring(0, 300) + "..."
        });
      });

    } else {
      console.log("   📄 HTML weboldal észlelve...");
      const html = await response.text();
      const $ = cheerio.load(html);

      // PRÓBA 1: Schema.org JSON-LD
      $('script[type="application/ld+json"]').each((index, element) => {
        try {
          const data = JSON.parse($(element).html());
          const items = Array.isArray(data) ? data : [data];

          items.forEach((item) => {
            if (item["@type"] === "JobPosting") {
              extractedJobs.push({
                title: item.title || "Névtelen pozíció",
                url: item.url || url,
                location: item.jobLocation?.address?.addressLocality || "Nincs megadva",
                datePosted: item.datePosted || new Date().toISOString(),
                description: item.description ? item.description.replace(/(<([^>]+)>)/gi, "").substring(0, 300) + "..." : "Nincs leírás",
              });
            }
          });
        } catch (err) {}
      });

      // PRÓBA 2: Okos HTML Fallback (ha a Schema.org 0 találatot hozott)
      if (extractedJobs.length === 0) {
        console.log("   ⚠️ Nincs Schema.org adat, Okos HTML Fallback indítása...");
        
        $('a').each((i, el) => {
          const href = $(el).attr('href');
          const text = $(el).text().trim().replace(/\s+/g, ' '); // Sortörések tisztítása
          const className = $(el).attr('class') || '';

          // Keresünk gyanús álláslinkeket (pl. CIB / SAP SuccessFactors / Workday rendszerek)
          if (href && (href.includes('/job/') || href.includes('/position/') || className.toLowerCase().includes('jobtitle'))) {
            // Kiszűrjük a "Minden állás" típusú gombokat és a túl rövid szövegeket
            if (text.length > 5 && !text.toLowerCase().includes('összes') && !text.toLowerCase().includes('all jobs')) {
              
              // Relatív linkek (pl. /job/123) átalakítása teljes (https://...) linkké
              const fullUrl = href.startsWith('http') ? href : new URL(href, url).href;
              
              extractedJobs.push({
                title: text,
                url: fullUrl,
                location: "Részletek a linken", // Általános listából nehéz kinyerni
                datePosted: new Date().toISOString(),
                description: "Kattints a hirdetésre a részletekért..."
              });
            }
          }
        });

        // Duplikált linkek kiszűrése (sokszor a cím és egy "Jelentkezés" gomb is ugyanoda mutat)
        const uniqueJobs = [];
        const seenUrls = new Set();
        for (const job of extractedJobs) {
          if (!seenUrls.has(job.url)) {
            seenUrls.add(job.url);
            uniqueJobs.push(job);
          }
        }
        extractedJobs.length = 0;
        extractedJobs.push(...uniqueJobs);
      }
    }
  } catch (error) {
    console.error(`❌ Hiba a ${url} letöltésekor:`, error.message);
  }

  return extractedJobs;
}

runScraper();