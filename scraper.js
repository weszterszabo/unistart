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

// 3. Weboldal letöltő és Schema.org (JSON-LD) értelmező
async function scrapeJobsFromUrl(url) {
  const extractedJobs = [];

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
      },
    });
    const html = await response.text();
    const $ = cheerio.load(html);

    $('script[type="application/ld+json"]').each((index, element) => {
      try {
        const data = JSON.parse($(element).html());
        const items = Array.isArray(data) ? data : [data];

        items.forEach((item) => {
          if (item["@type"] === "JobPosting") {
            const loc = (item.jobLocation && item.jobLocation.address && item.jobLocation.address.addressLocality)
              ? item.jobLocation.address.addressLocality
              : "Nincs megadva";
            const desc = item.description
              ? item.description.replace(/(<([^>]+)>)/gi, "").substring(0, 300) + "..."
              : "Nincs leírás";

            extractedJobs.push({
              title: item.title || "Névtelen pozíció",
              url: item.url || url,
              location: loc,
              datePosted: item.datePosted || new Date().toISOString(),
              description: desc,
            });
          }
        });
      } catch (err) {
        // Hibás JSON blokk átugrása
      }
    });
  } catch (error) {
    console.error(`Hiba a ${url} letöltésekor:`, error.message);
  }

  return extractedJobs;
}

// Futtatás indítása
runScraper();