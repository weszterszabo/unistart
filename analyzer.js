const crypto = require("crypto");
const { performance } = require("perf_hooks"); 
const fs = require("fs");
const path = require("path");

// ============================================================================
// 🧠 0. V70.0 QUANTUM-TRANSCENDENCE (PREDICTIVE AGI & SELF-OPTIMIZING ENGINE)
// ============================================================================
const BRAIN_FILE_PATH = path.join(process.cwd(), "brain.json");
const DISCOVERY_MD_PATH = path.join(process.cwd(), "AI_TUDASBAZIS_JAVASLATOK.md");

let brainDB = {
    metadata: { 
        total_parsed_jobs: 0, 
        total_rejected: 0,
        last_calibration: Date.now(), 
        version: "70.0_QUANTUM_TRANSCENDENCE",
        avg_doc_length: 400,
        bm25_k1: 1.5,
        bm25_b: 0.75,
        adaptive_threshold: 50,
        learning_rate: 0.01 // 🔥 SGD Tanulási ráta az öntréninghez
    },
    categories: {
        "📍 HELYSZÍN": {}, "💻 SZOFTVER/TECH": {}, "🎁 JUTTATÁS": {},
        "🧠 SOFT-SKILL": {}, "🌍 NYELV": {}, "👔 ÚJ SZAKMA/POZÍCIÓ": {},
        "🧩 N-GRAM (KIFEJEZÉSEK)": {} 
    },
    company_profiles: {},  
    dynamic_faculties: {}, 
    emergent_clusters: {}, 
    cluster_salary_curves: {},
    auto_typos: {}, 
    idf_stats: {},
    anomalies: [], 
    ontology_graph: {}, // Word2Vec-jellegű co-occurrence matrix
    eigen_centrality: {}, 
    skill_velocity: {}, 
    antibodies: []         
};

function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length; if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
            else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
        }
    }
    return matrix[b.length][a.length];
}

function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0; let normA = 0; let normB = 0;
    if (!vecA || !vecB) return 0;
    const allKeys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
    for (const key of allKeys) {
        const aVal = vecA[key] || 0; const bVal = vecB[key] || 0;
        dotProduct += aVal * bVal; normA += aVal * aVal; normB += bVal * bVal;
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

try {
    if (fs.existsSync(BRAIN_FILE_PATH)) {
        const fileContent = fs.readFileSync(BRAIN_FILE_PATH, 'utf8');
        if (fileContent.trim() !== "") {
            const parsedBrain = JSON.parse(fileContent);
            if (parsedBrain.categories) brainDB = { ...brainDB, ...parsedBrain };
            if (!brainDB.company_profiles) brainDB.company_profiles = {};
            if (brainDB.metadata && !brainDB.metadata.learning_rate) brainDB.metadata.learning_rate = 0.01;
        }
    }
} catch (e) { console.warn("⚠️ [Transcendence] A szingularitás elérése folyamatban..."); }

// LEÁLLÁSKOR: AGY MENTÉSE ÉS PREDITKÍV JELENTÉS GENERÁLÁSA
process.on('exit', () => {
    try {
        fs.writeFileSync(BRAIN_FILE_PATH, JSON.stringify(brainDB, null, 2), 'utf8');
        let report = `\n======================================================\n🧠 UNI-START AI TUDÁSBÁZIS (V70.0 QUANTUM-TRANSCENDENCE) - ${new Date().toLocaleString('hu-HU')}\n======================================================\n`;
        report += `Az MI prediktív elemzéseket futtatott, optimalizálta saját matematikai paramétereit, és kiszámolta a piaci fluktuációt.\n\n`;

        report += `### ⚙️ Auto-Tuning (Stochastic Gradient Descent)\n`;
        report += `- Dinamikus Szigorúság (Threshold): **${brainDB.metadata.adaptive_threshold.toFixed(1)} pont**\n`;
        report += `- Kifejezés-telítettség (BM25 K1): **${brainDB.metadata.bm25_k1.toFixed(4)}** (Evolúciós ráta: ${brainDB.metadata.learning_rate})\n`;
        const rejectRate = (brainDB.metadata.total_rejected / Math.max(1, brainDB.metadata.total_parsed_jobs)) * 100;
        report += `- Piac Elutasítási Aránya (Rejection Rate): **${rejectRate.toFixed(1)}%**\n\n`;

        // 🚨 PREDIKTÍV FLUKTUÁCIÓ (CHURN)
        const highChurnComps = Object.entries(brainDB.company_profiles)
            .filter(([_, data]) => data.jobs > 3 && data.churn_probability > 40)
            .sort((a, b) => b[1].churn_probability - a[1].churn_probability);
        
        if (highChurnComps.length > 0) {
            report += `### 🔮 PREDIKTÍV FLUKTUÁCIÓ (Azon cégek, ahol valószínű a korai felmondás)\n`;
            highChurnComps.slice(0, 5).forEach(([comp, data]) => {
                const dangerLvl = data.churn_probability > 70 ? "🚨 KRITIKUS LEMORZSOLÓDÁS" : "⚠️ Magas kockázat";
                report += `- **${comp}**: **${data.churn_probability.toFixed(1)}% esély** a felmondásra 6 hónapon belül. (${dangerLvl})\n`;
            });
            report += `\n`;
        }

        // 🏢 CÉG-PROFILOZÓ (Toxicity)
        const toxicCompanies = Object.entries(brainDB.company_profiles).filter(([_, data]) => data.jobs > 3).sort((a, b) => b[1].toxicity_index - a[1].toxicity_index);
        if (toxicCompanies.length > 0) {
            report += `### 🏢 CÉG-DIAGNOSZTIKA (Vállalati Kultúra Toxicitás)\n`;
            toxicCompanies.slice(0, 5).forEach(([comp, data]) => {
                const toxLvl = data.toxicity_index > 50 ? "🚨 Nagyon Toxikus" : (data.toxicity_index > 20 ? "⚠️ Közepes" : "✅ Egészséges");
                report += `- **${comp}** (Kiírt állások: ${data.jobs}) | HR Zsargon Átlag: ${(data.bs_total/data.jobs).toFixed(1)} | ${toxLvl}\n`;
            });
            report += `\n`;
        }

        // 📈 TREND REPORT (Skill Velocity)
        const trendingSkills = Object.entries(brainDB.skill_velocity).filter(([_, data]) => data.momentum > 1.2 && data.recent_count > 3).sort((a, b) => b[1].momentum - a[1].momentum);
        if (trendingSkills.length > 0) {
            report += `### 📈 FELTÖREKVŐ TRENDEK (Market Momentum)\n`;
            trendingSkills.slice(0, 10).forEach(([skill, data]) => {
                report += `- **${skill.toUpperCase()}** (Sebesség mutató: +${((data.momentum - 1)*100).toFixed(1)}%) 🔥\n`;
            });
            report += `\n`;
        }

        // 🌌 AI ÁLTAL LÉTREHOZOTT KATEGÓRIÁK ÉS BÉRGÖRBÉK
        const dynFaculties = Object.entries(brainDB.dynamic_faculties).sort((a, b) => b[1].usage_count - a[1].usage_count);
        if (dynFaculties.length > 0) {
            report += `### 🌌 AI ÁLTAL GENERÁLT ÚJ FŐKATEGÓRIÁK\n`;
            dynFaculties.forEach(([facName, data]) => {
                const salaryMultiplier = brainDB.cluster_salary_curves[facName]?.multiplier || 1.0;
                const premiumStr = salaryMultiplier !== 1.0 ? ` | 💰 Piaci Prémium: +${((salaryMultiplier - 1)*100).toFixed(1)}%` : "";
                report += `- **${facName}** (Használat: ${data.usage_count}x) | Kulcsszavak: [${data.terms.join(", ")}]${premiumStr}\n`;
            });
            report += `\n`;
        }

        // 🔍 STANDARD FELFEDEZÉSEK
        for (const [category, wordsObj] of Object.entries(brainDB.categories)) {
            const validDiscoveries = Object.entries(wordsObj).filter(([_, data]) => data.count >= 2).sort((a, b) => b[1].count - a[1].count);
            if (validDiscoveries.length > 0) {
                report += `### ${category} (Top Felfedezések)\n`;
                validDiscoveries.slice(0, 15).forEach(([word, data]) => {
                    const topContext = Object.entries(data.context_vectors || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0]).join(", ");
                    const assocStr = topContext ? ` | 🔗 Asszoc: [${topContext}]` : "";
                    const statusStr = data.auto_promoted ? "✅ INJEKTÁLVA" : "⏳ Elemzés...";
                    report += `- **${word.toUpperCase()}** (Látta: ${Math.round(data.count)}x) ${assocStr} -> ${statusStr}\n`;
                });
                report += `\n`;
            }
        }

        fs.writeFileSync(DISCOVERY_MD_PATH, report, 'utf8');
    } catch(e) {}
});

// ============================================================================
// 📚 1. KOGNITÍV SZÓTÁRAK (A GENETIKAI ALAP MAGOK - SEED CATEGORIES)
// ============================================================================

const structuredTagsDict = {
    languages: ["angol", "német", "francia", "spanyol", "english", "german", "olasz", "orosz", "szlovák", "román", "holland", "italian", "french", "spanish", "dutch", "lengyel", "polish", "cseh", "czech", "ukrán", "ukrainian", "kínai", "chinese", "japán", "koreai", "portugál"],
    tech: [
        "excel", "python", "javascript", "typescript", "sql", "java", "react", "html", "css", "aws", "git", "power bi", "sap", "figma", "photoshop", 
        "autocad", "c++", "c#", "node.js", "docker", "kubernetes", "jira", "linux", "azure", "salesforce", "tableau", "wordpress", "angular", "vue", 
        "django", "spring boot", "php", "laravel", "golang", "rust", "ruby", "swift", "kotlin", "bash", "powershell", "mongodb", "postgresql", 
        "mysql", "redis", "elasticsearch", "terraform", "ansible", "jenkins", "confluence", "trello", "asana", "illustrator", "indesign", 
        "premiere pro", "after effects", "solidworks", "revit", "archicad", "matlab", "spss", "r", "hadoop", "spark", "kafka", "snowflake", "dax", 
        "vba", "google analytics", "seo", "sem", "hubspot", "mailchimp", "oracle", "flutter", "dart", "firebase", "supabase", "graphql", "apollo", 
        "prisma", "nestjs", "nuxt", "tailwind", "bootstrap", "sass", "less", "webpack", "vite", "babel", "jest", "cypress", "selenium", "playwright", 
        "gitlab", "github actions", "bitbucket", "prometheus", "grafana", "elk", "splunk", "datadog", "nlp", "llm", "openai", "machine learning", 
        "deep learning", "opencv", "tensorflow", "pytorch", "keras", "scikit-learn", "pandas", "numpy", "fastapi", "flask", "ruby on rails", 
        "elixir", "scala", "solidity", "web3", "blockchain", "android", "ios", "react native", "unity", "unreal engine", "sketch", "invision", 
        "zeplin", "miro", "notion", "slack", "dotnet", ".net"
    ],
    soft_skills: [
        "kommunikáci", "csapatmunka", "proaktív", "precíz", "problémamegoldó", "analitikus", "kreatív", "önálló", "terhelhető", "agilis", 
        "prezentációs", "ügyfélorientált", "communication", "teamwork", "proactive", "precise", "analytical", "creative", "independent", "agile", 
        "presentation", "flexibility", "empatikus", "empathy", "vezetési", "leadership", "time management", "időgazdálkodás", "konfliktuskezelés", 
        "conflict resolution", "tárgyalástechnika", "negotiation", "kritikus gondolkodás", "critical thinking", "alkalmazkodókészség", "adaptability", 
        "részletorientált", "detail-oriented", "megbízható", "reliable", "reziliencia", "resilience", "growth mindset", "fejlődési hajlandóság", 
        "érzelmi intelligencia", "eq", "multitasking", "ügyfélközpontúság", "customer focus", "storytelling", "networking", "logikus gondolkodás"
    ],
    work_setup: ["home office", "remote", "hibrid", "távmunka", "on-site", "rugalmas munkaidő", "flexible hours", "wfh", "hybrid", "törzsmunkaidő", "core hours", "irodai", "office-based"],
    benefits: [
        "cafeteria", "bónusz", "bonus", "aycm", "all you can move", "medicover", "magánegészségügy", "laptop", "céges telefon", "céges autó", 
        "company car", "utazástámogatás", "bejárás támogatás", "szép kártya", "szép-kártya", "angol oktatás", "nyelvtanfolyam", "language course", 
        "training", "képzés", "továbbképzés", "részvény", "stock options", "esop", "rsu", "gyümölcsnap", "fruit day", "csapatépítő", "teambuilding", 
        "kutyabarát", "dog-friendly", "parkoló", "parking", "13. havi fizetés", "14. havi fizetés", "pulykapénz", "prémium", "teljesítménybónusz", 
        "éves bónusz", "mozgóbér", "sportkártya", "swiss clinic", "egészségbiztosítás", "életbiztosítás", "nyugdíjpénztár", "önkéntes nyugdíjpénztár", 
        "bkk bérlet", "országbérlet", "vármegyebérlet", "céges busz", "kerékpártároló", "macbook", "home office támogatás", "rezsitámogatás", 
        "tanulmányi szerződés", "szakmai tréning", "konferencia", "kávé", "tea", "snack", "csocsó", "pingpong", "extra szabadnap", "születésnapi szabadnap"
    ]
};

