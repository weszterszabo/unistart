const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");

// ------------------------------------------------------------------
// 1. MOTOROK BETÖLTÉSE
// ------------------------------------------------------------------
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
  mol: require("./scrapers/mol"),
  posta: require("./scrapers/posta"),
  mvm: require("./scrapers/mvm"),
  kozszolgallas: require("./scrapers/kozszolgallas"),
  custom: require("./scrapers/custom")
};

// ------------------------------------------------------------------
// 2. FIREBASE INICIALIZÁLÁS ÉS BIZTONSÁG
// ------------------------------------------------------------------
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  } catch (e) {
    console.error("❌ FATAL: A FIREBASE_SERVICE_ACCOUNT_KEY nem érvényes JSON!");
    process.exit(1);
  }
} else {
  console.error("❌ FATAL: Hiányzik a FIREBASE_SERVICE_ACCOUNT_KEY!");
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true }); 

// ------------------------------------------------------------------
// 3. ENTERPRISE SEGÉDFÜGGVÉNYEK & WEBHOOK RIASZTÁS
// ------------------------------------------------------------------

// Opcionális Webhook (pl. Slack / Discord). Ha nincs beállítva, csak konzolba ír.
async function sendAlert(message, isError = false) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: (isError ? "🚨 **KRITIKUS HIBA:** " : "ℹ️ **INFO:** ") + message })
    });
  } catch (e) { /* Csendes hibakezelés a webhooknál */ }
}

