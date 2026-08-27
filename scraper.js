const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { performance } = require("perf_hooks");
const v8 = require("v8"); 

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
if (fs.existsSync(path.join(__dirname, "analyzer.js"))) {
    nlpEngine = require("./analyzer.js");
    console.log("🧠 [NLP] Quantum/Singularity nyelvi motor csatlakoztatva.");
}

// ------------------------------------------------------------------
// 2. FIREBASE INICIALIZÁLÁS & TITKOS KULCSOK
// ------------------------------------------------------------------
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY) 
    : require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true }); 

const SYSTEM_SECRET = process.env.SYSTEM_SIGNING_SECRET || crypto.randomBytes(32).toString('hex');

// ------------------------------------------------------------------
// 3. ENTERPRISE SEGÉDOSZTÁLYOK: TELEMETRIA, EVENT LOOP, BATCH, MARKET PULSE
// ------------------------------------------------------------------

// ÚJ: AOP Telemetria Registry (Mikroszekundumos profilozás)
class TelemetryRegistry {
    constructor() { this.metrics = {}; }
    record(operation, durationMs) {
        if (!this.metrics[operation]) this.metrics[operation] = { count: 0, totalTime: 0, maxTime: 0, avgTime: 0 };
        const m = this.metrics[operation];
        m.count++;
        m.totalTime += durationMs;
        if (durationMs > m.maxTime) m.maxTime = durationMs;
        m.avgTime = m.totalTime / m.count;
    }
    getReport() { return this.metrics; }
}
const sysTelemetry = new TelemetryRegistry();

// Wrapper a pontos méréshez
const measureTelemtry = async (operationName, asyncFn) => {
    const start = performance.now();
    try { return await asyncFn(); } 
    finally { sysTelemetry.record(operationName, performance.now() - start); }
};

class EventLoopMonitor {
    constructor() { this.lag = 0; this.startMonitoring(); }
    startMonitoring() {
        setInterval(() => {
            const start = performance.now();
            setImmediate(() => { this.lag = performance.now() - start; });
        }, 500).unref(); 
    }
    isOverloaded() { return this.lag > 150; } 
    async yieldIfNecessary() {
        if (this.isOverloaded()) {
            console.warn(`⏳ [CPU Throttling] Event Loop Lag: ${this.lag.toFixed(2)}ms. Lassítás...`);
            await new Promise(res => setTimeout(res, this.lag * 5)); 
        }
    }
}
const sysMonitor = new EventLoopMonitor();

// ÚJ: Memory Velocity Predictor (Növekedési sebesség alapú védelem)
class MemoryVelocityPredictor {
    constructor() { this.lastHeap = process.memoryUsage().heapUsed; }
    checkVelocity(workerId) {
        const currentHeap = process.memoryUsage().heapUsed;
        const delta = currentHeap - this.lastHeap;
        const growthRate = delta / this.lastHeap;
        this.lastHeap = currentHeap;
        
        if (growthRate > 0.15) { // Ha 15%-ot nő a RAM az utolsó check óta (Spike)
            console.warn(`[W${workerId}] 📈 Hirtelen Memória Tüske detektálva (+${(growthRate*100).toFixed(1)}%)! Prediktív GC indítása...`);
            if (global.gc) global.gc();
            return true;
        }
        return false;
    }
}
const memPredictor = new MemoryVelocityPredictor();

class TokenBucketRateLimiter {
    constructor(capacity, fillPerSecond) {
        this.capacity = capacity; this.tokens = capacity; this.fillPerSecond = fillPerSecond; this.lastRefill = Date.now();
    }
    async consume(tokensNeeded = 1) {
        while (true) {
            const now = Date.now();
            const elapsed = (now - this.lastRefill) / 1000;
            this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.fillPerSecond);
            this.lastRefill = now;
            if (this.tokens >= tokensNeeded) { this.tokens -= tokensNeeded; return; }
            await new Promise(res => setTimeout(res, 100)); 
        }
    }
}
const globalRateLimiter = new TokenBucketRateLimiter(15, 3);