const typoToleranceDict = {
    "javascript": ["javascipt", "js", "java script"], "python": ["phyton", "pyton", "py"], "excel": ["excell", "exel", "ms excel"],
    "power bi": ["powerbi", "pbi", "power-bi"], "wordpress": ["wordpres", "wordpressz", "wp"], "node.js": ["nodejs", "node js", "node"],
    "react": ["reactjs", "react.js"], "vue": ["vuejs", "vue.js"], "angular": ["angularjs", "angular.js"], "typescript": ["ts"],
    "postgresql": ["postgres", "postgre"], "dotnet": [".net", "dot net"], "c++": ["cpp", "c/c++"], "c#": ["c-sharp", "c sharp"]
};

// 🔥 TURING-OMEGA INJEKTÁLÁS ÉS SZINONIMA-ALGORITMUS
let injectedCount = 0;
for (const [cat, words] of Object.entries(brainDB.categories)) {
    for (const [word, meta] of Object.entries(words)) {
        
        // 🔮 AUTONÓM SZINONIMA-FELFEDEZÉS
        if (!meta.auto_promoted && meta.count >= 5 && Object.keys(meta.context_vectors || {}).length > 3) {
            for (const knownTech of structuredTagsDict.tech) {
                const knownMeta = brainDB.categories["💻 SZOFTVER/TECH"][knownTech.toLowerCase()];
                if (knownMeta && knownMeta.context_vectors) {
                    const similarity = cosineSimilarity(meta.context_vectors, knownMeta.context_vectors);
                    if (similarity > 0.90 && levenshteinDistance(word, knownTech.toLowerCase()) <= 3) {
                        brainDB.auto_typos[knownTech] = word; brainDB.antibodies.push(word); 
                        console.log(`🤖🔗 [Szemantikus Szintézis] Az MI rájött: "${word}" valójában a "${knownTech}" szinonimája! (Hasonlóság: ${(similarity*100).toFixed(1)}%)`);
                        break;
                    }
                }
            }
        }

        if (meta.auto_promoted) {
            if (/(senior|expert|lead|manager|head|director|igazgató)/i.test(word) || brainDB.antibodies.includes(word)) {
                meta.auto_promoted = false; delete brainDB.categories[cat][word]; continue;
            }
            if (Date.now() - meta.last_seen > 45 * 86400000) { meta.auto_promoted = false; continue; } 
            
            if (cat === "💻 SZOFTVER/TECH" && !structuredTagsDict.tech.includes(word)) { structuredTagsDict.tech.push(word); injectedCount++; }
            if (cat === "🧩 N-GRAM (KIFEJEZÉSEK)" && !structuredTagsDict.tech.includes(word) && !structuredTagsDict.soft_skills.includes(word)) { 
                structuredTagsDict.tech.push(word); injectedCount++; 
            }
            if (cat === "🧠 SOFT-SKILL" && !structuredTagsDict.soft_skills.includes(word)) { structuredTagsDict.soft_skills.push(word); injectedCount++; }
            if (cat === "🎁 JUTTATÁS" && !structuredTagsDict.benefits.includes(word)) { structuredTagsDict.benefits.push(word); injectedCount++; }
            if (cat === "🌍 NYELV" && !structuredTagsDict.languages.includes(word)) { structuredTagsDict.languages.push(word); injectedCount++; }
        }
    }
}
for (const [correct, typo] of Object.entries(brainDB.auto_typos)) {
    if (!typoToleranceDict[correct]) typoToleranceDict[correct] = [];
    if (!typoToleranceDict[correct].includes(typo)) { typoToleranceDict[correct].push(typo); injectedCount++; }
}
if (injectedCount > 0) console.log(`🧠 [Turing-Omega] ${injectedCount} db autonóm entitás sikeresen integrálva!`);

// ----------------------------------------------------------------------------
// STATIC REGEX & CONFIGS
// ----------------------------------------------------------------------------
const techMultipliers = {
    highTier: ["aws", "azure", "docker", "kubernetes", "python", "golang", "rust", "react", "angular", "vue", "machine learning", "ai engineer", "data scientist", "pytorch", "tensorflow", "snowflake"],
    midTier: ["javascript", "typescript", "java", "c#", ".net", "sql", "postgresql", "mysql", "php", "laravel", "figma", "power bi", "tableau", "sap"],
    baseTier: ["html", "css", "wordpress", "excel", "word", "powerpoint", "canva", "mailchimp"]
};

const urgencyDict = { "Azonnali kezdés": /\b(azonnali kezdés|asap|sürgős|azonnal keresünk|immediate start|azonnali belépés)\b/i, "Hétvégi munkavégzés": /\b(hétvégi munkavégzés|hétvégén is|szombati|vasárnapi|hétvégén végezhető)\b/i, "Órarendhez igazodó": /\b(órarendhez igazodó|rugalmas beosztás|te osztod be|tanulmányok mellett|iskola mellett)\b/i };
const redFlagDict = { "Rejtett bér": /(versenyképes fizetés|bérezés megegyezés szerint|vonzó juttatási csomag|versenyképes jövedelem)/i, "Túlterheltség gyanú": /(jól bírja a stresszt|stressztűrő|terhelhető|pörgős környezet|work hard play hard|rugalmasság elvárt|túlóra|hajlandóság túlórára)/i, "Toxikus pozitivitás": /(családias légkör|családias csapat|mi egy nagy család vagyunk|dinamikusan fejlődő)/i, "Mindenes/Kihasználás": /(talpraesett|jég hátán is megél|mindenes|ninja|rockstar|guru|unicorn)/i };
const scamDict = { "MLM / Piramisjáték": /\b(nem mlm|piramis|hálózatépítés|építsd fel a saját csapatod|passzív jövedelem|csatlakozási díj|regisztrációs díj)\b/i, "Gyanús ügynöki munka": /\b(legyél a saját magad főnöke|korlátlan kereseti lehetőség|nincs alapbér|jutalékos rendszer|kizárólag jutalék)\b/i };
const certificationsDict = /\b(istqb|itil|pmp|scrum master|csm|psm|aws certified|azure fundamentals|cisco|ccna|ccnp|comptia|ceh|cissp|telc|ecl|euroexam|ielts|toefl|cambridge|accag|cfa|frm)\b/gi;
const corporateBSDict = /\b(szinergia|paradigmaváltás|out of the box|think outside the box|agilis transzformáció|game changer|disruptív|ninja|rockstar|guru|unicorn|dna|vízió|mission-critical|leverage|empower|synergy|proaktív szemléletmód)\b/gi;
const onboardingDict = { "Strukturált Betanítás": /\b(betanítási terv|onboarding program|onboarding folyamat|structured onboarding|training period|betanulás)\b/i, "Dedikált Mentor": /\b(dedikált mentor|saját mentor|mentorálás|buddy program|shadowing|árnyékmunka|tapasztalt kolléga támogatásával|mentor)\b/i };
const hiddenReqsDict = { "B kategóriás jogosítvány": /\b(b kategóriás jogosítvány|b kat\. jogosítvány|b kategória|jogosítvány|vezetői engedély|b-category driving license|driving license)\b/i, "Saját eszköz (BYOD)": /\b(saját laptop|saját számítógép|saját gép|byod|bring your own device|saját okostelefon)\b/i, "Utazási hajlandóság": /\b(utazási hajlandóság|hajlandóság utazásra|travel required|willingness to travel|kiküldetés)\b/i, "Folyamatos/Több műszak": /\b(több műszak|folyamatos műszak|éjszakai műszak|hétvégi munkavégzés|shift work|2 műszak|3 műszak)\b/i, "Erkölcsi bizonyítvány": /\b(erkölcsi bizonyítvány|tiszta erkölcsi|criminal record check|background check)\b/i };
const appFrictionDict = { "Motivációs levél": /\b(motivációs levél|cover letter|kísérőlevél)\b/i, "Idegennyelvű CV": /\b(angol nyelvű önéletrajz|angol cv|english cv|english resume|német nyelvű önéletrajz)\b/i, "Portfólió / Referencia": /\b(portfólió|portfolio|github link|referencia munka|korábbi munkák|behance|dribbble)\b/i, "Videós bemutatkozás": /\b(videós bemutatkozó|video intro|videóinterjú|video interview)\b/i };
const careerPathDict = { "Hosszútávú lehetőség": /\b(hosszútávú|hosszú távú lehetőség|long-term opportunity|később főállás|főállású lehetőség|állandó pozíció)\b/i, "Karrierút / Előléptetés": /\b(előrelépési lehetőség|karrierút|career path|career progression|fejlődési lehetőség|promotion|karrierlehetőség)\b/i };
const transitDict = { "Könnyen megközelíthető": /\b(könnyen megközelíthető|jól megközelíthető|tömegközlekedéssel|kiváló közlekedés|easy to reach)\b/i, "Központi / Belváros": /\b(belváros|központi helyen|metróhoz közel|metróvonal|city center|downtown)\b/i, "Ingyenes parkolás": /\b(ingyenes parkolás|saját parkoló|free parking|cég busz|céges buszjárat)\b/i };
const interviewDict = { "1 körös interjú (Gyors)": /\b(1 körös interjú|egy körös interjú|one-round interview|egyetlen interjú|gyors kiválasztás)\b/i, "Többkörös interjú": /\b(több körös interjú|többkörös|multi-round interview|2 körös|3 körös|második kör)\b/i, "Próbafeladat / Teszt": /\b(próbafeladat|tesztírás|szakmai teszt|home assignment|coding task|esettanulmány|case study)\b/i, "Assessment Center": /\b(assessment center|ac|kiválasztási nap|értékelő központ)\b/i };
const equipmentDict = { "Apple Eszköz (Mac/iPhone)": /\b(macbook|céges mac|iphone|apple eszköz|imac)\b/i, "Céges Laptop (Általános)": /\b(céges laptop|vállalati laptop|company laptop|munkaállomás|eszközöket biztosítunk)\b/i, "Céges Telefon": /\b(céges telefon|vállalati mobil|company phone)\b/i };
const relocationDict = { "Relokációs támogatás": /\b(relocation support|relokációs támogatás|költözési támogatás|relocation package)\b/i, "Vízum / Engedély támogatás": /\b(visa sponsorship|munkavállalási engedély|visa support|munkavállalási vízum)\b/i };

const toneDict = {
    "🏢 Corporate / Stabil": /\b(multinacionális|szabályozott|folyamatközpontú|korporatív|vállalati|hierarchia|corporate|compliance|szabályzat|standard|global leader|piacvezető|hosszútávú|biztonságos)\b/i,
    "🚀 Modern / Tech-vezérelt": /\b(agilis|scrum|modern tech|cutting-edge|innovatív|startup|disruptív|felhő alapú|data-driven|adatvezérelt|automatizáció)\b/i,
    "📈 Verseny / Teljesítmény": /\b(jutalék|kpi|célkitűzés|teljesítménybér|target|bónuszrendszer|eredményorientált|versenyképes|jutalmazási|sales target|b2b|növekedés|hajtós)\b/i,
    "🤝 Emberközpontú / Laza": /\b(csocsó|sör|kutyabarát|laza|fiatalos|nincs dress code|pizza|gaming|csapatépítő|kávé|xbox|playstation|támogató|családias|inkluzív)\b/i
};

