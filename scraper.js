const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
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
  console.error("❌ Hiba: A FIREBASE_SERVICE_ACCOUNT_KEY hiányzik!");
  process.exit(1);
}

// 🌟 MODULÁRIS FIREBASE INICIALIZÁLÁS
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true }); 

async function runScraper() {
  console.log("🚀 UniStart Multi-Engine Scraper elindult...\n");
  try {
    const companiesSnapshot = await db.collection("companies").get();
    if (companiesSnapshot.empty) {
      console.log("⚠️ Nincsenek cégek a 'companies' gyűjteményben.");
      process.exit(0);
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

      // 🛡️ BELSŐ TRY-CATCH: Ha egy cég motorja elszáll, a folyamat NEM áll le, csak ugrik a következőre!
      try {
        const scrapedJobs = await engine.scrape(company.name, company.career_url);
        console.log(`✅ Kapott állások a motortól: ${scrapedJobs.length} db`);

        if (scrapedJobs.length === 0) {
          console.log("⚠️ Nulla állás érkezett. Kihagyjuk a mentést és a törlést!");
          continue;
        }

        // ==================================================================
        // 1. DUPLIKÁCIÓ SZŰRÉS ÉS ELŐKÉSZÍTÉS
        // ==================================================================
        const freshJobIds = new Set();
        const uniqueJobs = [];

        for (const job of scrapedJobs) {
          const rawString = job.url || company.name + job.title;
          const jobId = crypto.createHash('md5').update(rawString).digest('hex');
          
          if (!freshJobIds.has(jobId)) {
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
              
              // 🌟 AZ ÚJ "OKOS" CÍMKÉK BEKÖTÉSE
              faculty: job.faculty || "Egyéb",
              work_style: job.work_style || "",
              tags: job.tags || [],
              
              // 🌟 ÚJ FIRESTORE FIELDVALUE HÍVÁSOK
              scraped_at: FieldValue.serverTimestamp(),
              
              short_description: FieldValue.delete(),
              long_description: FieldValue.delete(),
              description: FieldValue.delete()
            };
            
            uniqueJobs.push({ jobId, finalJob });
          }
        }

        console.log(`   ⏳ Mentés indul: ${uniqueJobs.length} db egyedi állás...`);

        // ==================================================================
        // 2. VILLÁMGYORS PÁRHUZAMOS MENTÉS
        // ==================================================================
        const chunkSize = 250; 
        
        for (let i = 0; i < uniqueJobs.length; i += chunkSize) {
          const chunk = uniqueJobs.slice(i, i + chunkSize);
          await Promise.all(chunk.map(item => 
              db.collection("jobs").doc(item.jobId).set(item.finalJob, { merge: true })
          ));
        }
        console.log(`   💾 Gyorsmentés kész!`);

        // ==================================================================
        // 3. LEJÁRT ÁLLÁSOK TÖRLÉSE
        // ==================================================================
        const existingJobsSnapshot = await db.collection("jobs").where("company_id", "==", companyId).get();
        
        const docsToDelete = [];
        for (const jobDoc of existingJobsSnapshot.docs) {
          if (!freshJobIds.has(jobDoc.id)) {
            docsToDelete.push(jobDoc.ref);
          }
        }

        if (docsToDelete.length > 0) {
          for (let i = 0; i < docsToDelete.length; i += chunkSize) {
            const deleteChunk = docsToDelete.slice(i, i + chunkSize);
            await Promise.all(deleteChunk.map(ref => ref.delete()));
          }
          console.log(`   🗑️ Takarítás: ${docsToDelete.length} db lejárt állás törölve.`);
        } else {
          console.log(`   ✔️ Nincs törlendő lejárt állás.`);
        }

      } catch (engineError) {
        console.error(`❌ Hiba a(z) ${company.name} feldolgozása közben:`, engineError.message);
        console.log("⚠️ Ugrás a következő cégre a folyamat megszakítása nélkül...");
      }
    }
    
    console.log("\n🎉 Szinkronizáció sikeresen befejeződött!");
    
    // 🛑 KÖTELEZŐ: Ezzel zárjuk le a folyamatot, hogy a GitHub Action ne ragadjon be!
    process.exit(0);

  } catch (error) {
    console.error("❌ Kritikus hiba történt a fő folyamatban:", error);
    process.exit(1);
  }
}

runScraper();