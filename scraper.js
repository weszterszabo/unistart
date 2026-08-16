const admin = require("firebase-admin");
const cheerio = require("cheerio");

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

async function runScraper() {
  console.log("🚀 Állásgyűjtő szkript elindult...");
  try {
    const companiesSnapshot = await db.collection("companies").get();
    if (companiesSnapshot.empty) {
      console.log("⚠️ Nincsenek cégek a 'companies' gyűjteményben.");
      return;
    }

    for (const doc of companiesSnapshot.docs) {
      const company = doc.data();
      if (company.career_url) {
        console.log(`🔍 Feldolgozás: ${company.name || "Cég"} -> ${company.career_url}`);
        const frissAllasok = await scrapeJobsFromUrl(company.career_url);
        console.log(`✅ Talált állások: ${frissAllasok.length} db`);

        for (const job of frissAllasok) {
          const jobId = (job.url || company.name + job.title).replace(/[^a-zA-Z0-9]/g, "").substring(0, 50);
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
    console.error("❌ Hiba történt:", error);
    process.exit(1);
  }
}

async function scrapeJobsFromUrl(url) {
  const extractedJobs = [];
  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json, application/rss+xml, text/html, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });

    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();

    if (contentType.includes("application/json") || rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
      console.log("   📡 JSON API válasz észlelve...");
      try {
        const data = JSON.parse(rawText);
        let jobArray = Array.isArray(data) ? data : data.items || data.results || data.data || data.jobs || [];
        jobArray.forEach(item => {
          extractedJobs.push({
            title: item.title || item.name || item.jobTitle || "Névtelen",
            url: item.url || item.applyUrl || url,
            location: item.location || item.city || "Nincs megadva",
            datePosted: item.datePosted || new Date().toISOString(),
            description: (item.description || "").replace(/(<([^>]+)>)/gi, "").substring(0, 300) + "..."
          });
        });
        return extractedJobs;
      } catch (e) {}
    }

    if (rawText.includes('<?xml') || rawText.includes('<rss') || rawText.includes('<feed')) {
      console.log("   🧲 RSS/XML feed észlelve (Nagyvállalati mód)...");
      const $ = cheerio.load(rawText, { xmlMode: true });
      $('item, entry').each((i, el) => {
        extractedJobs.push({
          title: $(el).find('title').text().trim() || "Névtelen",
          url: $(el).find('link').text().trim() || url,
          location: "Magyarország",
          datePosted: $(el).find('pubDate, updated').text() || new Date().toISOString(),
          description: $(el).find('description, summary').text().replace(/(<([^>]+)>)/gi, "").substring(0, 300) + "..."
        });
      });
      if (extractedJobs.length > 0) return extractedJobs;
    }

    console.log("   📄 HTML weboldal észlelve...");
    const $ = cheerio.load(rawText);
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const data = JSON.parse($(el).html());
        const items = Array.isArray(data) ? data : [data];
        items.forEach((item) => {
          if (item["@type"] === "JobPosting") {
            extractedJobs.push({
              title: item.title || "Névtelen",
              url: item.url || url,
              location: item.jobLocation?.address?.addressLocality || "Nincs",
              datePosted: item.datePosted || new Date().toISOString(),
              description: item.description ? item.description.replace(/(<([^>]+)>)/gi, "").substring(0, 300) + "..." : "",
            });
          }
        });
      } catch (err) {}
    });
    if (extractedJobs.length > 0) return extractedJobs;

    console.log("   ⚠️ Okos HTML Fallback indítása...");
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (href && (href.includes('/job/') || href.includes('/position/')) && text.length > 5) {
        extractedJobs.push({
          title: text,
          url: href.startsWith('http') ? href : new URL(href, url).href,
          location: "Részletek a linken",
          datePosted: new Date().toISOString(),
          description: "Kattints a hirdetésre a részletekért..."
        });
      }
    });

    return extractedJobs.filter((v, i, a) => a.findIndex(t => (t.url === v.url)) === i);
  } catch (error) {
    console.error(`❌ Hiba:`, error.message);
    return [];
  }
}
runScraper();
