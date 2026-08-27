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
const OUTPUT_JSON_PATH = path.join(__dirname, "jobs.json"); // IDE MENTJÜK A GITHUB SZÁMÁRA AZ ADATOKAT

// ------------------------------------------------------------------
// 3. ENTERPRISE SEGÉDOSZTÁLYOK: TELEMETRIA, EVENT LOOP, BATCH
// ------------------------------------------------------------------

class TelemetryRegistry {
    constructor() { 
        this.names = [];
        this.nameToIndex = new Map();
        this.buffer = new Float64Array(100 * 4); 
        this.currentIndex = 0;
    }
    record(operation, durationMs) {
        let idx = this.nameToIndex.get(operation);
        if (idx === undefined) {
            idx = this.currentIndex++;
            this.nameToIndex.set(operation, idx);
            this.names[idx] = operation;
        }
        const offset = idx << 2;
        this.buffer[offset]++; 
        this.buffer[offset + 1] += durationMs; 
        if (durationMs > this.buffer[offset + 2]) this.buffer[offset + 2] = durationMs; 
        this.buffer[offset + 3] = this.buffer[offset + 1] / this.buffer[offset]; 
    }
    getReport() { 
        const report = {};
        for (let i = 0; i < this.currentIndex; i++) {
            const offset = i << 2;
            report[this.names[i]] = {
                count: this.buffer[offset],
                totalTime: this.buffer[offset + 1],
                maxTime: this.buffer[offset + 2],
                avgTime: this.buffer[offset + 3]
            };
        }
        return report;
    }
}
const sysTelemetry = new TelemetryRegistry();

const measureTelemtry = async (operationName, asyncFn) => {
    const start = performance.now();
    try { return await asyncFn(); } 
    finally { sysTelemetry.record(operationName, performance.now() - start); }
};

class EventLoopMonitor {
    constructor() { 
        this.lag = 0; 
        this.emaLag = 0;
        this.alpha = 0.2; 
        this.startMonitoring(); 
    }
    startMonitoring() {
        setInterval(() => {
            const startNanos = process.hrtime.bigint();
            process.nextTick(() => { 
                const lagNanos = process.hrtime.bigint() - startNanos;
                this.lag = Number(lagNanos) / 1e6; 
                this.emaLag = (this.alpha * this.lag) + ((1 - this.alpha) * this.emaLag);
            });
        }, 300).unref(); 
    }
    isOverloaded() { return this.emaLag > 120; } 
    async yieldIfNecessary() {
        if (this.isOverloaded()) {
            const sleepTime = Math.min(1000, Math.round(this.emaLag * 4));
            console.warn(`⏳ [CPU Throttling] EMA Event Loop Lag: ${this.emaLag.toFixed(2)}ms. Lassítás (${sleepTime}ms)...`);
            await new Promise(res => setTimeout(res, sleepTime)); 
        } else {
            await new Promise(res => process.nextTick(res)); 
        }
    }
}
const sysMonitor = new EventLoopMonitor();

class MemoryVelocityPredictor {
    constructor() { 
        this.lastHeap = process.memoryUsage().heapUsed; 
        this.lastCheck = performance.now();
    }
    checkVelocity(workerId) {
        const currentHeap = process.memoryUsage().heapUsed;
        const now = performance.now();
        const timeDelta = (now - this.lastCheck) / 1000; 
        const delta = currentHeap - this.lastHeap;
        this.lastHeap = currentHeap;
        this.lastCheck = now;

        if (timeDelta > 0) {
            const mbPerSec = (delta / 1024 / 1024) / timeDelta;
            if (mbPerSec > 40) { 
                console.warn(`[W${workerId}] 📈 Veszélyes memórianövekedési (+${mbPerSec.toFixed(1)} MB/s)! Preventív GC...`);
                if (global.gc) global.gc();
                return true;
            }
        }
        return false;
    }
}
const memPredictor = new MemoryVelocityPredictor();

