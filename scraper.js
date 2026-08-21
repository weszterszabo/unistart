const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ------------------------------------------------------------------
// 1. DINAMIKUS MOTOROK BETÖLTÉSE (Auto-Discovery)
// ------------------------------------------------------------------
const engines = {};
const scrapersPath = path.join(__dirname, "scrapers");

if (fs.existsSync(scrapersPath)) {
    const files = fs.readdirSync(scrapersPath).filter(f => f.endsWith('.js'));
    for (const file of files) engines[file.replace('.js', '')] = require(path.join(scrapersPath, file));
    console.log(`🔌 [Auto-Discovery] ${Object.keys(engines).length} db motor sikeresen betöltve.`);
} else {
    console.warn("⚠️ Nincs 'scrapers' mappa, csak a custom motor lesz elérhető!");
}

let nlpEngine = null;
if (fs.existsSync(path.join(__dirname, "analyzer.js"))) { // Vagy nlp.js, attól függően hogy nevezted el
    nlpEngine = require("./analyzer.js");
    console.log("🧠 [NLP] Quantum/Singularity nyelvi motor csatlakoztatva.");
}

// ------------------------------------------------------------------
// 2. HARDCODED CÍMLISTA (Központi Irányítópult)
// ------------------------------------------------------------------
const companiesConfig = [
    { name: "ALDI", module: "aldi.js", baseUrl: "https://karrier.aldi.hu", active: true },
    { name: "Magyar Telekom", module: "telekom.js", baseUrl: "https://www.telekom.hu", active: true },
    { name: "MOL Group", module: "mol.js", baseUrl: "https://molgroup.taleo.net", active: true },
    { name: "OTP Bank", module: "otp.js", baseUrl: "https://karrier.otpbank.hu", active: true },
    { name: "Magyar Posta", module: "posta.js", baseUrl: "https://karrier.posta.hu", active: true },
    { name: "MVM Csoport", module: "mvm.js", baseUrl: "https://mvm.karrierportal.hu", active: true },
    { name: "K&H Bank", module: "kh.js", baseUrl: "https://karrier.kh.hu", active: true },
    { name: "LIDL", module: "lidl.js", baseUrl: "https://jobs.lidl.hu", active: true },
    { name: "Erste Bank", module: "erste.js", baseUrl: "https://karrier.erstebank.hu/jsbq", active: true },
    { name: "4iG / ONE", module: "4ig.js", baseUrl: "https://karrier.4iggroup.hu", active: true },
    { name: "Közszolgállás", module: "kozszolgallas.js", baseUrl: "https://kozszolgallas.ksz.gov.hu", active: true },
    { name: "SAP", module: "sap.js", baseUrl: "https://jobs.sap.com", active: true },
    { name: "Bosch", module: "smartrecruiters.js", baseUrl: "https://jobs.smartrecruiters.com", active: true },
    { name: "Workday (OTP)", module: "workday.js", baseUrl: "https://otpbank.wd3.myworkdayjobs.com/OTP_Karrier", active: true }
];

// ------------------------------------------------------------------
// 3. FIREBASE INICIALIZÁLÁS
// ------------------------------------------------------------------
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY) 
    : require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true }); 

// ------------------------------------------------------------------
// 4. ENTERPRISE SEGÉDOSZTÁLYOK: AEGIS BATCH MANAGER & MARKET PULSE
// ------------------------------------------------------------------
class FirestoreBatchManager {
    constructor(db, limit = 450) {
        this.db = db; this.limit = limit;
        this.batch = db.batch(); this.count = 0;
    }
    async set(ref, data, opts = {}) { this.batch.set(ref, data, opts); await this.check(); }
    async delete(ref) { this.batch.delete(ref); await this.check(); }
    
    async check() { if (++this.count >= this.limit) await this.flush(); }
    
    async flush() {
        if (this.count === 0) return;
        for (let i = 1; i <= 3; i++) {
            try {
                await this.batch.commit();
                this.batch = this.db.batch(); this.count = 0; return;
            } catch (err) {
                if (i === 3) throw err;
                console.warn(`⚠️ Batch hiba, újrapróbálkozás (${i}/3)...`);
                await new Promise(res => setTimeout(res, i * 1000));
            }
        }
    }
}

async function sendAlert(message, isError = false) {
    const webhook = process.env.DISCORD_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
    if (!webhook) return;
    try { await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: (isError ? "🚨 **KRITIKUS:** " : "ℹ️ **INFO:** ") + message }) }); } catch (e) { }
}

