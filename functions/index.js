const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const cheerio = require("cheerio");

admin.initializeApp();
const db = admin.firestore();

exports.autoJobScraper = onSchedule("every day 02:00", async (event) => {
  console.log("Éjszakai állásszinkronizáció elindult...");

  try {
    const companiesSnapshot = await db.collection("companies").get();

    for (const doc of companiesSnapshot.docs) {
      const company = doc.data();

      if (company.career_url) {
        console.log("Feldolgozás: " + company.name + " -> " + company.career_url);
        const frissAllasok = await scrapeJobsFromUrl(company.career_url);
        console.log("Talált állások: " + frissAllasok.length + " db");

        for (const job of frissAllasok) {
          const jobId = job.url.replace(/[^a-zA-Z0-9]/g, "").substring(0, 50);

          await db.collection("jobs").doc(jobId).set({
            company_id: doc.id,
            company_name: company.name,
            title: job.title,
            description: job.description,
            location: job.location,
            url: job.url,
            date_posted: job.datePosted,
            scraped_at: admin.firestore.FieldValue.serverTimestamp(),
          }, {merge: true});
        }
      }
    }
    console.log("Szinkronizáció sikeresen befejeződött!");
  } catch (error) {
    console.error("Kritikus hiba a szinkronizálás során:", error);
  }
});

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
            const loc = (item.jobLocation && item.jobLocation.address && item.jobLocation.address.addressLocality) ? item.jobLocation.address.addressLocality : "Nincs megadva";
            const desc = item.description ? item.description.replace(/(<([^>]+)>)/gi, "").substring(0, 300) + "..." : "Nincs leírás";

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
    console.error("Hiba a " + url + " letöltésekor:", error.message);
  }

  return extractedJobs;
}