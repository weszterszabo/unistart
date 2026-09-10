const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const http = require('http');
const https = require('https');

// 🔥 GLOBÁLIS HÁLÓZATI PAJZS ÉS "HÓHÉR" (Tarpit védelem)
const GLOBAL_TIMEOUT_MS = 15000;
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 500, timeout: GLOBAL_TIMEOUT_MS });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 500, rejectUnauthorized: false, timeout: GLOBAL_TIMEOUT_MS });

const originalFetch = global.fetch;
global.fetch = async (url, options = {}) => {
    options.agent = function(_parsedURL) { return _parsedURL.protocol === 'http:' ? httpAgent : httpsAgent; };
    if(!options.headers) options.headers = {};
    options.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    options.headers['Connection'] = 'keep-alive';
    
    if (!options.signal && global.AbortSignal) {
        options.signal = AbortSignal.timeout(GLOBAL_TIMEOUT_MS);
    }
    return originalFetch(url, options);
};

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ------------------------------------------------------------------
// 1. DINAMIKUS MOTOROK BETÖLTÉSE (Auto-Discovery)
// ------------------------------------------------------------------
const engines = {};
const scrapersPath = path.join(process.cwd(), "scrapers");

if (fs.existsSync(scrapersPath)) {
    const files = fs.readdirSync(scrapersPath).filter(f => f.endsWith('.js'));
    for (const file of files) engines[file.replace('.js', '')] = require(path.join(scrapersPath, file));
    console.log(`🔌 [Auto-Discovery] ${Object.keys(engines).length} db motor sikeresen betöltve a scrapers mappából.`);
} else {
    console.error("❌ KRITIKUS HIBA: Nincs 'scrapers' mappa!");
    process.exit(1);
}

let nlpEngine = null;
if (fs.existsSync(path.join(process.cwd(), "analyzer.js"))) {
    nlpEngine = require(path.join(process.cwd(), "analyzer.js"));
    console.log("🧠 [NLP] Quantum/Singularity nyelvi motor csatlakoztatva.");
}

// ------------------------------------------------------------------
// 2. SCHEMAS, SANITIZATION & HYPER-PRECISION GEOGUARD
// ------------------------------------------------------------------
class ArenaLRUCache {
    constructor(limit = 2000) {
        this.limit = limit; this.keys = new Array(limit); this.values = new Array(limit);
        this.prev = new Int32Array(limit); this.next = new Int32Array(limit); this.map = new Map(); 
        this.head = -1; this.tail = -1; this.freeHead = 0;
        for (let i = 0; i < limit - 1; i++) this.next[i] = i + 1; this.next[limit - 1] = -1;
    }
    get(k) { const idx = this.map.get(k); if (idx === undefined) return null; this._moveToHead(idx); return this.values[idx]; }
    set(k, v) {
        let idx = this.map.get(k);
        if (idx !== undefined) { this.values[idx] = v; this._moveToHead(idx); return; }
        if (this.freeHead === -1) {
            const tailIdx = this.tail; this.map.delete(this.keys[tailIdx]); this._removeNode(tailIdx);
            this.next[tailIdx] = this.freeHead; this.freeHead = tailIdx;
        }
        const newIdx = this.freeHead; this.freeHead = this.next[this.freeHead];
        this.keys[newIdx] = k; this.values[newIdx] = v; this.map.set(k, newIdx); this._addHead(newIdx);
    }
    _moveToHead(idx) { this._removeNode(idx); this._addHead(idx); }
    _removeNode(idx) {
        const p = this.prev[idx]; const n = this.next[idx];
        if (p !== -1) this.next[p] = n; else this.head = n;
        if (n !== -1) this.prev[n] = p; else this.tail = p;
    }
    _addHead(idx) {
        this.prev[idx] = -1; this.next[idx] = this.head;
        if (this.head !== -1) this.prev[this.head] = idx;
        this.head = idx; if (this.tail === -1) this.tail = idx;
    }
}

const urlCache = new ArenaLRUCache(2000);
const paramsToStripArray = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'];

const DataSchemaGuard = {
    canonicalizeUrl: (rawUrl) => {
        if (!rawUrl) return "";
        const cached = urlCache.get(rawUrl); if (cached) return cached;
        try {
            const parsed = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
            for (let i = 0; i < paramsToStripArray.length; i++) parsed.searchParams.delete(paramsToStripArray[i]);
            const finalUrl = parsed.href; urlCache.set(rawUrl, finalUrl); return finalUrl;
        } catch { return String(rawUrl).trim(); }
    },
    validate: (rawJob) => {
        if (!rawJob || typeof rawJob !== 'object') return null;
        return {
            title: String(rawJob.title || "").replace(/[<>]/g, '').trim(), 
            location: String(rawJob.location || "").replace(/[<>]/g, '').trim(),
            url: DataSchemaGuard.canonicalizeUrl(rawJob.url), 
            apply_url: DataSchemaGuard.canonicalizeUrl(rawJob.apply_url || rawJob.url),
            description: String(rawJob.description || "").trim(), 
            tags: Array.isArray(rawJob.tags) ? rawJob.tags.map(t => String(t).replace(/[<>]/g, '').trim()).filter(Boolean) : []
        };
    }
};