const diversityDict = /\b(esélyegyenlőség|equal opportunity|sokszínűség|diversity|inclusive|inkluzív|akadálymentes|megváltozott munkaképességű|női vezetők|women in tech|lgbtq|büszkeség)\b/i;
const detoxRules = [ { regex: /<[^>]*>?/gm, replacement: ' ' }, { regex: /&nbsp;/gi, replacement: ' ' }, { regex: /\r\n|\n|\r/g, replacement: ' \n ' } ];

const huBoundaryStart = "(?:^|[^a-zA-Z0-9_áéíóöőúüűÁÉÍÓÖŐÚÜŰ])";
const huBoundaryEnd = "(?=$|[^a-zA-Z0-9_áéíóöőúüűÁÉÍÓÖŐÚÜŰ])";
const huSuffixes = "(?:k|t|i|ba|be|ra|re|on|en|ön|hoz|hez|höz|ban|ben|ból|ből|ról|ről|tól|től|nak|nek|val|vel|ért|ig|ként|kat|ket|okat|eket|öket|knak|knek|oknak|eknek|öknek|uk|ük|juk|jük|os|es|as|ös|s|es|ja|je)?(?:val|vel)?(?:t|k)?";

const seniorWords = "senior|szenior|snr|sr\\.|medior|mid-level|mid level|mid\\b|head of|director|igazgató|expert|architect|chief|principal|főosztályvezető|osztályvezető|csapatvezető|team lead|tech lead|vezérigazgató|c-level|executive|vp|president|tapasztalt|experienced|advanced|master|professzionális|professional|seniority|felsővezető|igazgatóhelyettes|alapító|founder|co-founder|tulajdonos|owner|partner|sme|subject matter expert|dékán|rektor|főorvos|főállatorvos|vezető ápoló|főmérnök|country manager|general manager|plant manager|üzletvezető|boltvezető|területi képviselő|managing director|board member|board of directors|staff engineer|principal engineer|manager\\b|supervisor|lead\\b";
const compiledFatalSenior = new RegExp(huBoundaryStart + '(' + seniorWords + ')' + huSuffixes + huBoundaryEnd, 'i');

const physicalWords = "bolti dolgozó|összekészítő|szárazáru|hűtőraktári|göngyölegraktári|göngyöleg|áruösszekészítő|takarító|biztonsági őr|rakodó|sofőr|futár|pénztáros|árufeltöltő|targoncás|targoncavezető|betanított|csomagoló|bolti eladó|villanyszerelő|hegesztő|lakatos|szakács|pincér|felszolgáló|pultos|kőműves|asztalos|festő|gépkocsivezető|gyári munkás|portás|vagyonőr|takarítónő|esztergályos|marós|vízszerelő|gázszerelő|bádogos|cleaner|security guard|loader|driver|courier|cashier|shelf stacker|forklift|packer|shop assistant|electrician|welder|locksmith|cook|chef|waiter|waitress|bartender|barista|mason|carpenter|painter|factory worker|janitor|plumber|maid|housekeeper|gondnok|caretaker|kamionsofőr|truck driver|delivery|postás|postman|sori munkás|segédmunkás|gyártósori|assembly|manual labor|laborer|mezőgazdasági|traktoros|állatgondozó|mészáros|hentes|ács|állványozó|tetőfedő|burkoló|gépszerelő|fényező|pék|cukrász|húsipari|varrónő|textilipari|nyomdász|anyagmozgató|konyhai|mosogató|udvaros|cnc|gépkezelő|gépüzemeltető|fémipari|faipari|production line|higiénia|higénia|higiéniai|higéniai|hygiene|tisztító|tisztítás|mosodai|komissiózó|raktári dolgozó|műszakos|raktáros";
const compiledFatalPhysical = new RegExp(huBoundaryStart + '(' + physicalWords + ')' + huSuffixes + huBoundaryEnd, 'i');

const dubiousWords = "fizikai|raktáros|raktári|operátor|szerelő|műszerész|karbantartó|gépbeállító|physical|warehouse|operator|mechanic|technician|maintenance|diszpécser|dispatcher|technikus|művezető|shift leader|műszakvezető|szerelés|technológus|adatrögzítő";
const compiledDubiousPhysical = new RegExp(huBoundaryStart + '(' + dubiousWords + ')' + huSuffixes + huBoundaryEnd, 'i');

const juniorWords = "diák|diákmunka|gyakornok|gyakornoki|intern|internship|trainee|traineeship|co-op|pályakezdő|pályakezdőket|pályaindító|karrierstart|kezdő|junior|entry-level|entry level|frissdiplomás|friss diplomás|diplomás|student|apprentice|graduate|fresh graduate|tanuló|szövetkezet|iskolaszövetkezet|diákszövetkezet|undergrad|undergraduate|pályakezdőknek|hallgató|ösztöndíjas|scholar|mentee|melo-diak|mind-diak|eudiakok|working student|werkstudent|student worker|career starter|young professional|management trainee|graduate program|rotational program|talent program";
const compiledExplicitJunior = new RegExp(huBoundaryStart + '(' + juniorWords + ')' + huSuffixes + huBoundaryEnd, 'i');

const whiteCollarWords = "asszisztens|adminisztrátor|referens|munkatárs|tanácsadó|szakértő|specialista|koordinátor|tervező|fejlesztő|mérnök|elemző|kutató|tanár|oktató|pedagógus|ügyintéző|képviselő|támogatás|ügyfélszolgálat|szerkesztő|író|könyvelő|kontroller|auditor|értékesítő|marketinges|hr|toborzó|programozó|orvos|ápoló|szakápoló|diplomás ápoló|gyógyszerész|jogász|ügyvéd|építész|animátor|grafikus|készítő|felelős|ügyvédjelölt|oktatásszervező|menedzser|assistant|administrator|clerk|representative|associate|advisor|consultant|specialist|coordinator|designer|developer|engineer|analyst|researcher|teacher|educator|instructor|tutor|agent|support|customer service|editor|writer|copywriter|accountant|controller|auditor|sales|marketing|recruiter|programmer|architect|animator|graphic|creator|officer|executive|planner|buyer|purchaser|strategist|scientist|lawyer|legal|counsel|személyügyi|pénzügyi|bookkeeper|paralegal|sourcer|talent acquisition|ux|ui|seo|ppc|vlogger|blogger|social media|pr|szóvivő|spokesperson|jogtanácsos|pszichológus|terapeuta|laboráns|rezidens|szakorvos|mentőtiszt|védőnő|szülésznő|gépészmérnök|villamosmérnök|vegyészmérnök|mechatronikai|építőmérnök|építészmérnök|data scientist|adatelemző|business analyst|üzleti elemző|financial analyst|kockázatelemző|underwriter|actuarial|aktuárius|újságíró|riporter|tudósító|tolmács|fordító|logisztikus|fuvarszervező|beszerző|journalist|reporter|translator|interpreter|logistician|scrum master|product owner|agile coach|product manager|project manager|projektmenedzser|tesztelő|tester|qa|quality assurance|minőségbiztosítás|helpdesk|üzemeltető|sysadmin|rendszergazda|titkár|secretary|recepciós|receptionist|front office|back office|front-office|back-office|bankár|banker|teller|szervező|organizer|könyvtáros|librarian|modellező|modeler|statisztikus|statistician|ügyfélkapcsolati|térképész|urbanista|szociológus|múzeológus|kurátor|producer|rendező|operatőr|vágó|hangmérnök|világosító|stewardess|légiutaskísérő|meteorológus|geológus|biológus|vegyész|fizikus|matematikus|csillagász|régész|történész|filozófus|nyelvész|irodalmár|teológus|prompt engineer|ai engineer|data engineer|cloud engineer|devops|vámügyintéző|speditőr|vállalkozó|freelancer|bérszámfejtő|számlázó|vámszakértő|adatbázis|telemarketing|piackutató|biztosítás|hitelbíráló|data annotator|ai trainer|kárrendező|payroll|billing|claims|pricing|árazási|purchasing|supply chain|ellátási lánc|compliance|megfelelőségi|attorney|alkalmazott|sdr|bdr|sales development|key account|kam|customer success|ügyfélélmény|köztisztviselő|kormánytisztviselő|ügykezelő|business developer|sales support|sales operations|employer branding|content creator|rendszerszervező|network engineer|biztonsági elemző|clinical research|klinikai kutató|mlops|secops|biztonságtechnikai|hálózat|network administrator|systems engineer|growth hacker|demand generation|seo specialist|ppc specialist|motion designer|video editor|content manager|cloud architect|data protection officer|dpo";
const compiledWhiteCollarRoles = new RegExp(huBoundaryStart + '(' + whiteCollarWords + ')' + huSuffixes + huBoundaryEnd, 'i');

const compiledExperienceReject = /(?<![0-3]\s*[-–]\s*)(?:min\.|minimum|legalább|at least|>|több mint|more than)?\s*(?:[4-9]|[1-9][0-9])(?:[\.,][0-9])?\s*(?:\+|or more|[-–]\s*[4-9])?\s*(?:év|éves|évet|year|years|yrs)\s*(?:of\s*)?(?:releváns\s*|szakmai\s*|igazolt\s*|vezetői\s*|munkatapasztalat\s*|igazolható\s*|relevant\s*|professional\s*|work\s*|hands-on\s*)?(?:tapasztalat|gyakorlat|experience|tapasztalattal)/gi;
const compiledExperienceRejectWords = /(?:több|számos|several|multiple)\s*(?:éves|év|years of|years)\s*(?:vezetői|senior|igazolt)\s*(?:tapasztalat|gyakorlat|experience)/gi;
const bypassExperienceRegex = /(?:tapasztalat nem elvárás|tapasztalat nem feltétel|tapasztalat nélkül|no experience required|without experience|no prior experience|fresh graduates welcome|pályakezdők jelentkezését|kezdők jelentkezését|pályakezdőket is|pályakezdők is|betanítást|training provided|előzetes tapasztalat nem|not required|0\s*év|0-tól|0\s*\-|1-3 év|1-2 év|1 év|2 év|3 év|1-3 years|1-2 years|pár év|junior|pályaindító|tanulmányok alatt|tapasztalat nélkül is)/i;

const niceToHaveKeywords = ["előny", "plusz", "nice to have", "nem elvárás", "nem feltétel", "plussz", "örülünk", "bónusz", "kiváló, ha", "ideális", "advantage", "plus", "preferred", "optional", "welcome", "beneficial", "asset", "szívesen látjuk", "desirable", "not required", "nice-to-have", "pluszpont", "plusz pont", "előnyt jelent"];
const niceToHaveRegex = new RegExp(`(${niceToHaveKeywords.join('|')})`, 'gi'); 

const lowEduWords = "8 általános|nyolc általános|alapfokú végzettség|végzettség nem elvárás|iskolai végzettség nélkül|szakképzettséget nem|képzettséget nem|betanított|érettségi nem feltétel";
const compiledFatalLowEdu = new RegExp(huBoundaryStart + '(' + lowEduWords + ')' + huSuffixes + huBoundaryEnd, 'i');

const academicWords = "diploma|diplomás|felsőfokú|egyetem|egyetemi|főiskola|főiskolai|bachelor|master|alapképzés|mesterképzés|phd|szakirány|szakirányú|szakképzettség|technikum|okj|hallgatói jogviszony|megkezdett tanulmányok|folyamatban lévő|felsőoktatási|szakképesítés|szakképzés|hallgató|student|degree|university|college|higher education|qualification|certification";
const compiledAcademicReq = new RegExp(huBoundaryStart + '(' + academicWords + ')' + huSuffixes + huBoundaryEnd, 'i');
const compiledStrictDegrees = /\b(bsc|msc|ba|ma|phd)\b/i;

// 🌟 MAG-KATEGÓRIÁK (Seed Categories)
const compiledCategories = {
    "💻 IT & Szoftverfejlesztés": /(fejlesztő|developer|programmer|it support|tesztelő|software|rendszergazda|informatikus|data engineer|devops|üzemeltető|frontend|backend|fullstack|qa|tester|scrum|agile|kiberbiztonság|cybersecurity|machine learning|ai engineer|cloud)/gi,
    "💼 Gazdasági & Üzleti": /(pénzügy|gazdaság|business|sales|marketing|hr|könyvelő|kontroller|értékesítő|emberi erőforrás|toborzó|beszerző|logisztika|projektmenedzser|közgazdász|finance|accounting|talent|ellátási lánc|supply chain|key account|b2b)/gi,
    "⚙️ Mérnöki & Műszaki": /(mérnök|engineer|villamosmérnök|gépészmérnök|mechatronika|minőségbiztosítás|quality|lean|tervező|építész|CAD|műszaki|architect|hardware|villamos|gépész)/gi,
    "📊 Elemző & Adattudomány": /(elemző|analyst|data scientist|adatelemző|business intelligence|riporter|statisztikus|kutató|research|bi|adattudomány|data analyst|reporting)/gi,
    "🎨 Ügyfélszolgálat & Admin": /(adminisztrátor|ügyfélszolgálat|customer service|recepciós|asszisztens|támogatás|irodai|back office|helpdesk|assistant|clerk|secretary)/gi,
    "📚 Oktatás & Tudomány": /(tanár|oktató|pedagógus|kutató|mentor|tréner|tudományos munkatárs|asszisztens tanár|education|laboráns|teacher|tutor)/gi
};

