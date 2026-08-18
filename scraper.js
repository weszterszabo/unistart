const admin = require("firebase-admin");
const crypto = require("crypto");

const engines = {
  sap: require("./scrapers/sap"),
  smartrecruiters: require("./scrapers/smartrecruiters"),
  workday: require("./scrapers/workday"),
  erste: require("./scrapers/erste"),
  otp: require("./scrapers/otp"),
  khbank: require("./scrapers/khbank"),
  aldi: require("./scrapers/aldi"),
  lidl: require("./scrapers/lidl"),
  telekom: require("./scrapers/telekom"),
  fourig: require("./scrapers/fourig"),
  siemens: require("./scrapers/siemens"),
  mol: require("./scrapers/mol"),
  posta: require("./scrapers/posta"),
  mvm: require("./scrapers/mvm"),
  kozszolgallas: require("./scrapers/kozszolgallas"),
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

      // ==================================================================
      // 1. DUPLIKÁCIÓ SZŰRÉS (Lidl és Aldi védelem)
      // ==================================================================
      const freshJobIds = new Set();
      const uniqueJobs = [];

      for (const job of scrapedJobs) {
        const rawString = job.url || company.name + job.title;
        const jobId = crypto.createHash('md5').update(rawString).digest('hex');
        
        // Ha ezt az ID-t már hozzáadtuk a listához, átugorjuk!
        if (!freshJobIds.has(jobId)) {
          freshJobIds.add(jobId);
          uniqueJobs.push({ job, jobId });
        }
      }

      // ==================================================================
      // 2. BATCH (CSOPORTOS) MENTÉS - 500-ASÁVAL
      // ==================================================================
      let writeBatch = db.batch();
      let writeCount = 0;
      let totalWritten = 0;

      for (const item of uniqueJobs) {
        const job = item.job;
        const jobId = item.jobId;

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

        const docRef = db.collection("jobs").doc(jobId);
        writeBatch.set(docRef, finalJob, { merge: true });
        
        writeCount++;
        totalWritten++;

        // Ha elértük az 500-at, elküldjük a csomagot a Firebase-nek
        if (writeCount === 500) {
          await writeBatch.commit();
          writeBatch = db.batch(); 
          writeCount = 0;
        }
      }

      // Maradék állások mentése
      if (writeCount > 0) {
        await writeBatch.commit();
      }
      
      console.log(`💾 Gyorsmentés kész: ${totalWritten} db EGYEDI állás feltöltve/frissítve.`);

      // ==================================================================
      // 3. BATCH (CSOPORTOS) TÖRLÉS - 500-ASÁVAL
      // ==================================================================
      const existingJobsSnapshot = await db.collection("jobs").where("company_id", "==", companyId).get();
      
      let deleteBatch = db.batch();
      let deleteCount = 0;
      let totalDeleted = 0;

      for (const jobDoc of existingJobsSnapshot.docs) {
        if (!freshJobIds.has(jobDoc.id)) {
          deleteBatch.delete(jobDoc.ref);
          deleteCount++;
          totalDeleted++;

          if (deleteCount === 500) {
            await deleteBatch.commit();
            deleteBatch = db.batch(); 
            deleteCount = 0;
          }
        }
      }
      
      // Maradék törlések végrehajtása
      if (deleteCount > 0) {
        await deleteBatch.commit();
      }

      if (totalDeleted > 0) {
        console.log(`🗑️ Takarítás: ${totalDeleted} db lejárt állás törölve.`);
      } else {
        console.log(`✔️ Nincs törlendő lejárt állás.`);
      }
    }
    
    console.log("\n🎉 Szinkronizáció sikeresen befejeződött!");
  } catch (error) {
    console.error("❌ Kritikus hiba történt:", error);
    process.exit(1);
  }
}

runScraper();