// A: Exponenciális Újrapróbálkozás (Exponential Backoff)
async function scrapeWithExponentialBackoff(engine, companyName, url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const results = await engine.scrape(companyName, url);
      if (!Array.isArray(results)) throw new Error("A motor nem tömböt adott vissza!");
      return results;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = Math.pow(2, attempt) * 1000; 
      console.log(`   [${companyName}] ⚠️ Hálózat hiba. Újrapróbálkozás ${delay/1000}mp múlva...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

// B: Központi Adat-fertőtlenítő (Sanitizer)
function sanitizeJobData(job, companyName) {
  let cleanUrl = job.url || "";
  let cleanApplyUrl = job.apply_url || cleanUrl;
  if (cleanUrl && !cleanUrl.startsWith("http")) cleanUrl = "https://" + cleanUrl;
  if (cleanApplyUrl && !cleanApplyUrl.startsWith("http")) cleanApplyUrl = "https://" + cleanApplyUrl;

  return {
    company_name: companyName,
    title: (job.title || "Ismeretlen pozíció").replace(/\s+/g, ' ').trim(),
    location: (job.location || "Nincs megadva").replace(/\s+/g, ' ').trim(),
    url: cleanUrl,
    apply_url: cleanApplyUrl,
    date_posted: (job.date_posted && !isNaN(new Date(job.date_posted).getTime())) 
                 ? new Date(job.date_posted).toISOString() 
                 : new Date().toISOString(),
    employment_type: (job.employment_type || "").trim(),
    experience_level: (job.experience_level || "").trim(),
    faculty: job.faculty || "Egyéb",
    work_style: job.work_style || "",
    tags: Array.isArray(job.tags) ? [...new Set(job.tags)] : [], 
  };
}

// C: MD5 Hash Generátor (Delta-Sync Ujjlenyomat)
function generateJobHash(sanitizedJob) {
  const dataString = `${sanitizedJob.title}|${sanitizedJob.location}|${sanitizedJob.faculty}|${sanitizedJob.work_style}|${sanitizedJob.tags.join(",")}|${sanitizedJob.apply_url}`;
  return crypto.createHash('md5').update(dataString).digest('hex');
}

// D: Mikro-Változás Követés (Diffing)
function getJobDifferences(oldJob, newJob) {
  const changes = [];
  if (oldJob.faculty !== newJob.faculty) changes.push(`Kategória: ${oldJob.faculty} -> ${newJob.faculty}`);
  if (oldJob.work_style !== newJob.work_style) changes.push(`Vibe: ${oldJob.work_style} -> ${newJob.work_style}`);
  return changes;
}

// ------------------------------------------------------------------
// 4. FŐ ORCHESTRATOR (Multi-Threaded Pipeline + Data Lake)
// ------------------------------------------------------------------
async function runScraper() {
  console.log("\n======================================================");
  console.log("🚀 UniStart BIG DATA Orchestrator (V5.0) elindult...");
  console.log("⚙️  Párhuzamos feldolgozás & Történelmi Archiválás aktív!");
  console.log("======================================================\n");
  
  await sendAlert("🚀 UniStart Scraper folyamat elindult...");

  const stats = {
    startTime: Date.now(),
    companiesProcessed: 0,
    companiesFailed: 0,
    jobsFound: 0,
    jobsAdded: 0,
    jobsUpdated: 0,
    jobsUntouched: 0,
    jobsArchived: 0, // Törlés helyett!
    anomaliesDetected: 0
  };

  const errorLogs = [];

  try {
    const companiesSnapshot = await db.collection("companies").get();
    if (companiesSnapshot.empty) {
      console.log("⚠️ Nincs cég az adatbázisban.");
      process.exit(0);
    }

    // LÉTREHOZZUK A MUNKASORT (Queue)
    const companyQueue = [...companiesSnapshot.docs];
    
    // A WORKER LOGIKA
    const workerTask = async (workerId) => {
      while (companyQueue.length > 0) {
        const doc = companyQueue.shift();
        const companyId = doc.id;
        const company = doc.data();
        const engineName = company.engine || "custom";
        const engine = engines[engineName];

        if (!company.career_url) continue;
        
        const logPrefix = `[Worker-${workerId} | ${company.name}]`;
        console.log(`\n${logPrefix} 🏢 Motor: ${engineName.toUpperCase()} indítása...`);

        if (!engine) {
          console.log(`${logPrefix} ❌ Hiba: Nem létező motor!`);
          stats.companiesFailed++;
          errorLogs.push({ company: company.name, error: "Missing engine: " + engineName });
          continue;
        }

        try {
          stats.companiesProcessed++;
          
          // 1. Meglévő állások letöltése a Delta-Sync-hez
          const existingJobsSnapshot = await db.collection("jobs").where("company_id", "==", companyId).get();
          const existingJobsMap = new Map();
          existingJobsSnapshot.forEach(d => existingJobsMap.set(d.id, d.data()));

          // 2. Friss adatok letöltése
          let scrapedJobs = await scrapeWithExponentialBackoff(engine, company.name, company.career_url);
          stats.jobsFound += scrapedJobs.length;

          // 3. 🚨 ADATMÉRGEZÉS DETEKTOR (Anomaly Detection)
          let skipDeletion = false;
          let skipProcessing = false;

          // Anomália 1: Pánik üzemmód (Circuit Breaker)
          if (existingJobsSnapshot.size > 15 && scrapedJobs.length < (existingJobsSnapshot.size * 0.3)) {
            const msg = `${logPrefix} 🚨 ANOMÁLIA: Gyanús állás-csökkenés! Tömeges archiválás blokkolva.`;
            console.log(msg);
            await sendAlert(msg, true);
            skipDeletion = true;
            stats.anomaliesDetected++;
            errorLogs.push({ company: company.name, error: "Circuit Breaker Tripped." });
          }

          // Anomália 2: Duplikációs Támadás
          const validUrls = new Set(scrapedJobs.map(j => j.url).filter(Boolean));
          if (scrapedJobs.length > 10 && validUrls.size < (scrapedJobs.length * 0.4)) {
            const msg = `${logPrefix} 🚨 ANOMÁLIA: Túl sok duplikált URL (Adatmérgezés)! Cég blokkolva.`;
            console.log(msg);
            await sendAlert(msg, true);
            skipProcessing = true;
            stats.anomaliesDetected++;
            errorLogs.push({ company: company.name, error: "Data Poisoning Detected." });
          }

          if (skipProcessing) {
            scrapedJobs = null; // Memória felszabadítása
            continue; 
          }

          // 4. ADAT FELDOLGOZÁS ÉS DELTA-SYNC
          const batch = db.batch();
          let batchCount = 0;
          let cAdded = 0, cUpdated = 0, cUntouched = 0, cArchived = 0;

          const freshJobIds = new Set(); 

          for (const rawJob of scrapedJobs) {
            if (!rawJob.title) continue;

            const jobIdentityString = rawJob.url || (company.name + rawJob.title);
            const jobId = crypto.createHash('md5').update(jobIdentityString).digest('hex');
            
            freshJobIds.add(jobId);
            const sanitizedJob = sanitizeJobData(rawJob, company.name);
            sanitizedJob.company_id = companyId;
            const newHash = generateJobHash(sanitizedJob);

            if (existingJobsMap.has(jobId)) {
              const oldJob = existingJobsMap.get(jobId);
              const oldHash = oldJob.data_hash || "";

              if (newHash !== oldHash) {
                // Elemzés: Mi változott pontosan?
                const changes = getJobDifferences(oldJob, sanitizedJob);
                if (changes.length > 0) {
                    sanitizedJob.last_changes = changes; // Elmentjük az adatbázisba a változás tényét!
                }
                
                sanitizedJob.data_hash = newHash;
                sanitizedJob.updated_at = FieldValue.serverTimestamp();
                batch.set(db.collection("jobs").doc(jobId), sanitizedJob, { merge: true });
                batchCount++; cUpdated++; stats.jobsUpdated++;
              } else {
                cUntouched++; stats.jobsUntouched++;
              }
            } else {
              sanitizedJob.data_hash = newHash;
              sanitizedJob.scraped_at = FieldValue.serverTimestamp();
              batch.set(db.collection("jobs").doc(jobId), sanitizedJob);
              batchCount++; cAdded++; stats.jobsAdded++;
            }

            if (batchCount >= 450) { await batch.commit(); batchCount = 0; }
          }

          // 5. 🏛️ TÖRTÉNELMI ADATTREZOR (Archiválás Törlés Helyett)
          if (!skipDeletion) {
            for (const [existingJobId, oldJobData] of existingJobsMap.entries()) {
              if (!freshJobIds.has(existingJobId)) {
                // Ahelyett, hogy törölnénk, átmásoljuk a jobs_archive kollekcióba!
                const archivedJob = {
                    ...oldJobData,
                    archived_at: FieldValue.serverTimestamp(),
                    is_active: false
                };
                
                // MENTÉS AZ ARCHÍVUMBA
                batch.set(db.collection("jobs_archive").doc(existingJobId), archivedJob);
                // TÖRLÉS AZ AKTÍV ÁLLÁSOK KÖZÜL (Hogy eltűnjön a weboldaladról)
                batch.delete(db.collection("jobs").doc(existingJobId));
                
                batchCount += 2; // 2 művelet történik
                cArchived++; stats.jobsArchived++;
                
                if (batchCount >= 450) { await batch.commit(); batchCount = 0; }
              }
            }
          }

          if (batchCount > 0) await batch.commit();
          
          console.log(`${logPrefix} ✅ Kész! Talált: ${scrapedJobs.length} | Új: ${cAdded} | Frissült: ${cUpdated} | Érintetlen: ${cUntouched} | Archivált: ${cArchived}`);

          // Memória felszabadítás (Garbage Collection támogatása)
          existingJobsMap.clear();
          freshJobIds.clear();
          scrapedJobs = null;

        } catch (engineError) {
          console.error(`${logPrefix} ❌ Végzetes Hiba:`, engineError.message);
          stats.companiesFailed++;
          errorLogs.push({ company: company.name, error: engineError.message });
          await sendAlert(`Hiba a(z) ${company.name} feldolgozása közben: ${engineError.message}`, true);
        }
      }
    };

    // A MUNKÁSOK INDÍTÁSA (Párhuzamosítás: MAX 3 CÉG EGYSZERRE)
    const CONCURRENCY_LIMIT = 3;
    const workers = [];
    for (let i = 1; i <= CONCURRENCY_LIMIT; i++) {
      workers.push(workerTask(i));
    }
    
    await Promise.all(workers);

    // ------------------------------------------------------------------
    // 6. TELEMETRIA FELTÖLTÉSE A FIREBASE-BE (Live Health Dashboard)
    // ------------------------------------------------------------------
    const executionTimeSec = parseFloat(((Date.now() - stats.startTime) / 1000).toFixed(1));
    stats.executionTimeSec = executionTimeSec;
    
    const systemStatus = {
        last_run: FieldValue.serverTimestamp(),
        status: stats.companiesFailed > 0 || stats.anomaliesDetected > 0 ? "warning" : "healthy",
        metrics: stats,
        recent_errors: errorLogs.slice(0, 10) 
    };

    await db.collection("system_logs").doc("scraper_health").set(systemStatus);

    // ------------------------------------------------------------------
    // 7. ZÁRÓJELENTÉS
    // ------------------------------------------------------------------
    console.log("\n======================================================");
    console.log("🏁 SZINKRONIZÁCIÓ BEFEJEZŐDÖTT");
    console.log("======================================================");
    console.log(`⏱️ Párhuzamos futási idő: ${executionTimeSec} mp (Gyorsítva!)`);
    console.log(`🏢 Vizsgált cégek:    ${stats.companiesProcessed} db (Hiba: ${stats.companiesFailed})`);
    console.log(`🚨 Kiszűrt Anomáliák: ${stats.anomaliesDetected} db (Védelem aktív)`);
    console.log("------------------------------------------------------");
    console.log(`✨ Újként mentve:     ${stats.jobsAdded} db`);
    console.log(`🔄 Frissítve (Delta): ${stats.jobsUpdated} db`);
    console.log(`😴 Érintetlen:        ${stats.jobsUntouched} db (Sávszélesség spórolva)`);
    console.log(`🏛️ Archívumba rakva:  ${stats.jobsArchived} db (Történelmi adatbázis nőtt)`);
    console.log("======================================================\n");
    console.log("📡 Rendszerállapot feltöltve a Firebase [system_logs/scraper_health] dokumentumba!");
    
    await sendAlert(`✅ Szinkronizáció befejezve. Új állások: ${stats.jobsAdded}, Archivált: ${stats.jobsArchived}. Futási idő: ${executionTimeSec}s.`);

    process.exit(0);

  } catch (error) {
    console.error("❌ Kritikus hiba az Orchestrator folyamatban:", error);
    await sendAlert(`Kritikus rendszerhiba az Orchestratorban: ${error.message}`, true);
    process.exit(1);
  }
}

// Indítás
runScraper();