class FirestoreBatchManager {
    constructor(db, limit = 450, maxBytes = 8 * 1024 * 1024) { 
        this.db = db; this.limit = limit; this.maxBytes = maxBytes;
        this.batch = db.batch(); this.count = 0; this.currentSize = 0;
    }
    _estimateSize(data) { return Buffer.byteLength(JSON.stringify(data || {}), 'utf8'); }
    async set(ref, data, opts = {}) { 
        const size = this._estimateSize(data);
        if (this.currentSize + size > this.maxBytes) await this.flush(); 
        this.batch.set(ref, data, opts); 
        this.currentSize += size;
        await this.check(); 
    }
    async delete(ref) { 
        this.batch.delete(ref); this.currentSize += 100; 
        await this.check(); 
    }
    async check() { if (++this.count >= this.limit) await this.flush(); }
    
    async flush() {
        if (this.count === 0) return;
        for (let i = 1; i <= 3; i++) {
            try {
                await sysMonitor.yieldIfNecessary();
                await this.batch.commit();
                this.batch = this.db.batch(); this.count = 0; this.currentSize = 0; return;
            } catch (err) {
                if (i === 3) throw err;
                console.warn(`⚠️ Batch hiba (Méret: ${(this.currentSize/1024).toFixed(1)}KB), újrapróbálkozás (${i}/3)...`);
                await new Promise(res => setTimeout(res, i * 1000 + Math.random() * 500));
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
        const topSkills = Object.entries(this.skills).sort((a, b) => b[1] - a[1]).slice(0, 15).map(e => ({ skill: e[0], count: e[1] }));
        return { timestamp: FieldValue.serverTimestamp(), total_active_jobs: this.totalJobs, top_skills: topSkills, faculty_distribution: this.faculties };
    }
}

// ------------------------------------------------------------------
// 4. RESILIENCE: CIRCUIT BREAKER, TIMEOUT & BACKOFF
// ------------------------------------------------------------------

class CircuitBreaker {
    constructor() { this.states = new Map(); }
    async execute(companyName, asyncFn) {
        if (!this.states.has(companyName)) this.states.set(companyName, { failures: 0, state: 'CLOSED', nextTry: 0 });
        const breaker = this.states.get(companyName);
        if (breaker.state === 'OPEN') {
            if (Date.now() > breaker.nextTry) breaker.state = 'HALF_OPEN';
            else throw new Error(`[CircuitBreaker] ${companyName} hálózata nyitott (tiltva). Átugrás.`);
        }
        try {
            const result = await asyncFn();
            breaker.failures = 0; breaker.state = 'CLOSED'; 
            return result;
        } catch (err) {
            breaker.failures++;
            if (breaker.failures >= 3) {
                breaker.state = 'OPEN'; breaker.nextTry = Date.now() + 5 * 60 * 1000; 
                console.error(`🚨 [CircuitBreaker] ${companyName} kioldott! (Túl sok hiba)`);
            }
            throw err;
        }
    }
}
const breakerInstance = new CircuitBreaker();

const ExecutionTimeoutGuard = {
    run: (promise, ms, operationName) => {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(`[Timeout] ${operationName} túllépte a(z) ${ms}ms limitet.`)), ms);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
    }
};

// ------------------------------------------------------------------
// 5. SCHEMAS, SANITIZATION, GEOGUARD & DATA PROVENANCE
// ------------------------------------------------------------------

const DataSchemaGuard = {
    validate: (rawJob) => {
        if (!rawJob || typeof rawJob !== 'object') return null;
        const sanitizeUrl = (u) => { try { return u ? new URL(u.startsWith('http') ? u : `https://${u}`).href : ""; } catch { return ""; } };
        return {
            title: String(rawJob.title || "").replace(/[<>]/g, ''), 
            location: String(rawJob.location || "").replace(/[<>]/g, ''),
            url: sanitizeUrl(rawJob.url), apply_url: sanitizeUrl(rawJob.apply_url || rawJob.url),
            date_posted: String(rawJob.date_posted || ""), faculty: String(rawJob.faculty || ""),
            description: String(rawJob.description || ""), tags: Array.isArray(rawJob.tags) ? rawJob.tags.map(t => String(t).replace(/[<>]/g, '')) : []
        };
    }
};