const GeoGuard = {
    blacklist: ["slovakia", "uk", "romania", "poland", "austria", "germany", "croatia", "serbia"],
    compiledMatrix: null,
    normalizationCache: new ArenaLRUCache(2000), 
    init: function() { if (!this.compiledMatrix) { this.compiledMatrix = new RegExp(`\\b(${this.blacklist.join('|')})\\b`, 'i'); } },
    normalizeString: function(str) {
        const cached = this.normalizationCache.get(str); if (cached) return cached;
        const norm = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        this.normalizationCache.set(str, norm); return norm;
    },
    processLocation: function(rawLocation) {
        if (!rawLocation) return { isValid: true, cleanLoc: "Nincs megadva" };
        const rawNormalized = this.normalizeString(rawLocation);
        if (this.compiledMatrix.test(rawNormalized)) return { isValid: false, cleanLoc: rawLocation };

        let cleanLoc = rawLocation.replace(/📍|🏢|📌/g, '').trim();
        if (/budapest/i.test(cleanLoc)) cleanLoc = cleanLoc.includes("Hibrid") ? "Budapest (Hibrid)" : "Budapest";
        return { isValid: true, cleanLoc: cleanLoc ? cleanLoc.charAt(0).toUpperCase() + cleanLoc.slice(1) : "Magyarország" };
    }
};
GeoGuard.init(); 

function sanitizeAndScoreJob(rawJobInput, companyName) {
    try {
        const rawJob = DataSchemaGuard.validate(rawJobInput);
        if (!rawJob) return { health_score: 0 }; 

        const geoResult = GeoGuard.processLocation(rawJob.location);
        
        let cleanJob = {
            company_name: companyName,
            title: rawJob.title,
            location: geoResult.cleanLoc,
            url: rawJob.url,
            tags: rawJob.tags,
            health_score: 100
        };

        if (!geoResult.isValid) cleanJob.health_score -= 100;

        if (nlpEngine && cleanJob.title) {
            const nlpResult = nlpEngine.analyzeJob(cleanJob.title, rawJob.description, companyName);
            if (!nlpResult) return { health_score: 0, reason: "Az NLP kiszűrte." };

            cleanJob.job_nature = nlpResult.airtable_ready?.job_nature || "Pályakezdő";
            cleanJob.faculty = nlpResult.airtable_ready?.faculty || "Egyéb";
            cleanJob.enriched_tags = nlpResult.airtable_ready?.required_tags || [];
            cleanJob.all_nlp_data = nlpResult; 
        }

        // 🔥 KÖTELEZŐ FELÜLBÍRÁLÁS: Ha diákszövetkezet, ERŐSZAKKAL "student" kategóriába tesszük!
        const studentPortals = ["Quantum Diákszövetkezet", "Y Diákszövetkezet", "Meló-Diák", "Human Centrum"];
        if (studentPortals.includes(companyName)) {
            cleanJob.job_nature = "Diákmunka";
            if (cleanJob.all_nlp_data && cleanJob.all_nlp_data.airtable_ready) {
                cleanJob.all_nlp_data.airtable_ready.job_nature = "Diákmunka";
                cleanJob.all_nlp_data.airtable_ready.position_type = "student";
            }
        }

        return cleanJob; 
    } catch (e) {
        return { health_score: 0, error: e.message };
    }
}

// ------------------------------------------------------------------
// 3. TESZT ORCHESTRATOR KIFEJEZETTEN A DIÁKMUNKÁKRA
// ------------------------------------------------------------------
async function runTestScraper() {
    console.log("\n======================================================");
    console.log("🚀 UniStart CHRONOS-NEXUS [LOKÁLIS TESZT MÓD]");
    console.log("======================================================\n");
    
    const testTargets = [
        { id: "quantum", name: "Quantum Diákszövetkezet", url: "https://cloud.qdiak.hu/munkak" },
        { id: "ydiak", name: "Y Diákszövetkezet", url: "https://ydiak.hu/aktualis-diakmunkaink" },
        { id: "melodiak", name: "Meló-Diák", url: "https://www.melodiak.hu" },
        { id: "minddiak", name: "Human Centrum", url: "https://www.humancentrum.hu" } 
    ];

    const allValidJobsForExport = [];

    for (const target of testTargets) {
        const engine = engines[target.id];
        
        if (!engine) {
            console.warn(`⚠️ Kihagyva: '${target.id}' motor nem található a scrapers/ mappában.`);
            continue;
        }

        console.log(`\n🏢 --- ${target.name} TESZTELÉSE INDUL --- 🏢`);
        
        try {
            const rawJobs = await engine.scrape(target.name, target.url, []);
            console.log(`✅ Nyers állások letöltve: ${rawJobs.length} db.`);

            if (rawJobs.length > 0) {
                console.log(`🧠 NLP és GeoGuard feldolgozás (Sanitizer) folyamatban...`);
                
                let passedCount = 0;
                for (const job of rawJobs) {
                    const sanitizedJob = sanitizeAndScoreJob(job, target.name);
                    // Bármi, ami megmarad (cím, link), azt elmentjük a listába!
                    if (sanitizedJob.health_score > 0) {
                        allValidJobsForExport.push(sanitizedJob);
                        passedCount++;
                    }
                }
                
                console.log(`   ✔️ Ebből ${passedCount} db sikeresen elemezve és mentésre kész.`);
            }

        } catch (error) {
            console.error(`❌ HIBA a ${target.name} letöltése közben:`, error.message);
        }
    }

    console.log("\n======================================================");
    console.log(`💾 FÁJLBA MENTÉS: Összesen ${allValidJobsForExport.length} db végleges állás kimentése indul...`);
    
    try {
        // 🔥 Itt jön létre a jobs.json, pont ahogy kérted!
        const outputPath = path.join(process.cwd(), "jobs.json");
        fs.writeFileSync(outputPath, JSON.stringify(allValidJobsForExport, null, 2), 'utf8');
        console.log(`✅ SIKER! Az állások mentve ide: ${outputPath}`);
    } catch (e) {
        console.error("❌ Hiba a fájl mentésekor:", e.message);
    }

    console.log("======================================================\n");
}

runTestScraper();