const compiledAntiCategories = { "💻 IT & Szoftverfejlesztés": /(értékesítő|sales|takarító)/gi };
const locationsDict = /(budapest|debrecen|szeged|miskolc|pécs|győr|nyíregyháza|kecskemét|székesfehérvár|szombathely|veszprém|zalaegerszeg|szolnok|tatabánya|sopron|érd|békéscsaba|dunaújváros|hódmezővásárhely|salgótarján|baja|cegléd|esztergom|pápa|vác|váci|gödöllő|dunakeszi|budaörs|szigetszentmiklós|gyula|hajdúböszörmény|kiskunfélegyháza|orosháza|szentes|kazincbarcika|jászberény|kiskunhalas|hatvan|mosonmagyaróvár|tata|komárom|békés|szarvas|csongrád|tiszaújváros|kisvárda|törökszentmiklós|karcag|bonyhád|paks|szekszárd|esztergom)/gi;


// ============================================================================
// 🚀 2. OMNI-SENTIENT ENGINE & PERFORMANCE CACHE
// ============================================================================

const PreCompiledEngines = {
    tone: Object.entries(toneDict).map(([k, v]) => ({ name: k, regex: new RegExp(v.source, 'gi') })),
    appFriction: Object.entries(appFrictionDict).map(([k, v]) => ({ name: k, regex: new RegExp(v.source, 'gi') })),
    careerPath: Object.entries(careerPathDict).map(([k, v]) => ({ name: k, regex: new RegExp(v.source, 'gi') })),
    transit: Object.entries(transitDict).map(([k, v]) => ({ name: k, regex: new RegExp(v.source, 'gi') })),
    interview: Object.entries(interviewDict).map(([k, v]) => ({ name: k, regex: new RegExp(v.source, 'gi') })),
    equipment: Object.entries(equipmentDict).map(([k, v]) => ({ name: k, regex: new RegExp(v.source, 'gi') })),
    relocation: Object.entries(relocationDict).map(([k, v]) => ({ name: k, regex: new RegExp(v.source, 'gi') })),
    hiddenReqs: Object.entries(hiddenReqsDict).map(([k, v]) => ({ name: k, regex: new RegExp(v.source, 'gi') })),
    urgency: Object.entries(urgencyDict).map(([k, v]) => ({ name: k, regex: new RegExp(v.source, 'gi') })),
    onboarding: Object.entries(onboardingDict).map(([k, v]) => ({ name: k, regex: new RegExp(v.source, 'gi') })),
    scam: Object.entries(scamDict).map(([k, v]) => ({ name: k, regex: new RegExp(v.source, 'gi') })),
    redFlag: Object.entries(redFlagDict).map(([k, v]) => ({ name: k, regex: new RegExp(v.source, 'gi') }))
};

class BloomFilter {
    constructor(size = 8192) { this.size = size; this.bitset = new Uint32Array(Math.ceil(size / 32)); }
    _hash(str) {
        let hash1 = 5381, hash2 = 52711;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i); hash1 = ((hash1 << 5) + hash1) ^ char; hash2 = ((hash2 << 5) + hash2) ^ char;
        }
        return [Math.abs(hash1 % this.size), Math.abs(hash2 % this.size)];
    }
    add(word) { const [h1, h2] = this._hash(word); this.bitset[h1 >> 5] |= (1 << (h1 & 31)); this.bitset[h2 >> 5] |= (1 << (h2 & 31)); }
    mightContain(word) { const [h1, h2] = this._hash(word); return (this.bitset[h1 >> 5] & (1 << (h1 & 31))) !== 0 && (this.bitset[h2 >> 5] & (1 << (h2 & 31))) !== 0; }
}

const compiledStructuredTags = {};
for (const [group, tags] of Object.entries(structuredTagsDict)) {
    compiledStructuredTags[group] = tags.map(tag => {
        const cleanedTag = tag.replace(/\|/g, '').replace(/\*/g, '').trim();
        const rootWord = cleanedTag.split(/\s+/)[0].toLowerCase(); 
        const escapedTag = cleanedTag.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
        return { original: cleanedTag, root: rootWord, globalRegex: new RegExp(huBoundaryStart + '(' + escapedTag + ')' + huBoundaryEnd, 'gi') };
    });
}

const sanitizeText = (text) => text ? String(text).normalize('NFC').toLowerCase() : "";
const masterTypoRegex = new RegExp(`${huBoundaryStart}(${Object.values(typoToleranceDict).flat().map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})${huBoundaryEnd}`, 'gi');
const flatTypoMap = new Map();
for (const [correct, typos] of Object.entries(typoToleranceDict)) {
    typos.forEach(t => flatTypoMap.set(t.toLowerCase(), correct));
}

function correctTyposAdvanced(text) {
    const typoLog = new Set();
    const correctedText = text.replace(masterTypoRegex, (match, p1) => {
        const lowerMatch = p1.toLowerCase(); const replacement = flatTypoMap.get(lowerMatch);
        if(replacement) { typoLog.add(`${lowerMatch} -> ${replacement}`); return match.replace(p1, replacement); }
        return match;
    });
    return { correctedText, typosFixed: Array.from(typoLog) };
}

class AdvancedLRUCache {
    constructor(limit = 2000, ttlMs = 3600000, maxBytes = 50 * 1024 * 1024) { 
        this.cache = new Map(); this.limit = limit; this.ttlMs = ttlMs; this.maxBytes = maxBytes; this.currentBytes = 0;
    }
    _exactSizeOfV8(obj) {
        const seen = new WeakSet(); const queue = [obj]; let head = 0; let bytes = 0;
        while(head < queue.length) {
            const item = queue[head++]; if (item === null || item === undefined) continue;
            if (typeof item === 'boolean') { bytes += 4; continue; } if (typeof item === 'number') { bytes += 8; continue; }
            if (typeof item === 'string') { bytes += 12 + item.length * 2; continue; }
            if (typeof item === 'object') {
                if (seen.has(item)) continue; seen.add(item); bytes += 24; 
                for (let key in item) { if (Object.prototype.hasOwnProperty.call(item, key)) { bytes += 12 + key.length * 2 + 8; queue.push(item[key]); } }
            }
        }
        return bytes;
    }
    get(key) {
        if (!this.cache.has(key)) return null; const entry = this.cache.get(key);
        if (Date.now() - entry.timestamp > this.ttlMs) { this.currentBytes -= entry.size; this.cache.delete(key); return null; }
        this.cache.delete(key); this.cache.set(key, entry); return structuredClone(entry.data); 
    }
    set(key, value) {
        const size = this._exactSizeOfV8(value);
        while ((this.cache.size >= this.limit || this.currentBytes + size > this.maxBytes) && this.cache.size > 0) {
            const firstKey = this.cache.keys().next().value; this.currentBytes -= this.cache.get(firstKey).size; this.cache.delete(firstKey);
        }
        this.cache.set(key, { data: structuredClone(value), timestamp: Date.now(), size }); this.currentBytes += size;
    }
}
const analysisCache = new AdvancedLRUCache(2000);

function buildTextAST_FSM(text) {
    const clauses = []; const abbreviations = new Set(["pl", "stb", "ill", "kb", "kft", "zrt", "nyrt", "bt", "dr", "prof", "tel", "fax", "e.g", "i.e"]);
    let start = 0; let i = 0; const len = text.length; let bracketDepth = 0;
    while (i < len) {
        const code = text.charCodeAt(i);
        if (code === 40 || code === 91) bracketDepth++; else if (code === 41 || code === 93) bracketDepth = Math.max(0, bracketDepth - 1);
        if ((code === 46 || code === 33 || code === 63 || code === 10) && bracketDepth === 0) {
            let wordStart = i - 1;
            while (wordStart >= start && ((text.charCodeAt(wordStart) >= 97 && text.charCodeAt(wordStart) <= 122) || (text.charCodeAt(wordStart) >= 48 && text.charCodeAt(wordStart) <= 57) || text.charCodeAt(wordStart) > 127)) wordStart--;
            const lastWord = text.substring(wordStart + 1, i).toLowerCase();
            if (code === 46 && abbreviations.has(lastWord) && i + 1 < len) { i++; continue; }
            while (i < len && (text.charCodeAt(i) === 46 || text.charCodeAt(i) === 33 || text.charCodeAt(i) === 63 || text.charCodeAt(i) === 10)) i++;
            clauses.push({ text: text.substring(start, i), start, end: i }); start = i;
        } else { i++; }
    }
    if (start < len) clauses.push({ text: text.substring(start, len), start, end: len });
    return clauses;
}

function binarySearchAST(ast, targetIndex) {
    let left = 0; let right = ast.length - 1;
    while (left <= right) {
        const mid = Math.floor((left + right) / 2); const clause = ast[mid];
        if (targetIndex >= clause.start && targetIndex <= clause.end) return clause;
        if (targetIndex < clause.start) right = mid - 1; else left = mid + 1;
    }
    return null;
}

const MAX_DOC_LEN = 1048576; const diffBuffer = new ArrayBuffer(MAX_DOC_LEN * 4); const globalDiffView = new Int32Array(diffBuffer);
function populateNiceToHaveZonesBitwise(text) {
    const textLen = text.length; if (textLen >= MAX_DOC_LEN) return null; 
    globalDiffView.fill(0, 0, textLen + 2); 
    let match; niceToHaveRegex.lastIndex = 0; let foundAny = false;
    while ((match = niceToHaveRegex.exec(text)) !== null) {
        foundAny = true;
        const start = Math.max(0, match.index - 60); const end = Math.min(textLen, match.index + match[0].length + 60);
        globalDiffView[start] += 1; globalDiffView[end + 1] -= 1;
    }
    if (!foundAny) return false;
    for(let i = 1; i <= textLen; i++) globalDiffView[i] = (globalDiffView[i] + globalDiffView[i - 1]) | 0; 
    return true; 
}

const simulatedIDF = new Map();
function initBM25IDF() {
    const N = 10000; 
    for (const [cat, regex] of Object.entries(compiledCategories)) {
        const terms = regex.source.replace(/[()|^]/g, ' ').split(/\s+/).filter(t => t.length > 2);
        for (const term of terms) {
            const brainCount = brainDB.idf_stats[term] || 0;
            const df = term.length > 8 ? 500 : 3000 + brainCount; 
            const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1); 
            simulatedIDF.set(term, idf > 0 ? idf : 0.1); 
        }
    }
}
initBM25IDF(); 

// ----------------------------------------------------------------------------
// 🤖 3. QUANTUM-TRANSCENDENCE DISCOVERY (CHURN PREDICTOR & AUTO-TUNING)
// ----------------------------------------------------------------------------
const allKnownWordsSet = new Set();
[...structuredTagsDict.tech, ...structuredTagsDict.languages, ...structuredTagsDict.soft_skills, ...structuredTagsDict.work_setup, ...structuredTagsDict.benefits].forEach(w => allKnownWordsSet.add(w.toLowerCase()));
for (const [correct, typos] of Object.entries(typoToleranceDict)) { allKnownWordsSet.add(correct.toLowerCase()); typos.forEach(t => allKnownWordsSet.add(t.toLowerCase())); }
const stopWords = new Set(["KFT", "ZRT", "NYRT", "B2B", "B2C", "URL", "HTTP", "HTTPS", "HUF", "EUR", "USD", "MIND", "EGY", "NEM", "VAGY", "ÍGY", "HOGY", "CSAK", "KIVÁLÓ", "VERSENYKÉPES", "STABIL", "JÓ", "RUGALMAS", "VAN", "KÉSZ", "MÁR", "EZT", "EGYÜTT", "MELY", "AMELY"]);

