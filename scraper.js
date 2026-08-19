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
// 2. FIREBASE INICIALIZÁLÁS ÉS BIZTONSÁG (HIBRID MÓD)
// ------------------------------------------------------------------
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    console.log("☁️ Felhős biztonsági kulcs (Env Var) sikeresen betöltve.");
  } catch (e) {
    console.error("❌ FATAL: A FIREBASE_SERVICE_ACCOUNT_KEY nem érvényes JSON!");
    process.exit(1);
  }
} else {
  try {
    serviceAccount = require("./serviceAccountKey.json"); 
    console.log("💻 Lokális 'serviceAccountKey.json' fájl sikeresen betöltve.");
  } catch (err) {
    console.error("❌ FATAL: Nincs felhős kulcs, ÉS nem található a 'serviceAccountKey.json' fájl a mappában!");
    process.exit(1);
  }
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true }); 

// ------------------------------------------------------------------
// 3. ENTERPRISE SEGÉDFÜGGVÉNYEK & WEBHOOK RIASZTÁS
// ------------------------------------------------------------------

async function sendAlert(message, isError = false) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: (isError ? "🚨 **KRITIKUS HIBA:** " : "ℹ️ **INFO:** ") + message })
    });
  } catch (e) { /* Csendes hibakezelés */ }
}