class ParallelRingBufferQueue {
    constructor(powerOfTwo = 4096) {
        if ((powerOfTwo & (powerOfTwo - 1)) !== 0) throw new Error("Capacity must be a power of 2");
        this.capacity = powerOfTwo;
        this.mask = powerOfTwo - 1; 
        this.resolveBuffer = new Array(powerOfTwo);
        this.tokenBuffer = new Int32Array(powerOfTwo); 
        this.head = 0;
        this.tail = 0;
        this.size = 0;
    }
    enqueue(resolveFn, tokensNeeded) {
        if (this.size === this.capacity) throw new Error("RingBuffer Overflow");
        this.resolveBuffer[this.tail] = resolveFn;
        this.tokenBuffer[this.tail] = tokensNeeded;
        this.tail = (this.tail + 1) & this.mask; 
        this.size++;
    }
    dequeueResolve() {
        if (this.size === 0) return null;
        const res = this.resolveBuffer[this.head];
        this.resolveBuffer[this.head] = null; 
        this.head = (this.head + 1) & this.mask; 
        this.size--;
        return res;
    }
    peekTokens() { return this.size === 0 ? null : this.tokenBuffer[this.head]; }
    get length() { return this.size; }
}

class MultiDomainRateLimiter {
    constructor(defaultCapacity = 10, defaultFillRate = 3) {
        this.defaultCapacity = defaultCapacity;
        this.defaultFillRate = defaultFillRate;
        this.buckets = new Map();
        this._tickActive = false; 
    }

    _getBucket(domain) {
        if (!this.buckets.has(domain)) {
            this.buckets.set(domain, {
                tokens: this.defaultCapacity,
                lastRefill: performance.now(),
                waitQueue: new ParallelRingBufferQueue(4096) 
            });
        }
        return this.buckets.get(domain);
    }

    _processMicroTasks() {
        if (this._tickActive) return;
        this._tickActive = true;
        
        const tick = () => {
            let activeQueues = 0;
            const now = performance.now();

            for (const [domain, bucket] of this.buckets.entries()) {
                if (bucket.waitQueue.length === 0) continue;
                activeQueues++;

                const elapsed = (now - bucket.lastRefill) / 1000;
                bucket.tokens = Math.min(this.defaultCapacity, bucket.tokens + elapsed * this.defaultFillRate);
                bucket.lastRefill = now;

                const nextTokens = bucket.waitQueue.peekTokens();
                if (nextTokens !== null && bucket.tokens >= nextTokens) {
                    const resolveFn = bucket.waitQueue.dequeueResolve(); 
                    bucket.tokens -= nextTokens;
                    resolveFn();
                }
            }

            if (activeQueues > 0) process.nextTick(tick);
            else this._tickActive = false;
        };
        process.nextTick(tick);
    }

    async consume(domain = "global", tokensNeeded = 1) {
        const bucket = this._getBucket(domain);
        const now = performance.now();
        const elapsed = (now - bucket.lastRefill) / 1000;
        bucket.tokens = Math.min(this.defaultCapacity, bucket.tokens + elapsed * this.defaultFillRate);
        bucket.lastRefill = now;

        if (bucket.tokens >= tokensNeeded) {
            bucket.tokens -= tokensNeeded;
            return;
        }

        return new Promise((resolve) => {
            bucket.waitQueue.enqueue(resolve, tokensNeeded); 
            this._processMicroTasks(); 
        });
    }
}
const globalRateLimiter = new MultiDomainRateLimiter(12, 4);

// A Firestore Batch Managert meghagytuk a telemetria/DLQ logoláshoz, 
// de az állásokat már nem ezen keresztül mentjük!
class FirestoreBatchManager {
    constructor(db, limit = 450) { 
        this.db = db; 
        this.limit = limit; 
        this.batch = db.batch(); 
        this.count = 0; 
    }
    async set(ref, data, opts = {}) { 
        if (this.count >= this.limit) await this.flush(); 
        this.batch.set(ref, data, opts); 
        this.count++;
    }
    async flush() {
        if (this.count === 0) return;
        await this.batch.commit();
        this.batch = this.db.batch(); 
        this.count = 0; 
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
        if (job.enriched_tags && Array.isArray(job.enriched_tags)) {
            job.enriched_tags.forEach(tag => this.skills[tag] = (this.skills[tag] || 0) + 1);
        } else if (job.tags && Array.isArray(job.tags)) {
            job.tags.forEach(tag => this.skills[tag] = (this.skills[tag] || 0) + 1);
        }
    }
    generateReport() {
        const topSkills = Object.entries(this.skills).sort((a, b) => b[1] - a[1]).slice(0, 20).map(e => ({ skill: e[0], count: e[1] }));
        return { timestamp: FieldValue.serverTimestamp(), total_active_jobs: this.totalJobs, top_skills: topSkills, faculty_distribution: this.faculties };
    }
}