class MarketPulseTracker {
    constructor() { this.skills = {}; this.faculties = {}; this.totalJobs = 0; }
    track(job) {
        this.totalJobs++;
        if (job.faculty) this.faculties[job.faculty] = (this.faculties[job.faculty] || 0) + 1;
        if (job.enriched_tags) job.enriched_tags.forEach(tag => this.skills[tag] = (this.skills[tag] || 0) + 1);
        else if (job.tags) job.tags.forEach(tag => this.skills[tag] = (this.skills[tag] || 0) + 1);
    }
    generateReport() {
        const topSkills = Object.entries(this.skills).sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => ({ skill: e[0], count: e[1] }));
        return { timestamp: FieldValue.serverTimestamp(), total_active_jobs: this.totalJobs, top_skills: topSkills, faculty_distribution: this.faculties };
    }
}

// ------------------------------------------------------------------
// 5. DATA QUALITY GATE & SEMANTIC FINGERPRINTING
// ------------------------------------------------------------------
function sanitizeAndScoreJob(rawJob, companyName) {
    const stripHtml = (str) => (str || "").replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
    const fixUrl = (u) => (u && u !== "null" && u !== "undefined") ? (u.startsWith("http") ? u : "https://" + u) : "";

    const cleanJob = {
        company_name: companyName,
        title: stripHtml(rawJob.title) || "",
        location: stripHtml(rawJob.location) || "Nincs megadva",
        url: fixUrl(rawJob.url),
        apply_url: fixUrl(rawJob.apply_url || rawJob.url),
        date_posted: (!isNaN(Date.parse(rawJob.date_posted))) ? new Date(rawJob.date_posted).toISOString() : new Date().toISOString(),
        faculty: rawJob.faculty || "Egyéb",
        tags: Array.isArray(rawJob.tags) ? [...new Set(rawJob.tags)] : []
    };

    if (nlpEngine && cleanJob.title) {
        const nlpResult = nlpEngine.analyzeJob(cleanJob.title, rawJob.description || "");
        if (nlpResult) {
            cleanJob.faculty = nlpResult.airtable_ready?.faculty || cleanJob.faculty;
            cleanJob.job_nature = nlpResult.airtable_ready?.job_nature;
            cleanJob.enriched_tags = nlpResult.airtable_ready?.required_tags || [];
        }
    }

    const baseString = `${companyName}|${cleanJob.title.toLowerCase()}|${cleanJob.location.toLowerCase()}|${cleanJob.faculty}`;
    cleanJob.semantic_hash = crypto.createHash('md5').update(baseString).digest('hex');
    cleanJob.data_hash = crypto.createHash('md5').update(baseString + `|${cleanJob.tags.join(",")}`).digest('hex');

    let score = 100;
    if (!cleanJob.title || cleanJob.title.toLowerCase().includes("teszt")) score -= 100; 
    if (!cleanJob.url) score -= 100; 
    if (cleanJob.title === cleanJob.title.toUpperCase()) { cleanJob.title = cleanJob.title.charAt(0) + cleanJob.title.slice(1).toLowerCase(); score -= 10; }
    
    cleanJob.health_score = Math.max(0, score);
    return cleanJob;
}

function getJobDifferences(oldJob, newJob) {
    const changes = {};
    ['title', 'location', 'faculty', 'url'].forEach(k => { 
        if (!newJob[k] && oldJob[k]) newJob[k] = oldJob[k]; 
        else if (oldJob[k] !== newJob[k]) changes[k] = { from: oldJob[k], to: newJob[k] }; 
    });
    return Object.keys(changes).length > 0 ? changes : null;
}

// ------------------------------------------------------------------
// 6. ORCHESTRATOR FŐ CIKLUS
// ------------------------------------------------------------------
let isShuttingDown = false;
process.on('SIGINT', () => { isShuttingDown = true; console.log("\n⚠️ Biztonságos leállás folyamatban..."); });
process.on('SIGTERM', () => { isShuttingDown = true; });