async function scrapeWithExponentialBackoff(engine, companyName, url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const results = await engine.scrape(companyName, url);
      if (!Array.isArray(results)) throw new Error("A motor nem tömböt adott vissza!");
      return results;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 1000); 
      console.log(`   [${companyName}] ⚠️ Hálózat hiba. Újrapróbálkozás ${Math.round(delay/1000)}mp múlva...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

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

function generateJobHash(sanitizedJob) {
  const dataString = `${sanitizedJob.title}|${sanitizedJob.location}|${sanitizedJob.faculty}|${sanitizedJob.work_style}|${sanitizedJob.tags.join(",")}|${sanitizedJob.apply_url}`;
  return crypto.createHash('md5').update(dataString).digest('hex');
}

// Univerzális Deep-Diffing (Minden kulcsmező vizsgálata)
function getJobDifferences(oldJob, newJob) {
  const changes = [];
  const fieldsToCheck = [
      { key: 'title', label: 'Cím' },
      { key: 'location', label: 'Helyszín' },
      { key: 'faculty', label: 'Kategória' },
      { key: 'work_style', label: 'Vibe' }
  ];
  
  for (const field of fieldsToCheck) {
      if (oldJob[field.key] !== newJob[field.key]) {
          changes.push(`${field.label}: "${oldJob[field.key]}" -> "${newJob[field.key]}"`);
      }
  }
  return changes;
}

// ------------------------------------------------------------------
// 4. FŐ ORCHESTRATOR (Multi-Threaded Pipeline + Data Lake)
// ------------------------------------------------------------------

// Globális leállás-figyelő (Graceful Shutdown)
let isShuttingDown = false;
process.on('SIGINT', () => { console.log("\n⚠️ [SIGINT] Leállítási kérelem érkezett! Befejezem a mentéseket..."); isShuttingDown = true; });
process.on('SIGTERM', () => { console.log("\n⚠️ [SIGTERM] Leállítási kérelem érkezett! Befejezem a mentéseket..."); isShuttingDown = true; });

async function runScraper() {
  console.log("\n======================================================");
  console.log("🚀 UniStart UNICORN Orchestrator (V6.0) elindult...");
  console.log("⚙️  Párhuzamos feldolgozás & Deep-Diffing & Auto-Heal aktív!");
  console.log("======================================================\n");
  
  await sendAlert("🚀 UniStart V6 Scraper folyamat elindult...");

  const stats = {
    startTime: Date.now(),
    companiesProcessed: 0,
    companiesFailed: 0,
    jobsFound: 0,
    jobsAdded: 0,
    jobsUpdated: 0,
    jobsUntouched: 0,
    jobsArchived: 0,
    anomaliesDetected: 0
  };

  const errorLogs = [];

  try {
    const companiesSnapshot = await db.collection("companies").get();
    if (companiesSnapshot.empty) {
      console.log("⚠️ Nincs cég az adatbázisban.");
      process.exit(0);
    }

    const companyQueue = [...companiesSnapshot.docs];
    
    // WORKER LOGIKA
    const workerTask = async (workerId) => {
      while (companyQueue.length > 0) {
        if (isShuttingDown) {
            console.log(`[Worker-${workerId}] 🛑 Leállás megszakítva a biztonságos kilépéshez.`);
            break;
        }

        const doc = companyQueue.shift();
        const companyId = doc.id;
        const company = doc.data();
        const engineName = company.engine || "custom";
        const engine = engines[engineName];

        if (!company.career_url) continue;
        
        // Thundering Herd Védelem: Véletlenszerű 0-1.5mp csúsztatás indításkor
        const jitter = Math.floor(Math.random() * 1500);
        await new Promise(res => setTimeout(res, jitter));

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
          
          const existingJobsSnapshot = await db.collection("jobs").where("company_id", "==", companyId).get();
          const existingJobsMap = new Map();
          existingJobsSnapshot.forEach(d => existingJobsMap.set(d.id, d.data()));

          let scrapedJobs = await scrapeWithExponentialBackoff(engine, company.name, company.career_url);
          stats.jobsFound += scrapedJobs.length;

          // 🚨 ADATMÉRGEZÉS DETEKTOR
          let skipDeletion = false;
          let skipProcessing = false;

          // ⚠️ ITT VAN KIKAPCSOLVA AZ ANOMÁLIA 1 A NAGY TAKARÍTÁSHOZ (false && ...)
          if (false && existingJobsSnapshot.size > 15 && scrapedJobs.length < (existingJobsSnapshot.size * 0.3)) {
            const msg = `${logPrefix} 🚨 ANOMÁLIA: Gyanús állás-csökkenés! Tömeges archiválás blokkolva.`;
            console.log(msg);
            await sendAlert(msg, true);
            skipDeletion = true;
            stats.anomaliesDetected++;
            errorLogs.push({ company: company.name, error: "Circuit Breaker Tripped." });
          }

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
            scrapedJobs = null; 
            continue; 
          }

          // ADAT FELDOLGOZÁS ÉS DELTA-SYNC
          let batch = db.batch(); // 🚨 JAVÍTVA: const helyett let
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
                const changes = getJobDifferences(oldJob, sanitizedJob);
                if (changes.length > 0) sanitizedJob.last_changes = changes;
                
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

            // 🚨 JAVÍTÁS: Csomag lezárása ÉS új doboz nyitása!
            if (batchCount >= 450) { 
                await batch.commit(); 
                batch = db.batch(); 
                batchCount = 0; 
            }
          }

          // 🏛️ TÖRTÉNELMI ADATTREZOR
          if (!skipDeletion) {
            for (const [existingJobId, oldJobData] of existingJobsMap.entries()) {
              if (!freshJobIds.has(existingJobId)) {
                const archivedJob = {
                    ...oldJobData,
                    archived_at: FieldValue.serverTimestamp(),
                    is_active: false
                };
                
                batch.set(db.collection("jobs_archive").doc(existingJobId), archivedJob);
                batch.delete(db.collection("jobs").doc(existingJobId));
                
                batchCount += 2; 
                cArchived++; stats.jobsArchived++;
                
                // 🚨 JAVÍTÁS: Itt is új doboz kell a lezárás után!
                if (batchCount >= 450) { 
                    await batch.commit(); 
                    batch = db.batch(); 
                    batchCount = 0; 
                }
              }
            }
          }

          if (batchCount > 0) await batch.commit();
          
          console.log(`${logPrefix} ✅ Kész! Új: ${cAdded} | Frissült: ${cUpdated} | Érintetlen: ${cUntouched} | Archivált: ${cArchived}`);

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

    // A MUNKÁSOK INDÍTÁSA
    const CONCURRENCY_LIMIT = 3;
    const workers = [];
    for (let i = 1; i <= CONCURRENCY_LIMIT; i++) {
      workers.push(workerTask(i));
    }
    
    await Promise.all(workers);

    // ------------------------------------------------------------------
    // 6. TELEMETRIA FELTÖLTÉSE A FIREBASE-BE
    // ------------------------------------------------------------------
    const executionTimeSec = parseFloat(((Date.now() - stats.startTime) / 1000).toFixed(1));
    stats.executionTimeSec = executionTimeSec;
    
    // RAM Használat mérése
    const usedMemoryMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    
    const systemStatus = {
        last_run: FieldValue.serverTimestamp(),
        status: stats.companiesFailed > 0 || stats.anomaliesDetected > 0 ? "warning" : "healthy",
        metrics: { ...stats, peakMemoryMB: usedMemoryMB },
        recent_errors: errorLogs.slice(0, 10) 
    };

    await db.collection("system_logs").doc("scraper_health").set(systemStatus);

    // ------------------------------------------------------------------
    // 7. ZÁRÓJELENTÉS
    // ------------------------------------------------------------------
    console.log("\n======================================================");
    console.log("🏁 SZINKRONIZÁCIÓ BEFEJEZŐDÖTT");
    console.log("======================================================");
    console.log(`⏱️ Futási idő:        ${executionTimeSec} mp`);
    console.log(`🧠 Memória használat: ${usedMemoryMB} MB (Tiszta!)`);
    console.log(`🏢 Vizsgált cégek:    ${stats.companiesProcessed} db (Hiba: ${stats.companiesFailed})`);
    console.log(`🚨 Kiszűrt Anomáliák: ${stats.anomaliesDetected} db`);
    console.log("------------------------------------------------------");
    console.log(`✨ Újként mentve:     ${stats.jobsAdded} db`);
    console.log(`🔄 Frissítve (Delta): ${stats.jobsUpdated} db`);
    console.log(`😴 Érintetlen:        ${stats.jobsUntouched} db`);
    console.log(`🏛️ Archívumba rakva:  ${stats.jobsArchived} db`);
    console.log("======================================================\n");
    
    await sendAlert(`✅ Szinkronizáció befejezve. Új: ${stats.jobsAdded}, Archivált: ${stats.jobsArchived}. Futási idő: ${executionTimeSec}s. Memória: ${usedMemoryMB}MB.`);

    process.exit(0);

  } catch (error) {
    console.error("❌ Kritikus hiba az Orchestrator folyamatban:", error);
    await sendAlert(`Kritikus rendszerhiba az Orchestratorban: ${error.message}`, true);
    process.exit(1);
  }
}

// Indítás
runScraper();