class CircuitBreaker {
    constructor(failureThreshold = 3, baseCooldownMs = 5 * 60 * 1000) { 
        this.states = new Map(); 
        this.failureThreshold = failureThreshold;
        this.baseCooldownMs = baseCooldownMs;
    }

    async execute(companyName, asyncFn) {
        if (!this.states.has(companyName)) {
            this.states.set(companyName, { failures: 0, state: 'CLOSED', nextTry: 0, penaltyMultiplier: 0 });
        }
        const breaker = this.states.get(companyName);

        if (breaker.state === 'OPEN') {
            if (Date.now() > breaker.nextTry) {
                breaker.state = 'HALF_OPEN';
                console.log(`🟡 [CircuitBreaker] ${companyName} próbafázisban (HALF_OPEN)...`);
            } else {
                throw new Error(`[CircuitBreaker] ${companyName} hálózata zárolva van (${Math.round((breaker.nextTry - Date.now())/1000)}s maradt).`);
            }
        }

        try {
            const result = await asyncFn();
            breaker.failures = 0; 
            breaker.penaltyMultiplier = 0; 
            breaker.state = 'CLOSED'; 
            return result;
        } catch (err) {
            breaker.failures++;
            if (breaker.failures >= this.failureThreshold) {
                breaker.penaltyMultiplier++;
                const penaltyTime = this.baseCooldownMs * Math.pow(1.5, breaker.penaltyMultiplier);
                breaker.state = 'OPEN'; 
                breaker.nextTry = Date.now() + penaltyTime; 
                console.error(`🚨 [CircuitBreaker] ${companyName} KIOLDOTT! (${breaker.failures} hiba. Büntetés: ${Math.round(penaltyTime/60000)}p)`);
            }
            throw err;
        }
    }
}
const breakerInstance = new CircuitBreaker(3, 4 * 60 * 1000);

const ExecutionTimeoutGuard = {
    run: (promise, ms, operationName) => {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(`[Timeout] ${operationName} túllépte a(z) ${ms}ms végrehajtási időt.`)), ms);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
    }
};

// ------------------------------------------------------------------
// 5. SCHEMAS, SANITIZATION, GEOGUARD & DATA PROVENANCE
// ------------------------------------------------------------------

class ArenaLRUCache {
    constructor(limit = 2000) {
        this.limit = limit;
        this.keys = new Array(limit);
        this.values = new Array(limit);
        this.prev = new Int32Array(limit);
        this.next = new Int32Array(limit);
        this.map = new Map(); 
        
        this.head = -1;
        this.tail = -1;
        this.freeHead = 0;
        
        for (let i = 0; i < limit - 1; i++) this.next[i] = i + 1;
        this.next[limit - 1] = -1;
    }
    
    get(k) {
        const idx = this.map.get(k);
        if (idx === undefined) return null;
        this._moveToHead(idx);
        return this.values[idx];
    }
    
    set(k, v) {
        let idx = this.map.get(k);
        if (idx !== undefined) {
            this.values[idx] = v;
            this._moveToHead(idx);
            return;
        }
        
        if (this.freeHead === -1) {
            const tailIdx = this.tail;
            this.map.delete(this.keys[tailIdx]);
            this._removeNode(tailIdx);
            
            this.next[tailIdx] = this.freeHead;
            this.freeHead = tailIdx;
        }
        
        const newIdx = this.freeHead;
        this.freeHead = this.next[this.freeHead];
        
        this.keys[newIdx] = k;
        this.values[newIdx] = v;
        this.map.set(k, newIdx);
        this._addHead(newIdx);
    }
    
    _moveToHead(idx) {
        this._removeNode(idx);
        this._addHead(idx);
    }
    
    _removeNode(idx) {
        const p = this.prev[idx];
        const n = this.next[idx];
        if (p !== -1) this.next[p] = n; else this.head = n;
        if (n !== -1) this.prev[n] = p; else this.tail = p;
    }
    
    _addHead(idx) {
        this.prev[idx] = -1;
        this.next[idx] = this.head;
        if (this.head !== -1) this.prev[this.head] = idx;
        this.head = idx;
        if (this.tail === -1) this.tail = idx;
    }
}