const GeoGuard = {
    blacklist: [
        "slovakia", "szlovákia", "bratislava", "pozsony", "malacky", "kosice", "kassa",
        "czech", "cseh", "praha", "prague", "prága", "brno", "ostrava",
        "uk", "united kingdom", "london", "england", "wales", "scotland",
        "romania", "románia", "cluj", "kolozsvár", "timisoara", "bucharest",
        "poland", "warsaw", "krakow", "austria", "wien", "vienna", "germany"
    ],
    processLocation: function(rawLocation) {
        if (!rawLocation) return { isValid: true, cleanLoc: "Nincs megadva" };
        let loc = rawLocation.toLowerCase();
        for (const blocked of this.blacklist) {
            const regex = new RegExp(`\\b${blocked}\\b`, 'i');
            if (regex.test(loc)) return { isValid: false, cleanLoc: rawLocation, reason: `Foreign location detected: ${blocked}` };
        }
        let cleanLoc = rawLocation;
        const isRemote = /remote|távmunka|home office|wfh/i.test(cleanLoc);
        const isHybrid = /hybrid|hibrid/i.test(cleanLoc);
        if (isRemote && isHybrid) cleanLoc = "Hibrid / Távmunka";
        else if (isRemote) cleanLoc = "Távmunka";
        else if (isHybrid) { cleanLoc = cleanLoc.replace(/hybrid|hibrid/gi, '').trim(); cleanLoc = cleanLoc ? `${cleanLoc} (Hibrid)` : "Hibrid"; }
        cleanLoc = cleanLoc.replace(/\b[1-9]\d{3}\b/g, '').replace(/(Hungary|Magyarország)/gi, '');
        if (/budapest/i.test(cleanLoc)) cleanLoc = cleanLoc.includes("Hibrid") ? "Budapest (Hibrid)" : "Budapest";
        cleanLoc = cleanLoc.replace(/^[,.\s\-]+|[,.\s\-]+$/g, '').replace(/\s{2,}/g, ' ').trim();
        if (!cleanLoc || cleanLoc.length === 0) cleanLoc = "Magyarország";
        else cleanLoc = cleanLoc.charAt(0).toUpperCase() + cleanLoc.slice(1);
        return { isValid: true, cleanLoc: cleanLoc };
    }
};

function sanitizeAndScoreJob(rawJobInput, companyName) {
    const rawJob = DataSchemaGuard.validate(rawJobInput);
    if (!rawJob) return { health_score: 0 }; 

    const stripHtml = (str) => str.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
    const rawLocStr = stripHtml(rawJob.location);
    const geoResult = GeoGuard.processLocation(rawLocStr);

    const cleanJob = {
        company_name: companyName, title: stripHtml(rawJob.title) || "", location: geoResult.cleanLoc,
        url: rawJob.url, apply_url: rawJob.apply_url,
        date_posted: (!isNaN(Date.parse(rawJob.date_posted))) ? new Date(rawJob.date_posted).toISOString() : new Date().toISOString(),
        faculty: rawJob.faculty || "Egyéb", tags: [...new Set(rawJob.tags)]
    };

    if (nlpEngine && cleanJob.title) {
        const nlpResult = nlpEngine.analyzeJob(cleanJob.title, rawJob.description);
        if (nlpResult) {
            cleanJob.faculty = nlpResult.airtable_ready?.faculty || cleanJob.faculty;
            cleanJob.job_nature = nlpResult.airtable_ready?.job_nature || cleanJob.job_nature;
            cleanJob.enriched_tags = nlpResult.airtable_ready?.required_tags || [];
        }
    }

    const tagsForHash = cleanJob.enriched_tags ? cleanJob.enriched_tags.join(",") : cleanJob.tags.join(",");
    const baseString = `${companyName}|${cleanJob.title.toLowerCase()}|${cleanJob.location.toLowerCase()}|${cleanJob.faculty}`;
    cleanJob.semantic_hash = crypto.createHash('md5').update(baseString).digest('hex');
    cleanJob.data_hash = crypto.createHash('md5').update(baseString + `|${tagsForHash}`).digest('hex');
    
    // ÚJ: Cryptographic Provenance (Zero-Trust aláírás)
    cleanJob.data_signature = crypto.createHmac('sha256', SYSTEM_SECRET).update(cleanJob.data_hash).digest('hex');

    let score = 100;
    if (!geoResult.isValid) score -= 100; 
    if (!cleanJob.title || cleanJob.title.toLowerCase().includes("teszt") || cleanJob.title.toLowerCase().includes("test")) score -= 100; 
    if (!cleanJob.url) score -= 100; 
    if (cleanJob.title === cleanJob.title.toUpperCase()) { cleanJob.title = cleanJob.title.charAt(0) + cleanJob.title.slice(1).toLowerCase(); score -= 10; }
    
    cleanJob.health_score = Math.max(0, score);
    return cleanJob;
}