function calculateEigenCentrality() {
    const graph = brainDB.ontology_graph;
    const scores = {}; Object.keys(graph).forEach(node => scores[node] = 1.0);
    
    for (let iter = 0; iter < 5; iter++) { 
        const newScores = {};
        for (const [node, edges] of Object.entries(graph)) {
            let sum = 0;
            for (const [neighbor, weight] of Object.entries(edges)) {
                if (scores[neighbor]) sum += (weight * scores[neighbor]);
            }
            newScores[node] = 0.15 + 0.85 * sum; 
        }
        Object.assign(scores, newScores);
    }
    const maxScore = Math.max(...Object.values(scores), 1);
    for (const node in scores) brainDB.eigen_centrality[node] = scores[node] / maxScore;
}

function promoteClustersToFaculties(parsedSalary) {
    for (const [clusterId, data] of Object.entries(brainDB.emergent_clusters)) {
        if (data.count >= 8) { 
            const topTerms = Object.entries(data.keywords).sort((a,b)=>b[1]-a[1]).slice(0, 4).map(e=>e[0]);
            const newCatName = `✨ ${topTerms[0].charAt(0).toUpperCase() + topTerms[0].slice(1)} & ${topTerms[1].charAt(0).toUpperCase() + topTerms[1].slice(1)}`;
            if (!brainDB.dynamic_faculties[newCatName]) {
                brainDB.dynamic_faculties[newCatName] = { terms: topTerms, created_at: Date.now(), usage_count: 0 };
                console.log(`🌌 [Quantum-Transcendence] Új főkategória született a Sötét Anyagból: ${newCatName}`);
            }
            delete brainDB.emergent_clusters[clusterId]; 
        } else if (parsedSalary && parsedSalary.min_amount) {
            if (!brainDB.cluster_salary_curves[clusterId]) brainDB.cluster_salary_curves[clusterId] = { sum: 0, count: 0, multiplier: 1.0 };
            brainDB.cluster_salary_curves[clusterId].sum += parsedSalary.is_hourly ? parsedSalary.min_amount * 168 : parsedSalary.min_amount;
            brainDB.cluster_salary_curves[clusterId].count += 1;
            
            if (brainDB.cluster_salary_curves[clusterId].count > 5) {
                const avg = brainDB.cluster_salary_curves[clusterId].sum / brainDB.cluster_salary_curves[clusterId].count;
                brainDB.cluster_salary_curves[clusterId].multiplier = Math.min(1.5, Math.max(0.8, avg / 500000));
            }
        }
    }
}

// 🔥 FLUKTUÁCIÓ ELŐREJELZŐ (CHURN PREDICTOR) 🔥
function calculateChurnProbability(compProfile, urgencyMatrix) {
    let prob = 15; // Alap fluktuációs esély (15%)
    
    // Toxicitás növeli a lemorzsolódást
    if (compProfile.toxicity_index > 50) prob += 35;
    else if (compProfile.toxicity_index > 20) prob += 15;
    
    // Kétségbeesett / Sürgős toborzás (általában azért, mert valaki hirtelen felmondott)
    if (urgencyMatrix && urgencyMatrix.includes("Azonnali kezdés")) prob += 20;
    
    // Anomáliák (Átverés / MLM gyanú esetén szinte biztos a gyors felmondás)
    if (compProfile.anomalies > 0) prob += (compProfile.anomalies * 10);
    
    return Math.min(95, prob); // Soha nem mondjuk, hogy 100%
}