const urlCache = new ArenaLRUCache(2000);
const paramsToStripArray = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref', 'source'];

const DataSchemaGuard = {
    canonicalizeUrl: (rawUrl) => {
        if (!rawUrl) return "";
        const cached = urlCache.get(rawUrl);
        if (cached) return cached;
        
        try {
            const parsed = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
            
            const pLen = paramsToStripArray.length;
            for (let i = 0; i < pLen; i++) {
                parsed.searchParams.delete(paramsToStripArray[i]);
            }
            
            parsed.searchParams.sort();
            parsed.hash = ""; 
            const finalUrl = parsed.href;
            
            urlCache.set(rawUrl, finalUrl);
            return finalUrl;
        } catch {
            return String(rawUrl).trim();
        }
    },

    validate: (rawJob) => {
        if (!rawJob || typeof rawJob !== 'object') return null;
        return {
            title: String(rawJob.title || "").replace(/[<>]/g, '').trim(), 
            location: String(rawJob.location || "").replace(/[<>]/g, '').trim(),
            url: DataSchemaGuard.canonicalizeUrl(rawJob.url), 
            apply_url: DataSchemaGuard.canonicalizeUrl(rawJob.apply_url || rawJob.url),
            date_posted: String(rawJob.date_posted || "").trim(), 
            faculty: String(rawJob.faculty || "").trim(),
            description: String(rawJob.description || "").trim(), 
            tags: Array.isArray(rawJob.tags) ? rawJob.tags.map(t => String(t).replace(/[<>]/g, '').trim()).filter(Boolean) : []
        };
    }
};

const GeoGuard = {
    blacklist: [
        "slovakia", "szlovakia", "bratislava", "pozsony", "malacky", "kosice", "kassa", "nitra", "nyitra", "trnava", "nagyszombat",
        "czech", "cseh", "praha", "prague", "praga", "brno", "ostrava", "plzen",
        "uk", "united kingdom", "london", "england", "wales", "scotland", "manchester",
        "romania", "romania", "cluj", "kolozsvar", "timisoara", "temesvar", "bucharest", "bukarest", "oradea", "nagyvarad",
        "poland", "lengyelorszag", "warsaw", "varsó", "krakow", "krakko", 
        "austria", "ausztria", "wien", "becs", "graz", "linz", "salzburg", 
        "germany", "nemetorszag", "berlin", "munchen", "frankfurt"
    ],
    compiledMatrix: null,
    normalizationCache: new ArenaLRUCache(2000), 

    init: function() {
        if (!this.compiledMatrix) {
            this.compiledMatrix = new RegExp(`\\b(${this.blacklist.join('|')})\\b`, 'i');
        }
    },

    normalizeString: function(str) {
        const cached = this.normalizationCache.get(str);
        if (cached) return cached;
        const norm = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        this.normalizationCache.set(str, norm);
        return norm;
    },

    processLocation: function(rawLocation) {
        if (!rawLocation) return { isValid: true, cleanLoc: "Nincs megadva" };
        
        const rawNormalized = this.normalizeString(rawLocation);
        if (this.compiledMatrix.test(rawNormalized)) {
            return { isValid: false, cleanLoc: rawLocation, reason: "Foreign location detected by Master Matrix" };
        }

        let cleanLoc = rawLocation;
        const isRemote = /remote|távmunka|tavmunka|home office|wfh/i.test(cleanLoc);
        const isHybrid = /hybrid|hibrid/i.test(cleanLoc);

        if (isRemote && isHybrid) cleanLoc = "Hibrid / Távmunka";
        else if (isRemote) cleanLoc = "Távmunka";
        else if (isHybrid) { 
            cleanLoc = cleanLoc.replace(/hybrid|hibrid/gi, '').trim(); 
            cleanLoc = cleanLoc ? `${cleanLoc} (Hibrid)` : "Hibrid"; 
        }

        cleanLoc = cleanLoc.replace(/\b[1-9]\d{3}\b/g, '').replace(/(Hungary|Magyarország|Magyarorszag)/gi, '');
        if (/budapest/i.test(cleanLoc)) cleanLoc = cleanLoc.includes("Hibrid") ? "Budapest (Hibrid)" : "Budapest";
        cleanLoc = cleanLoc.replace(/^[,.\s\-–/]+|[,.\s\-–/]+$/g, '').replace(/\s{2,}/g, ' ').trim();
        
        if (!cleanLoc || cleanLoc.length === 0) cleanLoc = "Magyarország";
        else cleanLoc = cleanLoc.charAt(0).toUpperCase() + cleanLoc.slice(1);

        return { isValid: true, cleanLoc: cleanLoc };
    }
};
GeoGuard.init(); 