function getJobDifferences(oldJob, newJob) {
    const changes = {};
    const arrayEquals = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((val, index) => val === b[index]);
    ['title', 'location', 'faculty', 'url', 'job_nature'].forEach(k => { 
        if (!newJob[k] && oldJob[k]) newJob[k] = oldJob[k]; 
        else if (oldJob[k] !== newJob[k]) changes[k] = { from: oldJob[k], to: newJob[k] }; 
    });
    ['tags', 'enriched_tags'].forEach(k => {
        if (newJob[k] && oldJob[k] && !arrayEquals(oldJob[k].sort(), newJob[k].sort())) { changes[k] = { from: oldJob[k], to: newJob[k] }; }
    });
    return Object.keys(changes).length > 0 ? changes : null;
}

// ------------------------------------------------------------------
// 6. ORCHESTRATOR FŐ CIKLUS (V13.0 APEX)
// ------------------------------------------------------------------
let isShuttingDown = false;
process.on('SIGINT', () => { isShuttingDown = true; console.log("\n⚠️ Biztonságos leállás folyamatban..."); });
process.on('SIGTERM', () => { isShuttingDown = true; });

async function runScraper() {
    console.log("\n======================================================");
    console.log("🚀 UniStart CHRONOS-NEXUS Orchestrator (V13.0 OMNI-NODE APEX)");
    console.log("======================================================\n");
    
    const runTraceId = crypto.randomUUID().split('-')[0]; 
    await sendAlert(`🚀 V13.0 APEX (Trace: ${runTraceId}) folyamat elindult...`);

    const stats = { startTime: Date.now(), processed: 0, failed: 0, added: 0, updated: 0, untouched: 0, archived: 0, resurrected: 0, rejected: 0, anomalies: 0 };
    const dlqQueue = []; // ÚJ: Memória alapú DLQ a Replay fázishoz
    const errorLogs = [];
    const marketPulse = new MarketPulseTracker();

    try {
        const companiesSnapshot = await db.collection("companies").where("is_active", "!=", false).get();
        if (companiesSnapshot.empty) { console.log("⚠️ Nincs aktív cég."); return; }

        const companyQueue = [...companiesSnapshot.docs];
        const CONCURRENCY_LIMIT = Math.min(os.cpus().length * 2, 10); 
        
        const processCompany = async (workerId, companyDoc, isReplay = false) => {
            const batchManager = new FirestoreBatchManager(db); 
            await sysMonitor.yieldIfNecessary(); 
            memPredictor.checkVelocity(workerId); // ÚJ: Növekedés-sebesség ellenőrzés

            const memoryUsage = process.memoryUsage();
            const memRatio = memoryUsage.heapUsed / memoryUsage.heapTotal;
            
            if (memRatio > 0.95) {
                console.error(`[W${workerId}] 🚨 KRITIKUS RAM (95%+)! Heap Snapshot generálása...`);
                try {
                    const fileName = `heap-${Date.now()}.heapsnapshot`; v8.writeHeapSnapshot(fileName);
                    await sendAlert(`🚨 Memória riasztás! Snapshot kimentve. Trace: ${runTraceId}`, true);
                } catch (e) {}
                if (global.gc) global.gc(); await new Promise(res => setTimeout(res, 5000)); 
            } else if (memRatio > 0.88) {
                if (global.gc) global.gc(); await new Promise(res => setTimeout(res, 3000));
            }

            const company = companyDoc.data();
            const engineName = (company.engine || "custom").replace('.js', '');
            const engine = engines[engineName];
            const companyId = companyDoc.id; 
            const baseUrl = company.career_url; 
            const logPrefix = `[W${workerId}|${runTraceId}] [${company.name}]${isReplay ? ' [REPLAY]' : ''}`;

            if (!baseUrl || !engine) { console.error(`${logPrefix} ❌ Hiányzó engine/url.`); return false; }
            await new Promise(res => setTimeout(res, Math.floor(Math.random() * 800))); 
            console.log(`${logPrefix} 🏢 Inicializálás...`);

            try {
                if (!isReplay) stats.processed++;
                
                const existingJobsSnap = await db.collection("jobs").where("company_id", "==", companyId).select("data_hash", "semantic_hash", "title", "location", "faculty", "url", "tags", "enriched_tags", "job_nature").get();
                const existingMap = new Map(); const existingSemanticMap = new Map(); 
                existingJobsSnap.forEach(d => { const data = d.data(); existingMap.set(d.id, data); if(data.semantic_hash) existingSemanticMap.set(data.semantic_hash, d.id); });

                const archSnap = await db.collection("jobs_archive").where("company_id", "==", companyId).select("data_hash", "semantic_hash").get();
                const archSemanticMap = new Map(); archSnap.forEach(d => { if(d.data().semantic_hash) archSemanticMap.set(d.data().semantic_hash, d.id); });

                let scrapedJobs = [];
                for (let attempt = 1; attempt <= (isReplay ? 1 : 3); attempt++) { // Replay esetén csak 1 esély van
                    try {
                        await globalRateLimiter.consume(1);
                        // ÚJ: AOP Telemetria rögzítés a Scrape folyamatra
                        const scrapeTask = () => ExecutionTimeoutGuard.run(engine.scrape(company.name, baseUrl), 45000, `Scrape_${company.name}`);
                        scrapedJobs = await measureTelemtry(`EngineRun_${company.name}`, () => breakerInstance.execute(company.name, scrapeTask));
                        break; 
                    } catch (err) { 
                        if (attempt === 3 || err.message.includes('nyitott') || isReplay) throw err; 
                        const delay = (Math.pow(2, attempt) * 1000) + (Math.random() * 1000); 
                        console.warn(`${logPrefix} ⚠️ Scrape hiba. Újrapróbálkozás ${delay.toFixed(0)}ms múlva...`);
                        await new Promise(res => setTimeout(res, delay)); 
                    }
                }

                let skipDeletion = false;
                const prevCount = existingJobsSnap.size;
                if (prevCount >= 20 && scrapedJobs.length < (prevCount * 0.4)) {
                    await sendAlert(`${logPrefix} 🚨 VÉDELEM: Extrém drop (${prevCount} -> ${scrapedJobs.length}). Archiválás letiltva!`, true);
                    skipDeletion = true; stats.anomalies++;
                }

                const validUrls = new Set(scrapedJobs.map(j => j?.url).filter(Boolean));
                if (scrapedJobs.length > 10 && validUrls.size < (scrapedJobs.length * 0.4)) throw new Error("URL Entrópia hiba (Adatmérgezés)!");

                let cAdded = 0, cUpdated = 0, cUntouched = 0, cArchived = 0, cResurrected = 0, cRejected = 0;
                const freshJobIds = new Set(); 

                for (const rawJob of scrapedJobs) {
                    await sysMonitor.yieldIfNecessary(); 
                    // ÚJ: AOP Telemetria rögzítés a Sanitization folyamatra
                    const cleanJob = await measureTelemtry('SanitizeJob', async () => sanitizeAndScoreJob(rawJob, company.name));
                    
                    if (cleanJob.health_score < 50) { cRejected++; stats.rejected++; continue; }
                    cleanJob.company_id = companyId; cleanJob.trace_id = runTraceId; 
                    
                    let jobId = existingSemanticMap.get(cleanJob.semantic_hash) || archSemanticMap.get(cleanJob.semantic_hash) || crypto.createHash('md5').update(cleanJob.url).digest('hex');
                    freshJobIds.add(jobId); marketPulse.track(cleanJob); 

                    if (existingMap.has(jobId)) {
                        const oldJob = existingMap.get(jobId);
                        if (cleanJob.data_hash !== (oldJob.data_hash || "")) {
                            const changes = getJobDifferences(oldJob, cleanJob); cleanJob.updated_at = FieldValue.serverTimestamp();
                            await batchManager.set(db.collection("jobs").doc(jobId), cleanJob, { merge: true });
                            if (changes) { 
                                const historyRef = db.collection("jobs").doc(jobId).collection("history").doc();
                                await batchManager.set(historyRef, { changed_at: FieldValue.serverTimestamp(), changes, trace_id: runTraceId });
                            }
                            cUpdated++; stats.updated++;
                        } else { cUntouched++; stats.untouched++; }
                    } else if (archSemanticMap.has(cleanJob.semantic_hash)) {
                        cleanJob.updated_at = FieldValue.serverTimestamp(); cleanJob.is_active = true;
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
                                await batchManager.set(db.collection("jobs_archive").doc(existingJobId), { ...oldDoc.data(), archived_at: FieldValue.serverTimestamp(), is_active: false, trace_id: runTraceId });
                                await batchManager.delete(db.collection("jobs").doc(existingJobId));
                                cArchived++; stats.archived++;
                            }
                        }
                    }
                }

                await batchManager.flush();
                console.log(`${logPrefix} ✅ Új: ${cAdded} | Friss: ${cUpdated} | Archív: ${cArchived} | Kuka: ${cRejected}`);
                return true; // Siker
            } catch (err) {
                console.error(`${logPrefix} ❌ Hiba:`, err.message);
                if (!isReplay) {
                    stats.failed++; dlqQueue.push(companyDoc); // Ha normál menet, mehet a DLQ-ba
                    errorLogs.push({ company: company.name, error: err.message, traceId: runTraceId });
                }
                return false;
            }
        };

        // 1. Fázis: Normál feldolgozás
        const workerTask = async (workerId) => {
            while (companyQueue.length > 0) {
                if (isShuttingDown) break;
                const doc = companyQueue.shift();
                await processCompany(workerId, doc, false);
            }
        };
        await Promise.all(Array.from({ length: CONCURRENCY_LIMIT }, (_, i) => workerTask(i + 1)));

        // 2. Fázis (ÚJ): DLQ Replay (Öngyógyítás)
        if (dlqQueue.length > 0 && !isShuttingDown) {
            console.log(`\n🔄 [AUTO-HEAL] DLQ Replay indítása ${dlqQueue.length} sikertelen cégen...`);
            await new Promise(res => setTimeout(res, 5000)); // Kis pihenő a hálózatnak
            
            for (const doc of dlqQueue) {
                const success = await processCompany("REPLAY", doc, true);
                if (success) {
                    stats.failed--; console.log(`🔄 [AUTO-HEAL] ${doc.data().name} sikeresen feltámasztva!`);
                } else {
                    // Ha a Replay is elbukik, csak akkor írjuk a DB DLQ-ba
                    await db.collection("system_dlq").add({ company_id: doc.id, company_name: doc.data().name, trace_id: runTraceId, timestamp: FieldValue.serverTimestamp() });
                }
            }
        }

        // ------------------------------------------------------------------
        // 7. MARKET PULSE, TELEMETRIA MENTÉS & AUTO-VACUUM
        // ------------------------------------------------------------------
        console.log("\n📈 Telemetria, Market Pulse & Vacuum...");
        await db.collection("system_analytics").doc("latest_market_pulse").set(marketPulse.generateReport());
        await db.collection("system_analytics").doc("history").collection("daily_pulses").add(marketPulse.generateReport());
        
        // AOP Telemetria kiírása a logokba (V13.0)
        await db.collection("system_logs").doc(`telemetry_${runTraceId}`).set({ timestamp: FieldValue.serverTimestamp(), metrics: sysTelemetry.getReport() });

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
            last_run: FieldValue.serverTimestamp(), trace_id: runTraceId, status: stats.failed > 0 || stats.anomalies > 0 ? "warning" : "healthy",
            metrics: { ...stats, execSec, peakMemoryMB: usedMemMB }, recent_errors: errorLogs.slice(0, 10) 
        });

        console.log("\n======================================================");
        console.log(`🏁 CHRONOS-NEXUS V13.0 APEX (Trace: ${runTraceId}) BEFEJEZŐDÖTT`);
        console.log("======================================================");
        console.log(`⏱️ Idő: ${execSec}s | 🧠 Memória: ${usedMemMB}MB | 🏢 Cégek: ${stats.processed} (Végleges hiba: ${stats.failed})`);
        console.log(`✨ Új: ${stats.added} | 🔄 Frissült: ${stats.updated} | 🧟 Feltámadt: ${stats.resurrected}`);
        console.log(`🗑️ Eldobott: ${stats.rejected} | 🏛️ Archivált: ${stats.archived}`);
        console.log("======================================================\n");
        
        await sendAlert(`✅ V13.0 OMNI-NODE (Trace: ${runTraceId}) Kész. Új: ${stats.added}, Kiszűrve: ${stats.rejected}, Végleges Hiba: ${stats.failed}. Memória: ${usedMemMB}MB.`);
        process.exit(0);

    } catch (err) {
        console.error("❌ Kritikus hiba:", err); await sendAlert(`Végzetes összeomlás: ${err.message}`, true); process.exit(1);
    }
}

runScraper();