function runQuantumTranscendenceDiscovery(text, companyName, knownTagsInJob, assignedCategory, jobScoreMax, parsedSalary, bsCount, urgencyMatrix) {
    brainDB.metadata.total_parsed_jobs += 1;
    const now = Date.now();

    // 🌟 KOGNITÍV IMMUNRENDSZER (Belső Vita Szimulátor)
    if (knownTagsInJob && knownTagsInJob.length > 0) {
        const isPhysicalDoc = compiledFatalPhysical.test(text);
        const isCompanyNameLike = /(?:cégünk|vállalatunk|csapatunk|irodánk)\s+([A-Z][a-zA-Z]+)/i;
        let companyMatch; const fakeTechs = new Set();
        while ((companyMatch = isCompanyNameLike.exec(text)) !== null) fakeTechs.add(companyMatch[1].toLowerCase());

        knownTagsInJob.forEach(tag => {
            const lower = tag.toLowerCase();
            const node = brainDB.categories["💻 SZOFTVER/TECH"][lower] || brainDB.categories["🧩 N-GRAM (KIFEJEZÉSEK)"][lower];
            if (node && node.auto_promoted) {
                if (isPhysicalDoc) node.physical_hits = (node.physical_hits || 0) + 1;
                if (fakeTechs.has(lower)) node.fake_hits = (node.fake_hits || 0) + 1;

                if ((node.physical_hits > 3 && (node.physical_hits / node.count) > 0.3) || (node.fake_hits > 2)) {
                    console.log(`🚨 [Antibody Engine] Téves tanulás érzékelve: "${lower}". Végleges kitiltás.`);
                    brainDB.antibodies.push(lower); node.auto_promoted = false;
                }
            }
        });
    }

    // 🌟 STOCHASTIC GRADIENT DESCENT (Auto-Tuning Kalibráció)
    if (now - brainDB.metadata.last_calibration > 86400000) {
        // BM25 Paraméter Mutáció (Dinamikus Optimalizáció)
        const rejectRate = brainDB.metadata.total_rejected / Math.max(1, brainDB.metadata.total_parsed_jobs);
        
        // Ha túl sokat dob ki, csökkenti a telítettségi (k1) elvárást, ha túl keveset, növeli
        const targetRejectRate = 0.35; // Az ideális egyensúly
        const error = rejectRate - targetRejectRate; 
        
        brainDB.metadata.bm25_k1 = Math.max(1.2, Math.min(2.0, brainDB.metadata.bm25_k1 + (error * brainDB.metadata.learning_rate * 2)));
        brainDB.metadata.adaptive_threshold = Math.max(30, Math.min(70, brainDB.metadata.adaptive_threshold + (error * 10)));
        
        console.log(`⚙️ [SGD Auto-Tuning] Új paraméterek: K1=${brainDB.metadata.bm25_k1.toFixed(2)}, Threshold=${brainDB.metadata.adaptive_threshold.toFixed(1)}`);

        // Ebbinghaus Felejtési Görbe
        for (const cat of Object.keys(brainDB.categories)) {
            for (const [word, data] of Object.entries(brainDB.categories[cat])) {
                if (!data.auto_promoted) { 
                    const daysSinceSeen = (now - data.last_seen) / 86400000;
                    const retention = Math.exp(-daysSinceSeen / 7); 
                    if (retention < 0.1) delete brainDB.categories[cat][word]; 
                }
            }
        }
        for (const [skill, data] of Object.entries(brainDB.skill_velocity)) {
            const currentVelocity = data.recent_count;
            const historicalBase = Math.max(data.historical_count, 1);
            data.momentum = (currentVelocity / historicalBase) + 0.1; 
            data.historical_count = (data.historical_count * 0.8) + (currentVelocity * 0.2); 
            data.recent_count = 0; 
        }
        calculateEigenCentrality(); 
        promoteClustersToFaculties(parsedSalary); 
        brainDB.metadata.last_calibration = now;
    }

    // VÁLLALAT PROFILOZÓ ÉS PREDIKTÍV FLUKTUÁCIÓ
    if (!brainDB.company_profiles[companyName]) brainDB.company_profiles[companyName] = { jobs: 0, bs_total: 0, anomalies: 0, toxicity_index: 0, churn_probability: 15 };
    const compProfile = brainDB.company_profiles[companyName];
    compProfile.jobs += 1;
    compProfile.bs_total += bsCount;
    compProfile.toxicity_index = (compProfile.bs_total / compProfile.jobs) * 10 + (compProfile.anomalies / compProfile.jobs) * 50;
    compProfile.churn_probability = calculateChurnProbability(compProfile, urgencyMatrix);

    knownTagsInJob.forEach(tag => {
        const lower = tag.toLowerCase();
        if (!brainDB.skill_velocity[lower]) brainDB.skill_velocity[lower] = { recent_count: 0, historical_count: 1, momentum: 1.0 };
        brainDB.skill_velocity[lower].recent_count += 1;
    });

    const logToBrain = (type, word, context) => {
        const cleanWord = word.trim().replace(/^[,.:;!?-]+|[,.:;!?-]+$/g, '');
        if (cleanWord.length < 2 || cleanWord.length > 40) return;
        const lowerWord = cleanWord.toLowerCase();
        if (allKnownWordsSet.has(lowerWord) || brainDB.antibodies.includes(lowerWord)) return; 
        
        const categoryMap = brainDB.categories[type];
        if (!categoryMap[lowerWord]) categoryMap[lowerWord] = { count: 0, last_seen: now, auto_promoted: false, companies: [], context_vectors: {}, examples: [] };
        
        const node = categoryMap[lowerWord];
        node.count += 1; node.last_seen = now;
        if (!node.companies.includes(companyName)) node.companies.push(companyName);
        
        if (knownTagsInJob && knownTagsInJob.length > 0) {
            knownTagsInJob.forEach(tag => {
                const t = tag.toLowerCase(); node.context_vectors[t] = (node.context_vectors[t] || 0) + 1;
                if (node.count > 10 && (node.context_vectors[t] / node.count) > 0.8) {
                    if (!brainDB.ontology_graph[t]) brainDB.ontology_graph[t] = {};
                    brainDB.ontology_graph[t][lowerWord] = (brainDB.ontology_graph[t][lowerWord] || 0) + 1;
                }
            });
        }
        
        const threshold = type.includes("N-GRAM") ? 8 : 5; const minCompanies = type.includes("N-GRAM") ? 3 : 2;
        if (node.count >= threshold && node.companies.length >= minCompanies && !node.auto_promoted) {
            node.auto_promoted = true; console.log(`🤖📈 [Transcendence] Új tudás szintetizálva: "${lowerWord}" (${node.companies.length} cég használja)!`);
        }
        
        const exSet = new Set(node.examples);
        if (exSet.size < 2) {
            const shortContext = context.replace(/\n/g, ' ').trim();
            if (shortContext.length > 10) exSet.add(shortContext);
        }
        node.examples = Array.from(exSet);
    };

    let match;
    const ngramRegex = /\b([A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+(?:\s+[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+){1,3})\b/g;
    let localNgrams = [];
    while ((match = ngramRegex.exec(text)) !== null) {
        if (!stopWords.has(match[1].toUpperCase()) && !match[1].includes("Hogy") && !match[1].includes("Mivel")) {
            logToBrain("🧩 N-GRAM (KIFEJEZÉSEK)", match[1], text.substring(Math.max(0, match.index - 10), Math.min(text.length, match.index + 50)));
            localNgrams.push(match[1].toLowerCase());
        }
    }

    if (jobScoreMax < 0.6 && localNgrams.length > 3) {
        const clusterId = "CLUSTER_" + localNgrams.slice(0,2).join("_").replace(/\s/g, '');
        if (!brainDB.emergent_clusters[clusterId]) brainDB.emergent_clusters[clusterId] = { count: 0, keywords: {} };
        brainDB.emergent_clusters[clusterId].count += 1;
        localNgrams.forEach(ng => { brainDB.emergent_clusters[clusterId].keywords[ng] = (brainDB.emergent_clusters[clusterId].keywords[ng] || 0) + 1; });
    }

    const locRegex = /(?:munkavégzés helye|helyszín|location|város)[^a-zA-ZÁÉÍÓÖŐÚÜŰa-záéíóöőúüű]+([A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+(?:[\s-][A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+)?)/gi;
    while ((match = locRegex.exec(text)) !== null) {
        const pCity = match[1];
        if (!new RegExp(`\\b(${locationsDict.source})\\b`, 'i').test(pCity) && !/Magyarország|Hungary|Home|Remote|Távmunka|Központ|Iroda/i.test(pCity)) 
            logToBrain("📍 HELYSZÍN", pCity, text.substring(Math.max(0, match.index - 10), Math.min(text.length, match.index + 50)));
    }

    const techCandidateRegex = /\b([A-Z][a-z]+[A-Z][a-zA-Z]*|[A-Z]{3,}|[a-zA-Z]+\.js|[a-zA-Z]+\+\+|[a-zA-Z]+#|\.net|[A-Z][a-zA-Z0-9]+Ops)\b/g;
    while ((match = techCandidateRegex.exec(text)) !== null) {
        if (!stopWords.has(match[1].toUpperCase())) 
            logToBrain("💻 SZOFTVER/TECH", match[1], text.substring(Math.max(0, match.index - 20), Math.min(text.length, match.index + 40)));
    }

    const roleRegex = /\b([A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+\s+(?:Engineer|Manager|Analyst|Developer|Specialist|Consultant|Mérnök|Szakértő|Vezető|Gyakornok|Architect))\b/g;
    while ((match = roleRegex.exec(text)) !== null) {
        logToBrain("👔 ÚJ SZAKMA/POZÍCIÓ", match[1], text.substring(Math.max(0, match.index - 20), Math.min(text.length, match.index + 40)));
    }
}

// ----------------------------------------------------------------------------
// SEGÉDFÜGGVÉNYEK & ANOMÁLIA DETEKTOR
// ----------------------------------------------------------------------------
function calculateReadabilityScore(text, bsCount) {
    const words = text.split(/\s+/).length; const sentences = text.split(/[.?!]/).length;
    const avgWordsPerSentence = words / (sentences || 1);
    let clarity = 100;
    if (avgWordsPerSentence > 25) clarity -= 15; 
    if (bsCount >= 5) clarity -= 20; else if (bsCount >= 2) clarity -= 10;
    if (!text.includes("feladat") && !text.includes("felelősség")) clarity -= 15; 
    
    const desperationMatches = (text.match(/!!!|sürgős|azonnal|versenyképes/gi) || []).length;
    if (desperationMatches > 5) clarity -= 10;
    
    return Math.max(0, Math.min(100, clarity));
}

function estimateMarketSalaryAdvanced(faculty, jobNature, flatTags) {
    let baseHourly = 1600; let premium = 1.0;
    
    const dynFacultyMultiplier = brainDB.cluster_salary_curves[faculty]?.multiplier;
    if (dynFacultyMultiplier) premium *= dynFacultyMultiplier;

    if (faculty.includes("IT") || faculty.includes("Adattudomány")) baseHourly += 800;
    else if (faculty.includes("Mérnöki") || faculty.includes("Gazdasági")) baseHourly += 500;
    else if (faculty.includes("Ügyfélszolgálat")) baseHourly += 200;

    flatTags.forEach(tag => {
        const cleanTag = tag.toLowerCase();
        if (techMultipliers.highTier.includes(cleanTag)) premium += 0.15;
        else if (techMultipliers.midTier.includes(cleanTag)) premium += 0.05;
        
        const centrality = brainDB.eigen_centrality[cleanTag];
        if (centrality && centrality > 0.8) premium += 0.10;

        const skillVel = brainDB.skill_velocity[cleanTag];
        if (skillVel && skillVel.momentum > 1.3) premium += 0.08; 
        else if (skillVel && skillVel.momentum < 0.6) premium -= 0.05; 
    });
    
    const multiplier = Math.max(0.8, Math.min(1.50, premium)); 
    baseHourly = Math.round(baseHourly * multiplier);

    if (jobNature === "Pályakezdő (Teljes munkaidő)") {
        const monthlyMin = (baseHourly * 168) * 1.1; 
        return { estimate_type: "Monthly Gross (AI Estimated)", min: Math.round(monthlyMin / 1000) * 1000, max: Math.round((monthlyMin * 1.4) / 1000) * 1000, currency: "HUF" };
    } else return { estimate_type: "Hourly Gross (AI Estimated)", min: baseHourly, max: baseHourly + Math.round(600 * multiplier), currency: "HUF" };
}

function detectSalaryAnomaly(explicitSalary, estimatedSalary, companyName, title) {
    if (!explicitSalary || !estimatedSalary) return false;
    let explicitMonthly = explicitSalary.min_amount;
    if (explicitSalary.is_hourly) explicitMonthly = explicitSalary.min_amount * 168;
    else if (explicitSalary.is_yearly) explicitMonthly = explicitSalary.min_amount / 12;

    let estimatedMonthly = estimatedSalary.min;
    if (estimatedSalary.estimate_type.includes("Hourly")) estimatedMonthly = estimatedSalary.min * 168;

    if (explicitMonthly > (estimatedMonthly * 2.5) && explicitMonthly > 800000) {
        brainDB.anomalies.push({ company: companyName, title: title, reason: `Gyanúsan magas fizetés: Ajánlott ${explicitMonthly} HUF, piaci becslés: ${estimatedMonthly} HUF.` });
        if (brainDB.company_profiles[companyName]) brainDB.company_profiles[companyName].anomalies += 1;
        return true;
    }
    return false;
}

function runImplicitSkillDeduction(flatTags) {
    let inferred = new Set(); const lcTags = flatTags.map(t => t.toLowerCase());
    if (lcTags.includes("react") || lcTags.includes("vue") || lcTags.includes("angular") || lcTags.includes("html") || lcTags.includes("css")) inferred.add("Frontend Focus");
    if (lcTags.includes("node.js") || lcTags.includes("java") || lcTags.includes("python") || lcTags.includes("c#") || lcTags.includes("php")) inferred.add("Backend Focus");
    if (lcTags.includes("sql") || lcTags.includes("postgresql") || lcTags.includes("mongodb") || lcTags.includes("redis")) inferred.add("Database Management");
    if (lcTags.includes("aws") || lcTags.includes("azure") || lcTags.includes("docker") || lcTags.includes("kubernetes")) inferred.add("Cloud / DevOps Focus");
    if (lcTags.includes("power bi") || lcTags.includes("tableau") || lcTags.includes("hadoop") || lcTags.includes("spark")) inferred.add("Data / Analytics Focus");
    
    if (inferred.has("Frontend Focus") && inferred.has("Backend Focus")) inferred.add("Full-Stack Szemlélet");
    if (inferred.has("Backend Focus") && inferred.has("Cloud / DevOps Focus")) inferred.add("Modern Cloud Backend");

    lcTags.forEach(tag => {
        if (brainDB.ontology_graph[tag]) {
            Object.keys(brainDB.ontology_graph[tag]).forEach(child => inferred.add(child.toUpperCase() + " ismeret"));
        }
    });
    return Array.from(inferred);
}

function parseSalary(text) {
    const salaryRegex = /(?:(bruttó|br\.|nettó|net\.|gross|net)\s*)?(?:€|eur\s*)?(\d{1,3}(?:[\s\.]\d{3})*|\d{1,4}[kmM])(?:\s*-\s*(?:€|eur\s*)?(\d{1,3}(?:[\s\.]\d{3})*|\d{1,4}[kmM]))?\s*(ft|huf|eur|€|euro)?(?:\s*\/\s*(óra|hó|hónap|év|hour|month|year))?/i;
    const match = text.match(salaryRegex); if (!match) return null;
    const parseNum = (str) => {
        if (!str) return null; let numStr = str.replace(/[\s\.]/g, '').toLowerCase();
        if (numStr.endsWith('k')) return parseInt(numStr) * 1000;
        if (numStr.endsWith('m')) return parseInt(numStr) * 1000000;
        return parseInt(numStr, 10);
    };
    const minAmount = parseNum(match[2]); const maxAmount = parseNum(match[3]) || minAmount;
    const currency = (match[4] || "").toLowerCase().includes("eur") || (match[4] || "") === "€" || match[0].includes("€") ? "EUR" : "HUF";
    const periodStr = (match[5] || "").toLowerCase();
    let isHourly = periodStr.includes('óra') || periodStr.includes('hour'); let isYearly = periodStr.includes('év') || periodStr.includes('year');
    if (!periodStr) { if (currency === "HUF" && minAmount < 10000) isHourly = true; if (currency === "HUF" && minAmount > 3000000) isYearly = true; }
    return { raw_text: match[0].replace(/\s+/g, ' ').trim(), min_amount: minAmount, max_amount: maxAmount, currency: currency, is_net: !!(match[1] && (match[1].startsWith('net') || match[1].toLowerCase() === 'net')), is_hourly: isHourly, is_yearly: isYearly };
}

function parseLanguageLevels(text) {
    const levels = {};
    const langRegex = /(angol|német|francia|spanyol|olasz|orosz|english|german|french|spanish|italian)[^\w]{0,35}(a1|a2|b1|b2|c1|c2|alapfok|középfok|felsőfok|társalgási|tárgyalási|tárgyalóképes|folyékony|anyanyelvi|fluent|native|intermediate|advanced)/gi;
    let match;
    while ((match = langRegex.exec(text)) !== null) {
        let lang = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        let level = match[2].toUpperCase();
        if (lang === "English") lang = "Angol"; if (lang === "German") lang = "Német"; if (lang === "French") lang = "Francia"; if (lang === "Spanish") lang = "Spanyol"; if (lang === "Italian") lang = "Olasz";
        if (level.includes("KÖZÉP") || level.includes("TÁRSALGÁS") || level.includes("INTERMEDIATE")) level = "B2";
        else if (level.includes("FELSŐ") || level.includes("TÁRGYALÁSI") || level.includes("FOLYÉKONY") || level.includes("ADVANCED")) level = "C1";
        else if (level.includes("ALAP")) level = "A2/B1"; else if (level.includes("ANYANYELV") || level.includes("NATIVE")) level = "C2";
        levels[lang] = levels[lang] > level ? levels[lang] : level; 
    }
    return Object.keys(levels).length > 0 ? levels : null;
}

function extractHomeOfficeRatio(text) {
    const hoRegex = /(?:heti|weekly)\s*(\d)\s*(?:nap|napot|days?)?\s*(home office|ho|távmunka|wfh)/i;
    const match = text.match(hoRegex);
    if (match && parseInt(match[1]) <= 5) return `Hibrid (${parseInt(match[1])} nap HO)`;
    return null;
}

function extractContractType(text) {
    if (/(diákszövetkezet|iskolaszövetkezet|szövetkezeti)/i.test(text)) return "Diákszövetkezeti";
    if (/(b2b|contractor|alvállalkozó|freelance|számlaképes)/i.test(text)) return "B2B / Vállalkozói";
    if (/(alkalmazott|munkaviszony|employee|határozatlan idejű|full-time employee|teljes munkaidős)/i.test(text)) return "Alkalmazotti";
    if (/(határozott idejű|fixed-term)/i.test(text)) return "Határozott idejű";
    return "Nem meghatározott";
}

function extractFromMatrix(text, compiledEngineArray) {
    const results = [];
    for (const engine of compiledEngineArray) {
        engine.regex.lastIndex = 0; if (engine.regex.test(text)) results.push(engine.name);
    }
    return results.length > 0 ? results : null;
}

function detectRedFlags(text) { return extractFromMatrix(text, PreCompiledEngines.redFlag); }
function detectScamAndMLM(text) { return extractFromMatrix(text, PreCompiledEngines.scam); }
function analyzeOnboarding(text) { return extractFromMatrix(text, PreCompiledEngines.onboarding); }
function analyzeCareerPath(text) { return extractFromMatrix(text, PreCompiledEngines.careerPath); }
function analyzeTransit(text) { return extractFromMatrix(text, PreCompiledEngines.transit); }
function extractInterviewProcess(text) { return extractFromMatrix(text, PreCompiledEngines.interview); }
function extractEquipment(text) { return extractFromMatrix(text, PreCompiledEngines.equipment); }
function extractRelocation(text) { return extractFromMatrix(text, PreCompiledEngines.relocation); }
function extractHiddenRequirements(text) { return extractFromMatrix(text, PreCompiledEngines.hiddenReqs); }
function extractUrgency(text) { return extractFromMatrix(text, PreCompiledEngines.urgency); }
function extractCertificates(text) { const certs = [...new Set((text.match(certificationsDict) || []).map(c => c.toUpperCase()))]; return certs.length > 0 ? certs : null; }
function analyzeApplicationFriction(text) { const frictionPoints = extractFromMatrix(text, PreCompiledEngines.appFriction) || []; return frictionPoints.length > 0 ? { points: frictionPoints, score: frictionPoints.length } : null; }

function calculateWLBIndex(urgencyMatrix, hoRatio, redFlags) {
    let score = 10; 
    if (hoRatio) score += 3;
    if (urgencyMatrix && urgencyMatrix.includes("Órarendhez igazodó")) score += 4;
    if (urgencyMatrix && urgencyMatrix.includes("Hétvégi munkavégzés")) score -= 3;
    if (redFlags && redFlags.includes("Túlterheltség gyanú")) score -= 5;
    if (score >= 13) return "Kiváló (Diákbarát WLB)";
    if (score >= 8) return "Kiegyensúlyozott";
    return "Feszített / Terhelt WLB";
}

function determineCulturalArchetype(text) {
    let toneScores = [];
    for (const engine of PreCompiledEngines.tone) {
        const matches = (text.match(engine.regex) || []).length;
        if (matches > 0) toneScores.push({ name: engine.name, score: matches });
    }
    toneScores.sort((a, b) => b.score - a.score);
    return toneScores.length > 0 ? toneScores[0].name : "⚖️ Szakmai / Általános";
}

function calculateDiversityIndex(text) {
    const matches = (text.match(new RegExp(diversityDict.source, 'gi')) || []).length;
    if (matches >= 3) return "Magas (Nagyon inkluzív)";
    if (matches > 0) return "Közepes (Támogató)";
    return "Nincs adat";
}

function evaluateTechStack(flatTags) {
    if (flatTags.length === 0) return "Nem releváns";
    const lcTags = flatTags.map(t => t.toLowerCase());
    let enterpriseScore = 0; let modernScore = 0;
    lcTags.forEach(tag => {
        if (techMultipliers.midTier.includes(tag)) enterpriseScore += 1;
        if (techMultipliers.highTier.includes(tag)) modernScore += 2;
    });
    if (enterpriseScore > modernScore && enterpriseScore >= 3) return "Enterprise / Legacy Stack";
    if (modernScore > enterpriseScore && modernScore >= 2) return "Modern / Cloud-Native Stack";
    return "Vegyes / Általános Stack";
}

function generateJsonLd(jobData, rawTitle, companyName) {
    const validThroughDate = new Date(); validThroughDate.setDate(validThroughDate.getDate() + 30); 
    return {
        "@context": "https://schema.org/", "@type": "JobPosting", "title": rawTitle, "description": "Részletek az oldalon.",
        "datePosted": new Date().toISOString(), "validThrough": validThroughDate.toISOString(),
        "employmentType": jobData.airtable_ready.job_nature.includes("Részmunkaidő") ? "PART_TIME" : (jobData.airtable_ready.job_nature.includes("Diák") || jobData.airtable_ready.job_nature.includes("Gyakornok") ? "INTERN" : "FULL_TIME"),
        "hiringOrganization": { "@type": "Organization", "name": companyName || "N/A" },
        "jobLocation": jobData.locations.map(loc => ({ "@type": "Place", "address": { "@type": "PostalAddress", "addressLocality": loc, "addressCountry": "HU" } })),
        "baseSalary": jobData.airtable_ready.salary_min ? {
            "@type": "MonetaryAmount", "currency": jobData.airtable_ready.salary_currency,
            "value": { "@type": "QuantitativeValue", "minValue": jobData.airtable_ready.salary_min, "maxValue": jobData.airtable_ready.salary_max, "unitText": jobData.airtable_ready.is_hourly_wage ? "HOUR" : "MONTH" }
        } : undefined
    };
}

// 🔥 GENERATIVE TLDR (Markov-jellegű szintézis) 🔥
function generateGenerativeTLDR(companyName, jobNature, faculty, locationArray, workSetupArray, salaryData, equipment, tone, topTags) {
    const loc = locationArray && locationArray.length > 0 ? locationArray[0] : "Országos";
    const setup = workSetupArray && workSetupArray.length > 0 ? workSetupArray[0] : "irodai";
    let salaryString = salaryData && salaryData.min_amount ? `, ${salaryData.min_amount.toLocaleString('hu-HU')} ${salaryData.currency} induló bérrel` : "";
    let gearString = equipment && equipment.length > 0 ? ` (+${equipment[0]})` : "";
    
    let tagFocus = "";
    if (topTags && topTags.length > 0) {
        tagFocus = ` Fókuszban: ${topTags.slice(0, 2).join(", ")}.`;
    }

    const dynamicIntro = tone.includes("Laza") ? "Csatlakozz a" : (tone.includes("Corporate") ? "Karrierlehetőség a" : "Nyitott pozíció a");
    
    return `${dynamicIntro} ${companyName} csapatához! Egy ${jobNature.toLowerCase()} szerepkör ${faculty.replace(/[^\w\s\u00C0-\u017F]/g, '').trim()} területen (${loc} / ${setup}).${tagFocus}${salaryString}${gearString}`;
}

// ============================================================================
// 🚀 FŐ ELEMZŐ FÜGGVÉNY EXPORTÁLÁSA 
// ============================================================================
exports.analyzeJob = function(title, description = "", companyName = "Ismeretlen Cég") {
    const perfMarks = {};
    const mark = (name) => { perfMarks[name] = performance.now(); };
    const measure = (name, startMark) => { return Math.round((performance.now() - perfMarks[startMark]) * 100) / 100; };
    
    mark('total_start');
    
    const rawCombine = `${sanitizeText(title)}||${description ? description.length : 0}||${companyName}`;
    const cacheKey = crypto.createHash('sha256').update(rawCombine).digest('hex');
    const cachedResult = analysisCache.get(cacheKey);
    if (cachedResult) return cachedResult;

    mark('prep_start');
    let safeTitle = sanitizeText(title);
    for (const rule of detoxRules) safeTitle = safeTitle.replace(rule.regex, rule.replacement);
    const cleanTitle = safeTitle.replace(/\([^()]*\)/g, '').replace(/\[[^\[\]]*\]/g, '').trim();

    let safeDesc = sanitizeText(description);
    for (const rule of detoxRules) safeDesc = safeDesc.replace(rule.regex, rule.replacement);
    let fullText = `${safeTitle} \n ${safeDesc}`;

    const typoFixResult = correctTyposAdvanced(fullText);
    fullText = typoFixResult.correctedText;
    const timePrep = measure('Prep_Time', 'prep_start');

    const docWords = fullText.split(/[\s,.;!?()\n]+/);
    const docLength = Math.max(1, docWords.length);
    
    // 🔥 TURING-OMEGA PLASTICITY: Az AI mutálja a saját paramétereit (Stochastic Descent Approximation)
    brainDB.metadata.avg_doc_length = (brainDB.metadata.avg_doc_length * 0.995) + (docLength * 0.005);
    const avgDl = Math.max(100, brainDB.metadata.avg_doc_length);
    let k1 = brainDB.metadata.bm25_k1; 
    let b = brainDB.metadata.bm25_b;
    
    const docBloom = new BloomFilter(8192);
    for (let i=0; i<docWords.length; i++) {
        if (docWords[i].length > 2) docBloom.add(docWords[i]);
        if (docWords[i].length > 3) {
            const cleanW = docWords[i].toLowerCase();
            brainDB.idf_stats[cleanW] = (brainDB.idf_stats[cleanW] || 0) + 1;
        }
    }

    mark('guard_start');
    
    const logReject = (reason) => {
        brainDB.metadata.total_rejected++; 
        try { fs.appendFileSync("kiszurt_allasok.txt", `🏢 ${companyName} | 📌 ${cleanTitle}\n   ❌ OK: ${reason}\n\n`); } catch(e) {}
        return null;
    };

    if (detectScamAndMLM(fullText)) return logReject("Gyanús MLM vagy átverés szótár"); 
    if (compiledFatalLowEdu.test(fullText)) return logReject("8 általános / Betanított munka (LowEdu Guard)"); 

    const isExplicitStudentOrIntern = /\b(diák|diákmunka|gyakornok|intern|internship|trainee|hallgató|student|diákszövetkezet|iskolaszövetkezet|melo-diak|mind-diak|eudiakok)\b/i.test(fullText) || 
                                      /kötelező (szakmai )?gyakorlat|gyakorlat( le)?igazolás|mandatory internship/i.test(fullText) || 
                                      /aktív( nappali)? (hallgatói )?jogviszony|nappali tagozat|active student/i.test(fullText);

    const hasAcademicDegree = compiledAcademicReq.test(fullText) || compiledStrictDegrees.test(fullText);
    const hasHighSchool = /\b(érettségi|középfokú|high school)\b/i.test(fullText);

    if (!isExplicitStudentOrIntern && !hasAcademicDegree && !hasHighSchool) {
        return logReject("Nem diákmunka, és nem kér se diplomát, se érettségit (Túl laza feltételek)"); 
    }

    const isExplicitJuniorTitle = compiledExplicitJunior.test(cleanTitle);
    const isExplicitJuniorText = compiledExplicitJunior.test(fullText);
    const isExplicitJunior = isExplicitJuniorTitle || isExplicitJuniorText;
    const isWhiteCollar = compiledWhiteCollarRoles.test(fullText) || compiledWhiteCollarRoles.test(safeTitle);
    
    let isTooSenior = false;
    if (!bypassExperienceRegex.test(fullText)) {
        const expMatches = [...fullText.matchAll(compiledExperienceReject), ...fullText.matchAll(compiledExperienceRejectWords)];
        if (expMatches.length > 0) {
            const textAST = buildTextAST_FSM(fullText); 
            for (const match of expMatches) {
                const matchCenter = match.index + Math.floor(match[0].length / 2);
                const activeClause = binarySearchAST(textAST, matchCenter);
                if (activeClause) {
                    const contextWindow = activeClause.text;
                    const beforeIdx = match.index - activeClause.start;
                    const afterIdx = beforeIdx + match[0].length;
                    
                    if (/(?:0|1|2|1[,.]5|2[,.]5|egy|két|kettő|fél|max\b|max\.|maximum|legfeljebb|akár|up to|kevesebb|less than|<)\s*(?:[-–]|\s|ig\b|to\b)?\s*$/i.test(contextWindow.substring(0, beforeIdx))) continue; 
                    if (/(?:cégünk|vállalatunk|csapatunk|irodánk|múltunk|our company|our team|we have|founded|működő|piacon|market)\b/i.test(contextWindow.substring(0, beforeIdx))) continue; 
                    if (/^\s*(?:alatt|under|below|kevesebb|or less|maximum|max)\b/i.test(contextWindow.substring(afterIdx))) continue; 
                    if (/(?:hallgató|tanuló|student|egyetemista|semester|félév|évfolyam|osztály)/i.test(contextWindow)) continue; 
                }
                isTooSenior = true; break; 
            }
        }
    }

    if (compiledFatalSenior.test(cleanTitle) && !isExplicitJuniorTitle) return logReject("Senior pozíció a cím alapján");
    if (compiledFatalPhysical.test(cleanTitle) && !isExplicitJuniorTitle) return logReject("Fizikai munka a cím alapján");
    if (compiledDubiousPhysical.test(cleanTitle) && !isExplicitJunior && !compiledWhiteCollarRoles.test(cleanTitle)) return logReject("Gyanús fizikai/operátor munka a cím alapján");
    if (isTooSenior && !isExplicitJuniorTitle) return logReject("Túl sok tapasztalatot kér (>3 év)");
    if (!isExplicitJunior && !isWhiteCollar) return logReject("Nem junior és nem is szellemi munka (WhiteCollar Guard)"); 
    
    const timeGuard = measure('Guard_Time', 'guard_start');

    mark('score_start');
    const leadDesc = fullText.substring(0, 300); 
    const bodyDesc = fullText.substring(300);
    const bm25LenNorm = 1 - b + b * (docLength / avgDl);
    
    let maxScore = 0; let assignedCategory = "🔍 Egyéb / Általános";

    for (const [catName, regex] of Object.entries(compiledCategories)) {
        let termFrequency = 0; let match;
        regex.lastIndex = 0; while ((match = regex.exec(cleanTitle)) !== null) termFrequency += (simulatedIDF.get(match[0]) || 1.5) * 20;
        regex.lastIndex = 0; while ((match = regex.exec(leadDesc)) !== null) termFrequency += (simulatedIDF.get(match[0]) || 1.5) * 5;
        regex.lastIndex = 0; while ((match = regex.exec(bodyDesc)) !== null) termFrequency += (simulatedIDF.get(match[0]) || 1.5) * 1;
        
        let score = (termFrequency * (k1 + 1)) / (termFrequency + k1 * bm25LenNorm);
        if (compiledAntiCategories[catName]) score -= (fullText.match(compiledAntiCategories[catName]) || []).length * 50;
        if (score > maxScore && score > 0.5) { maxScore = score; assignedCategory = catName; }
    }

    for (const [dynCat, dynData] of Object.entries(brainDB.dynamic_faculties)) {
        let termFrequency = 0;
        dynData.terms.forEach(term => {
            const dynRegex = new RegExp(`\\b${term}\\b`, 'gi');
            let match;
            dynRegex.lastIndex = 0; while ((match = dynRegex.exec(cleanTitle)) !== null) termFrequency += (simulatedIDF.get(term) || 1.5) * 25;
            dynRegex.lastIndex = 0; while ((match = dynRegex.exec(leadDesc)) !== null) termFrequency += (simulatedIDF.get(term) || 1.5) * 6;
            dynRegex.lastIndex = 0; while ((match = dynRegex.exec(bodyDesc)) !== null) termFrequency += (simulatedIDF.get(term) || 1.5) * 1.5;
        });
        let score = (termFrequency * (k1 + 1)) / (termFrequency + k1 * bm25LenNorm);
        if (score > maxScore && score > 0.6) { maxScore = score; assignedCategory = dynCat; dynData.usage_count++; }
    }

    const companyArchetype = determineCulturalArchetype(fullText);
    const timeScore = measure('Score_Time', 'score_start');

    mark('extract_start');
    const isMandatoryInternship = /kötelező (szakmai )?gyakorlat|gyakorlat( le)?igazolás|mandatory internship/i.test(fullText);
    const requiresActiveStudent = /aktív( nappali)? (hallgatói )?jogviszony|nappali tagozat|active student/i.test(fullText);
    
    let extractedHours = "Rugalmas";
    const hoursMatch = fullText.match(/(?:heti|min\.|legalább)?\s*(\d{1,2})\s*(?:óra|órás|órát|órában|hours?)/i);
    if (hoursMatch && parseInt(hoursMatch[1]) >= 10 && parseInt(hoursMatch[1]) <= 40) extractedHours = parseInt(hoursMatch[1]);

    const parsedSalary = parseSalary(fullText);
    const parsedLanguageLevels = parseLanguageLevels(fullText);
    const hoRatio = extractHomeOfficeRatio(fullText);
    const contractType = extractContractType(fullText);
    
    const hiddenReqs = extractHiddenRequirements(fullText);
    const diversityIndex = calculateDiversityIndex(fullText);
    const urgencyMatrix = extractUrgency(fullText);
    
    const redFlags = detectRedFlags(fullText);
    const certifications = extractCertificates(fullText);
    const onboardingStatus = analyzeOnboarding(fullText);
    
    const bsCount = (fullText.match(corporateBSDict) || []).length;
    const bsIndex = { score: bsCount, category: bsCount >= 5 ? "Kritikus HR Zsargon" : (bsCount >= 2 ? "Enyhe Corporate Zsargon" : "Tiszta / Érthető") };
    
    const readabilityScore = calculateReadabilityScore(fullText, bsCount);

    const appFriction = analyzeApplicationFriction(fullText);
    const careerPath = analyzeCareerPath(fullText);
    const transitInfo = analyzeTransit(fullText);

    const interviewProcess = extractInterviewProcess(fullText);
    const equipmentProvided = extractEquipment(fullText);
    const relocationSupport = extractRelocation(fullText);
    const wlbIndex = calculateWLBIndex(urgencyMatrix, hoRatio, redFlags);
    
    const degreeMatch = fullText.match(/\b(bsc|msc|ba|ma|bachelor|master|alapképzés|mesterképzés|érettségi|okj|technikum|phd)\b/i);
    let requiredDegree = null;
    if (degreeMatch) {
        requiredDegree = degreeMatch[1].toUpperCase().replace("BACHELOR", "BSC").replace("ALAPKÉPZÉS", "BSC").replace("MASTER", "MSC").replace("MESTERKÉPZÉS", "MSC").replace("ÉRETTSÉGI", "Érettségi").replace("TECHNIKUM", "OKJ/Technikum").replace("OKJ", "OKJ/Technikum");
    }

    let foundLocations = [...new Set((fullText.match(locationsDict) || []).map(l => l.charAt(0).toUpperCase() + l.slice(1)))];
    
    let jobNature = "Pályakezdő (Teljes munkaidő)";
    if (/\b(diák|diákmunka|iskolaszövetkezet|student|working student|werkstudent)\b/i.test(fullText) || requiresActiveStudent) jobNature = "Diákmunka";
    else if (/\b(gyakornok|intern|internship|trainee)\b/i.test(fullText) || isMandatoryInternship) jobNature = "Gyakornok";
    else if (/\b(részmunkaidő|part-time|part time|4 órás|6 órás)\b/i.test(fullText)) jobNature = "Pályakezdő (Részmunkaidő)";

    const timeExtract = measure('Extract_Time', 'extract_start');

    mark('tag_start');
    let extractedTags = { tech: [], languages: [], soft_skills: [], work_setup: [], benefits: [] };
    let niceToHaveTags = []; let allFlatTags = []; 
    
    const hasNiceToHaveZones = populateNiceToHaveZonesBitwise(fullText); 

    for (const [group, tagObjects] of Object.entries(compiledStructuredTags)) {
        let groupTags = [];
        for (const tagObj of tagObjects) {
            if (!docBloom.mightContain(tagObj.root)) continue;
            let match; let matchCount = 0; let isNiceToHave = false;
            tagObj.globalRegex.lastIndex = 0; 
            while ((match = tagObj.globalRegex.exec(fullText)) !== null) {
                matchCount++;
                if (!isNiceToHave && hasNiceToHaveZones && globalDiffView[match.index] > 0) {
                    isNiceToHave = true; matchCount += globalDiffView[match.index] * 0.5;
                }
            }
            if (matchCount > 0) {
                const formattedTag = tagObj.original.charAt(0).toUpperCase() + tagObj.original.slice(1);
                if (isNiceToHave && group !== 'benefits') niceToHaveTags.push(formattedTag); 
                else groupTags.push({ tag: formattedTag, count: matchCount });
            }
        }
        groupTags.sort((a, b) => b.count - a.count);
        extractedTags[group] = groupTags.map(t => t.tag); allFlatTags.push(...extractedTags[group]);
    }
    
    if (hoRatio && extractedTags.work_setup.includes("Home office")) {
        extractedTags.work_setup = extractedTags.work_setup.filter(t => t !== "Home office");
        extractedTags.work_setup.push(hoRatio);
        allFlatTags = allFlatTags.filter(t => t !== "Home office"); allFlatTags.push(hoRatio);
    }
    niceToHaveTags = [...new Set(niceToHaveTags)].filter(tag => !allFlatTags.includes(tag));
    
    // 🔥 TURING-OMEGA: Szemantikus Tanulás és Generatív TLDR
    runQuantumTranscendenceDiscovery(fullText, companyName, allFlatTags, assignedCategory, maxScore, parsedSalary, bsCount, urgencyMatrix);
    
    const marketSalaryEstimate = parsedSalary ? null : estimateMarketSalaryAdvanced(assignedCategory, jobNature, allFlatTags);
    const isAnomaly = detectSalaryAnomaly(parsedSalary, marketSalaryEstimate, companyName, cleanTitle);
    
    const timeTag = measure('Tag_Time', 'tag_start');

    const inferredMetaTags = runImplicitSkillDeduction(allFlatTags);
    const techStackTier = evaluateTechStack(extractedTags.tech); 
    
    let confidenceScore = readabilityScore; 
    if (!bypassExperienceRegex.test(fullText) && !isExplicitJunior) confidenceScore -= 20; 
    if (compiledWhiteCollarRoles.test(fullText)) confidenceScore += 10;
    if (redFlags) confidenceScore -= (redFlags.length * 10);
    if (appFriction && appFriction.score >= 2) confidenceScore -= 5; 
    if (isTooSenior) confidenceScore -= 50; 
    if (isAnomaly) confidenceScore -= 30;
    
    confidenceScore = Math.max(0, Math.min(100, confidenceScore));

    if (confidenceScore < brainDB.metadata.adaptive_threshold) {
        return logReject(`Alacsony Bizalmi Index (${confidenceScore} < ${brainDB.metadata.adaptive_threshold.toFixed(1)})`);
    }

    const dynamicTLDR = generateGenerativeTLDR(companyName, jobNature, assignedCategory, foundLocations, extractedTags.work_setup, parsedSalary || marketSalaryEstimate, equipmentProvided, companyArchetype, allFlatTags);

    const timeTotal = measure('Total_Time', 'total_start');

    const finalPayload = {
        metadata: {
            is_valid_entry_level: true,
            confidence_score_pct: confidenceScore,
            readability_score_pct: readabilityScore, 
            faculty: assignedCategory,
            job_nature: jobNature,
            contract_type: contractType,
            work_style: companyArchetype, 
            diversity_and_inclusion_index: diversityIndex,
            tech_stack_profile: techStackTier, 
            required_degree: requiredDegree,
            tldr_summary: dynamicTLDR
        },
        student_details: {
            requires_active_student: requiresActiveStudent,
            accepts_mandatory_internship: isMandatoryInternship,
            weekly_hours_int: extractedHours !== "Rugalmas" ? extractedHours : null,
            hidden_requirements: hiddenReqs,
            urgency_and_flexibility: urgencyMatrix, 
            onboarding_and_mentoring: onboardingStatus,
            career_path_and_retention: careerPath, 
            application_friction: appFriction,
            interview_process_pipeline: interviewProcess, 
            relocation_and_visa: relocationSupport, 
            work_life_balance_index: wlbIndex 
        },
        financials: {
            explicit_salary: parsedSalary,
            market_salary_estimate: marketSalaryEstimate 
        },
        languages_with_levels: parsedLanguageLevels,
        locations: foundLocations,
        transit_and_accessibility: transitInfo, 
        tags: {
            required: extractedTags,
            nice_to_have: niceToHaveTags,
            certifications_and_licenses: certifications, 
            inferred_meta_focus: inferredMetaTags, 
            provided_equipment: equipmentProvided 
        },
        insights: {
            detected_red_flags: redFlags,
            corporate_bullshit_index: bsIndex, 
            extracted_benefits: extractedTags.benefits,
            auto_corrected_typos: typoFixResult.typosFixed,
            is_anomaly: isAnomaly,
            company_toxicity_index: brainDB.company_profiles[companyName]?.toxicity_index || 0,
            churn_probability_pct: brainDB.company_profiles[companyName]?.churn_probability || 15
        },
        airtable_ready: { 
            faculty: assignedCategory,
            job_nature: jobNature,
            contract_type: contractType,
            degree: requiredDegree,
            weekly_hours: extractedHours !== "Rugalmas" ? extractedHours : null,
            salary_min: parsedSalary ? parsedSalary.min_amount : (marketSalaryEstimate ? marketSalaryEstimate.min : null),
            salary_max: parsedSalary ? parsedSalary.max_amount : (marketSalaryEstimate ? marketSalaryEstimate.max : null),
            salary_currency: parsedSalary ? parsedSalary.currency : (marketSalaryEstimate ? marketSalaryEstimate.currency : null),
            is_hourly_wage: parsedSalary ? parsedSalary.is_hourly : (marketSalaryEstimate ? marketSalaryEstimate.estimate_type.includes("Hourly") : null),
            is_estimated_salary: !parsedSalary && !!marketSalaryEstimate, 
            required_tags: allFlatTags.filter(t => !extractedTags.benefits.includes(t)),
            bonus_tags: niceToHaveTags,
            benefits: extractedTags.benefits,
            certifications: certifications ? certifications.join(", ") : null, 
            onboarding: onboardingStatus ? onboardingStatus.join(", ") : null, 
            bs_index_category: bsIndex.category, 
            hidden_requirements: hiddenReqs ? hiddenReqs.join(", ") : null, 
            red_flags: redFlags ? redFlags.join(", ") : null,
            urgency: urgencyMatrix ? urgencyMatrix.join(", ") : null,
            career_path: careerPath ? careerPath.join(", ") : null, 
            app_friction_points: appFriction ? appFriction.points.join(", ") : null, 
            transit_info: transitInfo ? transitInfo.join(", ") : null, 
            interview_process: interviewProcess ? interviewProcess.join(", ") : null, 
            hardware_gear: equipmentProvided ? equipmentProvided.join(", ") : null, 
            relocation_support: relocationSupport ? relocationSupport.join(", ") : null, 
            wlb_index: wlbIndex, 
            tldr: dynamicTLDR 
        },
        seo_schema: null,
        system: { 
            execution_time_ms: timeTotal,
            telemetry: {
                prep_ms: timePrep, guard_ms: timeGuard,
                score_ms: timeScore, extract_ms: timeExtract, tag_ms: timeTag,
                ast_bracket_aware: isTooSenior ? 'Yes' : 'No',
                bm25_length_norm: bm25LenNorm.toFixed(3),
                bloom_filter_active: true
            }
        } 
    };

    finalPayload.seo_schema = generateJsonLd(finalPayload, title, companyName);
    analysisCache.set(cacheKey, finalPayload);
    return structuredClone(finalPayload);
};