class ProcessedJobRecord {
    constructor() {
        this.id = ""; // A JSON-ben szükség van natív ID-ra
        this.company_name = ""; this.company_id = ""; this.title = ""; this.location = "";
        this.url = ""; this.apply_url = ""; this.date_posted = ""; this.faculty = "";
        this.job_nature = ""; this.salary_min = null; this.salary_max = null;
        this.salary_currency = null; this.is_hourly_wage = false; this.tags = [];
        this.enriched_tags = []; this.tldr = null; this.seo_schema = null;
        this.semantic_hash = ""; this.data_hash = ""; this.data_signature = "";
        this.health_score = 0; this.trace_id = ""; this.is_active = true;
        this.scraped_at = ""; this.updated_at = "";
    }
    reset() {
        this.id = ""; this.company_name = ""; this.company_id = ""; this.title = ""; this.location = "";
        this.url = ""; this.apply_url = ""; this.date_posted = ""; this.faculty = "";
        this.job_nature = ""; this.salary_min = null; this.salary_max = null;
        this.salary_currency = null; this.is_hourly_wage = false; 
        this.tags = []; this.enriched_tags = []; 
        this.tldr = null; this.seo_schema = null; this.semantic_hash = ""; 
        this.data_hash = ""; this.data_signature = ""; this.health_score = 0; 
        this.trace_id = ""; this.is_active = true;
        this.scraped_at = ""; this.updated_at = "";
        return this;
    }
}

class JobRecordPool {
    constructor(size = 5000) {
        this.pool = new Array(size);
        for(let i=0; i<size; i++) this.pool[i] = new ProcessedJobRecord();
        this.freeIndex = size - 1;
    }
    acquire() {
        if (this.freeIndex >= 0) return this.pool[this.freeIndex--].reset();
        return new ProcessedJobRecord(); 
    }
    release(record) {
        this.pool[++this.freeIndex] = record;
    }
}
const globalJobPool = new JobRecordPool(5000);

function sanitizeAndScoreJob(rawJobInput, companyName) {
    const rawJob = DataSchemaGuard.validate(rawJobInput);
    if (!rawJob) return { health_score: 0 }; 

    const stripHtml = (str) => str.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
    const rawLocStr = stripHtml(rawJob.location);
    const geoResult = GeoGuard.processLocation(rawLocStr);

    const cleanJob = globalJobPool.acquire();
    cleanJob.company_name = companyName;
    cleanJob.title = stripHtml(rawJob.title) || "";
    cleanJob.location = geoResult.cleanLoc;
    cleanJob.url = rawJob.url;
    cleanJob.apply_url = rawJob.apply_url;
    cleanJob.date_posted = (!isNaN(Date.parse(rawJob.date_posted))) ? new Date(rawJob.date_posted).toISOString() : new Date().toISOString();
    cleanJob.faculty = rawJob.faculty || "Egyéb";
    cleanJob.tags = [...new Set(rawJob.tags)].sort();

    if (nlpEngine && cleanJob.title) {
        const nlpResult = nlpEngine.analyzeJob(cleanJob.title, rawJob.description, companyName);
        if (nlpResult) {
            cleanJob.faculty = nlpResult.airtable_ready?.faculty || cleanJob.faculty;
            cleanJob.job_nature = nlpResult.airtable_ready?.job_nature || cleanJob.job_nature;
            cleanJob.enriched_tags = nlpResult.airtable_ready?.required_tags || [];
            cleanJob.salary_min = nlpResult.airtable_ready?.salary_min || null;
            cleanJob.salary_max = nlpResult.airtable_ready?.salary_max || null;
            cleanJob.salary_currency = nlpResult.airtable_ready?.salary_currency || null;
            cleanJob.is_hourly_wage = nlpResult.airtable_ready?.is_hourly_wage || false;
            cleanJob.tldr = nlpResult.airtable_ready?.tldr || null;
            cleanJob.seo_schema = nlpResult.seo_schema || null;
        }
    }

    if(cleanJob.enriched_tags.length > 0) cleanJob.enriched_tags.sort(); 

    const tagsForHash = cleanJob.enriched_tags.length > 0 ? cleanJob.enriched_tags.join(",") : cleanJob.tags.join(",");
    const baseString = `${companyName}|${cleanJob.title.toLowerCase()}|${cleanJob.location.toLowerCase()}|${cleanJob.faculty}`;
    
    cleanJob.semantic_hash = crypto.createHash('md5').update(baseString).digest('hex');
    cleanJob.data_hash = crypto.createHash('md5').update(baseString + `|${tagsForHash}`).digest('hex');
    cleanJob.data_signature = crypto.createHmac('sha256', SYSTEM_SECRET).update(cleanJob.data_hash).digest('hex');

    let score = 100;
    if (!geoResult.isValid) score -= 100; 
    if (!cleanJob.title || cleanJob.title.toLowerCase().includes("teszt") || cleanJob.title.toLowerCase().includes("test")) score -= 100; 
    if (!cleanJob.url) score -= 100; 
    if (cleanJob.title === cleanJob.title.toUpperCase()) { cleanJob.title = cleanJob.title.charAt(0) + cleanJob.title.slice(1).toLowerCase(); score -= 10; }
    
    cleanJob.health_score = Math.max(0, score);
    return cleanJob; 
}

