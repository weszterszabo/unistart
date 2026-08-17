const admin = require("firebase-admin");
const crypto = require("crypto");

const engines = {
  sap: require("./scrapers/sap"),
  smartrecruiters: require("./scrapers/smartrecruiters"),
  workday: require("./scrapers/workday"),
  erste: require("./scrapers/erste"),
  custom: require("./scrapers/custom")
};

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} else {
  console.error("Hiba: A FIREBASE_SERVICE_ACCOUNT_KEY hiányzik!");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true }); 

async function runScraper() {
  console.log("🚀 UniStart Multi-Engine Scraper elindult...\n");
  try {
    const companiesSnapshot = await db.collection("companies").get();
    if (companiesSnapshot.empty) {
      console.log("⚠️ Nincsenek cégek a 'companies' gyűjteményben.");
      return;
    }

    for (const doc of companiesSnapshot.docs) {
      const companyId = doc.id;
      const company = doc.data();
      const engineName = company.engine || "custom";
      const engine = engines[engineName];

      if (!company.career_url) continue;

      console.log(`\n======================================================`);
      console.log(`🏢 Cég: ${company.name || "Névtelen"} | Motor: [${engineName.toUpperCase()}]`);
      console.log(`🔗 URL: ${company.career_url}`);
      
      if (!engine) {
        console.log(`❌ Hiba: Nem létező motor (${engineName})!`);
        continue;
      }

      const scrapedJobs = await engine.scrape(company.name, company.career_url);
      console.log(`✅ Kapott állások a motortól: ${scrapedJobs.length} db`);

      if (scrapedJobs.length === 0) {
        console.log("⚠️ Nulla állás érkezett. Kihagyjuk a törlést!");
        continue;
      }

      const freshJobIds = new Set();

      for (const job of scrapedJobs) {
        // ==================================================================
        // BIZALMAS & TELJES KÖRŰ KÉTNYELVŰ (MAGYAR / ANGOL) SZŰRŐ
        // ==================================================================
        const titleLower = (job.title || "").toLowerCase();
        const expLower = (job.experience_level || "").toLowerCase();
        const typeLower = (job.employment_type || "").toLowerCase();
        const subLower = (job.subsidiary || "").toLowerCase();

        const textToCheck = `${titleLower} ${expLower} ${typeLower} ${subLower}`;

        // 1. TILTÓLISTA (Magyar és angol vezetői / senior / tapasztalt pozíciók)
        const negativeKeywords = [
          "szenior", "senior", "vezető", "head", "director", 
          "igazgató", "principal", "chief", "manager", "lead"
        ];
        const isSeniorOrLeader = negativeKeywords.some(neg => textToCheck.includes(neg));

        if (isSeniorOrLeader) {
          continue; // Ha vezetői vagy senior jellegű, átugorjuk
        }

        // 2. ENGEDÉLYEZETT KULCSSZAVAK (Magyar + Angol formák minden variációban)
        const targetKeywords = [
          // --- MAGYAR FORMÁK ---
          "gyakornok", "gyakornoki", "diák", "egyetemista",
          "pályakezdő", "friss diplomás", "junior", "kezdő",
          "tapasztalat nélkül", "0-1 év", "0-2 év", "0-3 év", "1-2 év", "1-3 év",
          
          // --- ANGOL FORMÁK ---
          "intern", "internship", "trainee", "student", "student job",
          "entry level", "entry-level", "graduate", "fresh graduate",
          "apprentice", "apprenticeship",
          "0-1 years", "0-2 years", "0-3 years", "1-2 years", "1-3 years",
          "0-1 yrs", "1-3 yrs"
        ];

        const isEntryLevel = targetKeywords.some(keyword => textToCheck.includes(keyword));

        // Ha egyik kategóriába sem esik bele, átugorjuk
        if (!isEntryLevel) {
          continue; 
        }
        // ==================================================================

        const rawString = job.url || company.name + job.title;
        const jobId = crypto.createHash('md5').update(rawString).digest('hex');
        freshJobIds.add(jobId);

        let finalJob = {
          company_id: companyId,
          company_name: company.name || "Névtelen cég",
          title: job.title || "Névtelen pozíció",
          location: job.location || "Nincs megadva",
          url: job.url,
          apply_url: job.apply_url || job.url,
          date_posted: job.date_posted || new Date().toISOString(),
          employment_type: job.employment_type || "",
          experience_level: job.experience_level || "",
          subsidiary: job.subsidiary || "",
          scraped_at: admin.firestore.FieldValue.serverTimestamp(),
          
          short_description: admin.firestore.FieldValue.delete(),
          long_description: admin.firestore.FieldValue.delete(),
          description: admin.firestore.FieldValue.delete()
        };

        await db.collection("jobs").doc(jobId).set(finalJob, { merge: true });
      }

      const existingJobsSnapshot = await db.collection("jobs").where("company_id", "==", companyId).get();
      let deletedCount = 0;
      for (const jobDoc of existingJobsSnapshot.docs) {
        if (!freshJobIds.has(jobDoc.id)) {
          await db.collection("jobs").doc(jobDoc.id).delete();
          deletedCount++;
        }
      }
      if (deletedCount > 0) {
        console.log(`🗑️ Takarítás: ${deletedCount} db lejárt állás törölve.`);
      }
    }
    
    console.log("\n🎉 Szinkronizáció sikeresen befejeződött!");
  } catch (error) {
    console.error("❌ Kritikus hiba történt:", error);
    process.exit(1);
  }
}

runScraper();