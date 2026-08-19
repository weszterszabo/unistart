const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// 1. Firebase hitelesítés (ugyanaz, mint a scraper.js-ben)
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} else {
  console.error("❌ Hiba: A FIREBASE_SERVICE_ACCOUNT_KEY hiányzik!");
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function deleteSiemensJobs() {
  console.log("🧹 Siemens állások törlése indul a Firebase-ből...\n");
  
  try {
    // 2. Lekérjük az összes állást, ahol a cégnév "Siemens"
    // Ha a 'companies' kollekciódban más a pontos neve (pl. "Siemens Zrt."), akkor azt írd ide!
    const targetCompanyName = "Siemens"; 
    
    const jobsSnapshot = await db.collection("jobs")
        .where("company_name", "==", targetCompanyName)
        .get();

    if (jobsSnapshot.empty) {
      console.log(`✔️ Nincs egyetlen '${targetCompanyName}' állás sem az adatbázisban.`);
      process.exit(0);
    }

    console.log(`🔎 Talált állások száma: ${jobsSnapshot.size} db. Törlés (Batch) folyamatban...`);

    // 3. Biztonságos, kötegelt törlés (Batch)
    const batchSize = 400; // Firebase limit miatt
    const docs = jobsSnapshot.docs;
    
    for (let i = 0; i < docs.length; i += batchSize) {
        const batch = db.batch();
        const chunk = docs.slice(i, i + batchSize);
        
        chunk.forEach(doc => {
            batch.delete(doc.ref); // Belerakjuk a dobozba a törlendő dokumentumot
        });
        
        await batch.commit(); // Egyetlen kéréssel töröljük a doboz tartalmát
    }

    console.log(`✅ Sikeresen törölve ${jobsSnapshot.size} db '${targetCompanyName}' állás!`);
    process.exit(0);
    
  } catch (error) {
    console.error("❌ Hiba történt a törlés során:", error);
    process.exit(1);
  }
}

deleteSiemensJobs();