async function runScraper() {
    console.log("\n======================================================");
    console.log("🚀 UniStart CHRONOS-NEXUS Orchestrator (V10.0) elindult");
    console.log("======================================================\n");
    await sendAlert("🚀 UniStart V10 (Chronos-Nexus) folyamat elindult...");

    const stats = { startTime: Date.now(), processed: 0, failed: 0, added: 0, updated: 0, untouched: 0, archived: 0, resurrected: 0, rejected: 0, anomalies: 0 };
    const errorLogs = [];
    const marketPulse = new MarketPulseTracker();

    try {
        const activeCompanies = companiesConfig.filter(c => c.active === true);
        if (activeCompanies.length === 0) return console.log("⚠️ Nincs aktív cég a listában.");

        const companyQueue = [...activeCompanies];
        const CONCURRENCY_LIMIT = Math.min(os.cpus().length, 5); 
        
        const workerTask = async (workerId) => {
            const batchManager = new FirestoreBatchManager(db); 

            while (companyQueue.length > 0) {
                if (isShuttingDown) break;

                const memoryUsage = process.memoryUsage();
                if (memoryUsage.heapUsed / memoryUsage.heapTotal > 0.85) {
                    console.log(`[W${workerId}] 🛑 Magas RAM használat! Thermal Throttling aktiválva (2s sleep)...`);
                    await new Promise(res => setTimeout(res, 2000));
                }

                const company = companyQueue.shift();
                
                // Motor kiválasztása (lecsapjuk a ".js" kiterjesztést)
                const engineName = company.module.replace('.js', '');
                const engine = engines[engineName];
                
                // Egyedi ID generálása a Firebase-hez a cégnévből (Pl: "Magyar Telekom" -> "magyar_telekom")
                const companyId = company.name.toLowerCase().replace(/[^a-z0-9]/g, '_');

                if (!company.baseUrl || !engine) {
                    console.error(`[W${workerId}] ❌ Hiba: Nem található a '${company.module}' motor vagy hiányzik a baseUrl. Átugrás.`);
                    continue;
                }
                
                await new Promise(res => setTimeout(res, Math.floor(Math.random() * 1000))); 
                const logPrefix = `[W${workerId} | ${company.name}]`;
                console.log(`${logPrefix} 🏢 Motor indítása...`);

                try {
                    stats.processed++;
                    
                    // Lekérjük a létező és archivált állásokat is a céghez generált ID alapján
                    const existingJobsSnap = await db.collection("jobs").where("company_id", "==", companyId).select("data_hash", "semantic_hash", "title", "location", "faculty", "url").get();
                    const existingMap = new Map();
                    const existingSemanticMap = new Map(); 
                    existingJobsSnap.forEach(d => {
                        const data = d.data();
                        existingMap.set(d.id, data);
                        if(data.semantic_hash) existingSemanticMap.set(data.semantic_hash, d.id);
                    });

                    const archSnap = await db.collection("jobs_archive").where("company_id", "==", companyId).select("data_hash", "semantic_hash").get();
                    const archSemanticMap = new Map();
                    archSnap.forEach(d => { if(d.data().semantic_hash) archSemanticMap.set(d.data().semantic_hash, d.id); });

                    let scrapedJobs = [];
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try { scrapedJobs = await engine.scrape(company.name, company.baseUrl); break; } 
                        catch (err) { if (attempt === 3) throw err; await new Promise(res => setTimeout(res, 2000 * attempt)); }
                    }

                    // 🚨 Circuit Breaker (Anomaly Detection)
                    let skipDeletion = false;
                    const prevCount = existingJobsSnap.size;
                    
                    if (prevCount >= 15 && scrapedJobs.length < (prevCount * 0.5)) {
                        await sendAlert(`${logPrefix} 🚨 VÉDELEM: Extrém drop (${prevCount} -> ${scrapedJobs.length}). Archiválás blokkolva!`, true);
                        skipDeletion = true; stats.anomalies++;
                    }

                    const validUrls = new Set(scrapedJobs.map(j => j.url).filter(Boolean));
                    if (scrapedJobs.length > 10 && validUrls.size < (scrapedJobs.length * 0.4)) throw new Error("Adatmérgezés gyanú: Sok azonos URL!");

                    let cAdded = 0, cUpdated = 0, cUntouched = 0, cArchived = 0, cResurrected = 0, cRejected = 0;
                    const freshJobIds = new Set(); 

                    for (const rawJob of scrapedJobs) {
                        const cleanJob = sanitizeAndScoreJob(rawJob, company.name);
                        if (cleanJob.health_score < 50) { cRejected++; stats.rejected++; continue; }

                        cleanJob.company_id = companyId; // <-- Hozzárendeljük a friss ID-t
                        
                        let jobId;
                        if (existingSemanticMap.has(cleanJob.semantic_hash)) {
                            jobId = existingSemanticMap.get(cleanJob.semantic_hash);
                        } else if (archSemanticMap.has(cleanJob.semantic_hash)) {
                            jobId = archSemanticMap.get(cleanJob.semantic_hash);
                        } else {
                            jobId = crypto.createHash('md5').update(cleanJob.url).digest('hex');
                        }

                        freshJobIds.add(jobId);
                        marketPulse.track(cleanJob); 

                        if (existingMap.has(jobId)) {
                            const oldJob = existingMap.get(jobId);
                            if (cleanJob.data_hash !== (oldJob.data_hash || "")) {
                                const changes = getJobDifferences(oldJob, cleanJob);
                                cleanJob.updated_at = FieldValue.serverTimestamp();
                                
                                await batchManager.set(db.collection("jobs").doc(jobId), cleanJob, { merge: true });
                                
                                if (changes) { 
                                    const historyRef = db.collection("jobs").doc(jobId).collection("history").doc();
                                    await batchManager.set(historyRef, { changed_at: FieldValue.serverTimestamp(), changes });
                                }
                                cUpdated++; stats.updated++;
                            } else { cUntouched++; stats.untouched++; }
                        } else if (archSemanticMap.has(cleanJob.semantic_hash)) {
                            cleanJob.updated_at = FieldValue.serverTimestamp();
                            cleanJob.is_active = true;
                            await batchManager.set(db.collection("jobs").doc(jobId), cleanJob);
                            await batchManager.delete(db.collection("jobs_archive").doc(jobId)); 
                            cResurrected++; stats.resurrected++;
                        } else {
                            cleanJob.scraped_at = FieldValue.serverTimestamp();
                            await batchManager.set(db.collection("jobs").doc(jobId), cleanJob);
                            cAdded++; stats.added++;
                        }
                    }

                    if (!skipDeletion) {
                        for (const existingJobId of existingMap.keys()) {
                            if (!freshJobIds.has(existingJobId)) {
                                const oldDoc = await db.collection("jobs").doc(existingJobId).get();
                                if (oldDoc.exists) {
                                    await batchManager.set(db.collection("jobs_archive").doc(existingJobId), { ...oldDoc.data(), archived_at: FieldValue.serverTimestamp(), is_active: false });
                                    await batchManager.delete(db.collection("jobs").doc(existingJobId));
                                    cArchived++; stats.archived++;
                                }
                            }
                        }
                    }

                    await batchManager.flush();
                    existingMap.clear(); existingSemanticMap.clear(); archSemanticMap.clear(); freshJobIds.clear(); scrapedJobs = null;

                    console.log(`${logPrefix} ✅ Kész | Új: ${cAdded} | Frissült: ${cUpdated} | Feltámadt: ${cResurrected} | Archív: ${cArchived} | Kuka: ${cRejected}`);

                } catch (err) {
                    console.error(`${logPrefix} ❌ Hiba:`, err.message);
                    stats.failed++; errorLogs.push({ company: company.name, error: err.message });
                    await db.collection("system_dlq").add({ company_id: companyId, company_name: company.name, error: err.message, timestamp: FieldValue.serverTimestamp() });
                }
            }
        };

        // Worker-ek indítása (Párhuzamos végrehajtás)
        await Promise.all(Array.from({ length: CONCURRENCY_LIMIT }, (_, i) => workerTask(i + 1)));

        // ------------------------------------------------------------------
        // 7. MARKET PULSE MENTÉSE ÉS AUTO-VACUUM
        // ------------------------------------------------------------------
        console.log("\n📈 Market Pulse (Piaci Trendek) generálása...");
        await db.collection("system_analytics").doc("latest_market_pulse").set(marketPulse.generateReport());
        await db.collection("system_analytics").doc("history").collection("daily_pulses").add(marketPulse.generateReport());

        console.log("🧹 Auto-Vacuum indítása (90 napnál régebbi archívumok)...");
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const vacuumSnap = await db.collection("jobs_archive").where("archived_at", "<", ninetyDaysAgo).limit(500).get();
        const vacuumBatch = new FirestoreBatchManager(db);
        vacuumSnap.forEach(doc => vacuumBatch.delete(doc.ref));
        await vacuumBatch.flush();

        // ------------------------------------------------------------------
        // 8. ZÁRÓJELENTÉS
        // ------------------------------------------------------------------
        const execSec = parseFloat(((Date.now() - stats.startTime) / 1000).toFixed(1));
        const usedMemMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        
        await db.collection("system_logs").doc("scraper_health").set({
            last_run: FieldValue.serverTimestamp(), status: stats.failed > 0 || stats.anomalies > 0 ? "warning" : "healthy",
            metrics: { ...stats, execSec, peakMemoryMB: usedMemMB }, recent_errors: errorLogs.slice(0, 10) 
        });

        console.log("\n======================================================");
        console.log("🏁 CHRONOS-NEXUS SZINKRONIZÁCIÓ BEFEJEZŐDÖTT");
        console.log("======================================================");
        console.log(`⏱️ Idő: ${execSec}s | 🧠 Memória: ${usedMemMB}MB | 🏢 Cégek: ${stats.processed} (Hiba: ${stats.failed})`);
        console.log(`✨ Új: ${stats.added} | 🔄 Frissült: ${stats.updated} | 🧟 Feltámadt: ${stats.resurrected}`);
        console.log(`🗑️ Eldobott szemét: ${stats.rejected} | 🏛️ Archivált: ${stats.archived}`);
        console.log("======================================================\n");
        
        await sendAlert(`✅ V10.0 Kész. Új: ${stats.added}, Eldobva: ${stats.rejected}, Archív: ${stats.archived}, Vacuum törlés: ${vacuumSnap.size}. Memória: ${usedMemMB}MB.`);
        process.exit(0);

    } catch (err) {
        console.error("❌ Kritikus hiba:", err); await sendAlert(`Végzetes összeomlás: ${err.message}`, true); process.exit(1);
    }
}

runScraper();