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
        // TELJES KÖRŰ ÉS RÉSZLETES KÉTNYELVŰ SZŰRŐ RENDSZER (Nincs egyszerűsítés!)
        // ==================================================================
        const titleLower = (job.title || "").toLowerCase();
        const expLower = (job.experience_level || "").toLowerCase();
        const typeLower = (job.employment_type || "").toLowerCase();
        const subLower = (job.subsidiary || "").toLowerCase();

        const textToCheck = `${titleLower} ${expLower} ${typeLower} ${subLower}`;

        // 1. SZIGORÚ NEGATÍV SZŰRŐ (Vezetői és magas szintű pozíciók kiszűrése)
        const negativeKeywords = [
          "szenior", "senior", "vezető", "head of", "director", 
          "igazgató", "principal", "chief", "executive", "team lead", "group lead"
        ];

        // Kivételkezelés: Ha a címben vagy adatokban kifejezetten szerepel a "junior" vagy "gyakornok", 
        // akkor a fenti negatív szavak ellenére is engedjük át (pl. "Junior Manager" vagy "Junior Team Lead").
        const isExplicitlyJuniorOrIntern = 
          textToCheck.includes("junior") || 
          textToCheck.includes("pályakezdő") || 
          textToCheck.includes("gyakornok") || 
          textToCheck.includes("intern");

        const isSeniorOrLeader = negativeKeywords.some(neg => textToCheck.includes(neg));

        if (isSeniorOrLeader && !isExplicitlyJuniorOrIntern) {
          continue; // Ha tiszta vezetői/senior pozíció, elutasítjuk
        }

        // 2. KÖTELEZŐ ÉS RÉSZLETES POZITÍV WHITELIST (Minden magyar és angol pályakezdő forma)
        const targetKeywords = [
          // --- MAGYAR GYAKORNOKI ÉS PÁLYAKEZDŐ FORMÁK ---
          "gyakornok", "gyakornoki", "diák", "egyetemista", "főiskolás",
          "pályakezdő", "friss diplomás", "junior", "kezdő",
          "tapasztalat nélkül", "pályakezdőknek", "kezdő pozíció",
          "0-1 év", "0-2 év", "0-3 év", "1-2 év", "1-3 év",
          "0-1 év tapasztalat", "1 év tapasztalat", "2 év tapasztalat", "3 év tapasztalat",

          // --- ANGOL ÉS MULTINACIONÁLIS FORMÁK (BOSCH, BANKOK, STB.) ---
          "intern", "internship", "trainee", "student", "student job",
          "entry level", "entry-level", "graduate", "fresh graduate",
          "young professional", "career start", "apprentice", "apprenticeship",
          "graduate program", "trainee program", "entry",
          "0-1 years", "0-2 years", "0-3 years", "1-2 years", "1-3 years",
          "0-1 yrs", "1-3 yrs", "1-2 yrs", "0-2 yrs"
        ];

        const matchesWhitelist = targetKeywords.some(keyword => textToCheck.includes(keyword));

        // Ha egyik whitelist feltétel sem teljesül, akkor nem engedjük be
        if (!matchesWhitelist) {
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