class FastPointerQueue {
    constructor(items) { this.items = items; this.head = 0; }
    shift() { 
        if (this.head < this.items.length) {
            const item = this.items[this.head];
            this.items[this.head++] = null; 
            return item;
        }
        return undefined;
    }
    get length() { return this.items.length - this.head; }
}

// ------------------------------------------------------------------
// 6. ORCHESTRATOR FŐ CIKLUS (V22.0 OMEGA-BAREMETAL)
// ------------------------------------------------------------------
let isShuttingDown = false;
process.on('SIGINT', () => { isShuttingDown = true; console.log("\n⚠️ Biztonságos leállás folyamatban..."); });
process.on('SIGTERM', () => { isShuttingDown = true; });

async function runScraper() {
    console.log("\n======================================================");
    console.log("🚀 UniStart CHRONOS-NEXUS Orchestrator (V22.0 JSON EXPORT)");
    console.log("======================================================\n");
    
    const runTraceId = crypto.randomUUID().split('-')[0]; 
    await sendAlert(`🚀 V22.0 JSON Export (Trace: ${runTraceId}) folyamat elindult...`);

    const stats = { startTime: Date.now(), processed: 0, failed: 0, added: 0, updated: 0, untouched: 0, rejected: 0, anomalies: 0 };
    const dlqQueue = []; 
    const errorLogs = [];
    const marketPulse = new MarketPulseTracker();

    // 1. KORÁBBI JSON BETÖLTÉSE A MEMÓRIÁBA (Azonosítók és statisztikák megőrzéséhez)
    let localJobsMap = new Map();
    let localSemanticMap = new Map();
    if (fs.existsSync(OUTPUT_JSON_PATH)) {
        try {
            const raw = JSON.parse(fs.readFileSync(OUTPUT_JSON_PATH, 'utf8'));
            raw.forEach(j => {
                localJobsMap.set(j.id, j);
                if (j.semantic_hash) localSemanticMap.set(j.semantic_hash, j.id);
            });
            console.log(`📂 Korábbi jobs.json beolvasva (${raw.length} db állás).`);
        } catch (e) {
            console.warn("⚠️ A jobs.json sérült vagy nem olvasható. Tiszta lappal indulunk.");
        }
    }

    const allNewJobsArray = []; // Ide gyűjtjük az összes sikeres állást

    try {
        const companiesSnapshot = await db.collection("companies").where("is_active", "!=", false).get();
        if (companiesSnapshot.empty) { console.log("⚠️ Nincs aktív cég az adatbázisban."); return; }

        const companyQueue = new FastPointerQueue([...companiesSnapshot.docs]);
        const CONCURRENCY_LIMIT = Math.min(os.cpus().length * 2, 10); 
        
        const processCompany = async (workerId, companyDoc, isReplay = false) => {
            await sysMonitor.yieldIfNecessary(); 
            memPredictor.checkVelocity(workerId);

            const memoryUsage = process.memoryUsage();
            const memRatio = memoryUsage.heapUsed / memoryUsage.heapTotal;
            
            if (memRatio > 0.95) {
                console.error(`[W${workerId}] 🚨 KRITIKUS RAM (95%+)! GC futtatása...`);
                if (global.gc) global.gc(); 
                await new Promise(res => setTimeout(res, 5000)); 
            }

            const company = companyDoc.data();
            const engineName = (company.engine || "custom").replace('.js', '');
            const engine = engines[engineName];
            const companyId = companyDoc.id; 
            const baseUrl = company.career_url; 
            const logPrefix = `[W${workerId}|${runTraceId}] [${company.name}]${isReplay ? ' [REPLAY]' : ''}`;

            if (!baseUrl || !engine) { 
                console.error(`${logPrefix} ❌ Hiányzó engine ('${engineName}') vagy career_url.`); 
                return false; 
            }

            let hostDomain = "global";
            try { hostDomain = new URL(baseUrl).hostname; } catch {}

            await new Promise(res => setTimeout(res, Math.floor(Math.random() * 600))); 
            console.log(`${logPrefix} 🏢 Inicializálás (${hostDomain})...`);

            try {
                if (!isReplay) stats.processed++;
                
                let scrapedJobs = [];
                for (let attempt = 1; attempt <= (isReplay ? 1 : 3); attempt++) {
                    try {
                        await globalRateLimiter.consume(hostDomain, 1);
                        const scrapeTask = () => ExecutionTimeoutGuard.run(engine.scrape(company.name, baseUrl), 45000, `Scrape_${company.name}`);
                        scrapedJobs = await measureTelemtry(`EngineRun_${company.name}`, () => breakerInstance.execute(company.name, scrapeTask));
                        break; 
                    } catch (err) { 
                        if (attempt === 3 || err.message.includes('zárolva') || isReplay) throw err; 
                        const delay = (Math.pow(2, attempt) * 1000) + Math.floor(Math.random() * 800); 
                        console.warn(`${logPrefix} ⚠️ Scrape újrapróbálkozás (${attempt}/3) ${delay}ms múlva... (${err.message})`);
                        await new Promise(res => setTimeout(res, delay)); 
                    }
                }

                let cAdded = 0, cUpdated = 0, cUntouched = 0, cRejected = 0;

                for (const rawJob of scrapedJobs) {
                    await sysMonitor.yieldIfNecessary(); 
                    const cleanJobPoolObj = await measureTelemtry('SanitizeJob', async () => sanitizeAndScoreJob(rawJob, company.name));
                    
                    if (cleanJobPoolObj.health_score < 50) { 
                        cRejected++; 
                        stats.rejected++; 
                        globalJobPool.release(cleanJobPoolObj); 
                        continue; 
                    }

                    cleanJobPoolObj.company_id = companyId; 
                    cleanJobPoolObj.trace_id = runTraceId; 
                    
                    // ID megőrzése a korábbi JSON fájlból
                    let jobId = localSemanticMap.get(cleanJobPoolObj.semantic_hash) 
                        || 'job_' + crypto.createHash('md5').update(cleanJobPoolObj.url).digest('hex').substring(0,16);

                    cleanJobPoolObj.id = jobId;
                    marketPulse.track(cleanJobPoolObj); 

                    if (localJobsMap.has(jobId)) {
                        const oldJob = localJobsMap.get(jobId);
                        if (cleanJobPoolObj.data_hash !== (oldJob.data_hash || "")) {
                            cleanJobPoolObj.updated_at = new Date().toISOString();
                            cleanJobPoolObj.scraped_at = oldJob.scraped_at || new Date().toISOString();
                            cUpdated++; 
                            stats.updated++;
                        } else { 
                            cleanJobPoolObj.updated_at = oldJob.updated_at;
                            cleanJobPoolObj.scraped_at = oldJob.scraped_at;
                            cUntouched++; 
                            stats.untouched++; 
                        }
                    } else {
                        cleanJobPoolObj.scraped_at = new Date().toISOString();
                        cleanJobPoolObj.updated_at = new Date().toISOString();
                        cAdded++; 
                        stats.added++;
                    }
                    
                    // JSON kimentéshez klónozzuk a memóriaterületről
                    allNewJobsArray.push(Object.assign({}, cleanJobPoolObj));
                    globalJobPool.release(cleanJobPoolObj); 
                }

                console.log(`${logPrefix} ✅ Új: ${cAdded} | Friss: ${cUpdated} | Kiszűrve: ${cRejected}`);
                return true; 
            } catch (err) {
                console.error(`${logPrefix} ❌ Hiba:`, err.message);
                if (!isReplay) {
                    stats.failed++; 
                    dlqQueue.push(companyDoc);
                    errorLogs.push({ company: company.name, error: err.message, traceId: runTraceId });
                }
                return false;
            }
        };

        const workerTask = async (workerId) => {
            while (companyQueue.length > 0) {
                if (isShuttingDown) break;
                const doc = companyQueue.shift(); 
                await processCompany(workerId, doc, false);
            }
        };
        await Promise.all(Array.from({ length: CONCURRENCY_LIMIT }, (_, i) => workerTask(i + 1)));

        if (dlqQueue.length > 0 && !isShuttingDown) {
            console.log(`\n🔄 [AUTO-HEAL] DLQ Replay indítása ${dlqQueue.length} sikertelen cégen...`);
            await new Promise(res => setTimeout(res, 4000)); 
            
            for (const doc of dlqQueue) {
                const success = await processCompany("REPLAY", doc, true);
                if (success) {
                    stats.failed--; 
                    console.log(`🔄 [AUTO-HEAL] ${doc.data().name} sikeresen feltámasztva!`);
                } else {
                    await db.collection("system_dlq").add({ 
                        company_id: doc.id, 
                        company_name: doc.data().name, 
                        trace_id: runTraceId, 
                        timestamp: FieldValue.serverTimestamp() 
                    });
                }
            }
        }

        // ------------------------------------------------------------------
        // 7. VÉGSŐ JSON FÁJL MENTÉSE
        // ------------------------------------------------------------------
        console.log(`\n💾 Adatok mentése a(z) ${OUTPUT_JSON_PATH} fájlba...`);
        fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(allNewJobsArray, null, 2), 'utf-8');

        // ------------------------------------------------------------------
        // 8. MARKET PULSE & TELEMETRIA MENTÉS FIREBASE-BE (Csak Analitika)
        // ------------------------------------------------------------------
        console.log("📈 Telemetria & Market Pulse mentése a Firebase-be...");
        const logBatch = new FirestoreBatchManager(db);
        await logBatch.set(db.collection("system_analytics").doc("latest_market_pulse"), marketPulse.generateReport());
        await logBatch.set(db.collection("system_logs").doc(`telemetry_${runTraceId}`), { 
            timestamp: FieldValue.serverTimestamp(), 
            metrics: sysTelemetry.getReport() 
        });

        // ------------------------------------------------------------------
        // 9. ZÁRÓJELENTÉS
        // ------------------------------------------------------------------
        const execSec = parseFloat(((Date.now() - stats.startTime) / 1000).toFixed(1));
        const usedMemMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        
        await logBatch.set(db.collection("system_logs").doc("scraper_health"), {
            last_run: FieldValue.serverTimestamp(), 
            trace_id: runTraceId, 
            status: stats.failed > 0 || stats.anomalies > 0 ? "warning" : "healthy",
            metrics: { ...stats, execSec, peakMemoryMB: usedMemMB }, 
            recent_errors: errorLogs.slice(0, 10) 
        });

        await logBatch.flush();

        console.log("\n======================================================");
        console.log(`🏁 CHRONOS-NEXUS V22.0 JSON EXPORT (Trace: ${runTraceId}) BEFEJEZŐDÖTT`);
        console.log("======================================================");
        console.log(`⏱️ Idő: ${execSec}s | 🧠 Memória: ${usedMemMB}MB | 🏢 Cégek: ${stats.processed} (Végleges hiba: ${stats.failed})`);
        console.log(`✨ Új: ${stats.added} | 🔄 Frissült: ${stats.updated}`);
        console.log(`🗑️ Kiszűrve (Kuka): ${stats.rejected}`);
        console.log("======================================================\n");
        
        await sendAlert(`✅ V22.0 JSON Export (Trace: ${runTraceId}) Kész. Új: ${stats.added}, Kiszűrve: ${stats.rejected}, Végleges Hiba: ${stats.failed}. Memória: ${usedMemMB}MB.`);
        process.exit(0);

    } catch (err) {
        console.error("❌ Kritikus hiba:", err); 
        await sendAlert(`Végzetes összeomlás: ${err.message}`, true); 
        process.exit(1);
    }
}

runScraper();