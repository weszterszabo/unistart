// ============================================================================
// 🚀 V12.1 QUANTUM ENGINE: MESTERSÉGES INTELLIGENCIA ALAPÚ NLP FORDÍTÓ
// ============================================================================

// Magyar specifikus Regex Lookaround határok (A tökéletes szófelismeréshez)
const H_BOUND_START = `(?<=[^a-záéíóöőúüűA-ZÁÉÍÓÖŐÚÜŰ0-9_]|^)`;
const H_BOUND_END = `(?=[^a-záéíóöőúüűA-ZÁÉÍÓÖŐÚÜŰ0-9_]|$)`;

// A "Fordító": Ciklusok helyett egyetlen masszív, memóriába égetett Regex-et csinál a listákból
function buildRegex(wordArray) {
    const parts = wordArray.map(w => {
        const clean = w.toLowerCase().trim();
        if (clean.startsWith('|') && clean.endsWith('|')) {
            // Szigorú egyezés (pl. "|it|")
            return `${H_BOUND_START}${clean.slice(1, -1)}${H_BOUND_END}`;
        } else if (clean.startsWith('*') && clean.endsWith('*')) {
            // Ragozástűrő egyezés (pl. "*mérnök*" -> mérnököt, mérnöknek)
            return `${H_BOUND_START}${clean.slice(1, -1)}[a-záéíóöőúüű]{0,5}${H_BOUND_END}`;
        } else {
            // Sima szórészlet (escapelve a biztonságért)
            return clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
        }
    });
    return new RegExp(`(${parts.join('|')})`, 'gi'); // 'g' = Globális keresés (megszámolja a találatokat!)
}

// ============================================================================
// 1. KÉTNYELVŰ MÉREGTELENÍTÉS ÉS ZAJSZŰRÉS (Detox)
// ============================================================================
const detoxRules = [
    // 🚨 ÚJ VÉDŐSZABÁLYOK TÖBBJELENTÉSŰ SZAVAKRA
    { regex: /fejlesztő\s*pedagóg/gi, replacement: "gyógypedagóg" }, // Kimenti a pedagógusokat az IT alól
    { regex: /szervezetfejleszt/gi, replacement: "szervezetépítő" }, // Kimenti a HR-eseket az IT alól
    { regex: /üzletfejleszt/gi, replacement: "üzletépítő" }, // Kimenti a Sales-eseket az IT alól
    
    // Alapvető detox
    { regex: /vezetői engedély/gi, replacement: "jogosítvány" },
    { regex: /piacvezető|világvezető/gi, replacement: "piacelső" },
    { regex: /(senior|szenior) (kollég|munkatárs)/gi, replacement: "mentor" },
    { regex: /vezető(j|k|höz|d|nek)/gi, replacement: "felettes" }, 
    { regex: /vezetői támogatás/gi, replacement: "felettesi támogatás" },
    { regex: /tapasztalat (előny|nem elvárás|nem feltétel)/gi, replacement: "pályakezdő" },
    { regex: /0-3 év|1-3 év|1-2 év|max(imum|\.)? 2 év/gi, replacement: "pályakezdő" },
    { regex: /driver'?s? license/gi, replacement: "jogosítvány" },
    { regex: /senior colleagues?|senior team members?/gi, replacement: "mentor" },
    { regex: /no (prior |previous )?experience (needed|required|necessary)/gi, replacement: "pályakezdő" }
];

// ============================================================================
// 2. SZIGORÚ VÉDŐPAJZS SZÓTÁRAK (Ezekből generáljuk a regexeket)
// ============================================================================
const fatalSeniorWords = [
    "*senior*", "*szenior*", "|manager|", "*menedzser*", "*igazgató*", "*szakértő*", 
    "*medior*", "*műszakvezető*", "*csoportvezető*", "*projektvezető*", "*üzletvezető*", 
    "*főorvos*", "*főnővér*", "*tulajdonos*", "*osztályvezető*", "|vezető|", "|sr|", 
    "head of", "lead", "expert", "supervisor", "director", "architect", 
    "coordinator", "|vp|", "president", "chief", "principal", "founder", "partner",
    "|cfo|", "|ceo|", "|cto|", "|coo|", "|cmo|"
];

const fatalPhysicalWords = [
    "takarító", "kőműves", "festő", "pénztáros", "bolti eladó", "|eladó|", "kassza",
    "targoncás", "sofőr", "futár", "vagyonőr", "kiszállító", "biztonsági őr", 
    "csomagoló", "szakács", "pincér", "felszolgáló", "pultos", "portás", 
    "gépkocsivezető", "rakodó", "lakatos", "villanyszerelő", "asztalos", "|ács|",
    "szobalány", "gondnok", "költöztető", "vízvezeték", "fűtésszerelő", "burkoló", 
    "áruházi", "áruház", "eladótér", "|cnc|", "esztergályos",
    "cleaner", "driver", "cashier", "courier", "security guard", "waiter", "waitress", 
    "bartender", "chef", "cook", "packager", "assembler", "laborer", "dishwasher", 
    "janitor", "maid", "loader", "mason", "painter", "carpenter", "plumber"
];

const dubiousPhysicalWords = ["raktár", "gyártás", "üzem", "szerelő", "karbantartó", "operátor", "technikus", "művezető", "betanított", "árufeltöltő", "komissiózó", "warehouse", "operator", "technician", "factory", "production", "maintenance", "mechanic"];
const saviorWords = ["mérnök", "engineer", "elemző", "analyst", "gyakornok", "intern", "trainee", "diák", "vezető", "manager", "koordinátor", "coordinator", "tervező", "specialista", "asszisztens", "assistant", "fejlesztő", "developer", "projekt", "project"];
const experienceRejectWords = ["min. 3", "legalább 3", "minimum 3", "min. 4", "min. 5", "legalább 5", "3 év tapasztalat", "3+ év", "4+ év", "minimum 3-5 év", "min. 3 years", "at least 3 years", "3+ years", "3 years of experience"];
const acceptWords = ["gyakornok", "diákmunka", "diák", "pályakezdő", "junior", "frissdiplomás", "asszisztens", "iskolaszövetkezet", "hallgatói jogviszony", "részmunkaidő", "tapasztalat nélkül", "pályaindító", "0 év", "kezdő", "gyakorlat", "szövetkezet", "nappali tagozat", "intern", "internship", "trainee", "student", "entry level", "entry-level", "assistant", "recent graduate", "new graduate", "fresh graduate", "no experience", "0-1 year", "part-time", "scholar"];

// ============================================================================
// 3. KÉPZÉSI TERÜLETEK ÉS ANTI-KATEGÓRIÁK
// ============================================================================
const categoriesDict = {
    "Informatika és Számítástudomány": ["|it|", "cyber", "security", "*hálózat*", "*üzemeltető*", "*rendszergazda*", "cloud", "infrastruktúra", "sysadmin", "*fejlesztő*", "developer", "*szoftver*", "software", "devops", "*tesztelő*", "frontend", "backend", "*programozó*", "fullstack", "architect", "kiberbiztonság", "webfejleszt", "|ios|", "android", "mobile", "|qa|", "tester", "scrum master", "network engineer", "software engineer", "*informatikus*"],
    "Adattudomány és Mesterséges Intelligencia": ["data analyst", "data scientist", "*adatelemző*", "*adattudós*", "|bi|", "business intelligence", "machine learning", "mesterséges intelligencia", "big data", "data engineer", "|ai|", "|nlp|", "deep learning", "*adatmérnök*", "artificial intelligence"],
    "Pénzügy, Számvitel és Gazdaságelemzés": ["pénzügy", "finance", "számvitel", "accounting", "*könyvelő*", "|audit|", "*kontroller*", "controller", "bérszámfejt", "|adó|", "|tax|", "*gazdaságelemző*", "bank", "hitelezés", "kockázat", "risk", "financial", "treasury", "*könyvvizsgáló*", "kintlévőség", "payroll"],
    "Kereskedelem és Értékesítés": ["|sales|", "*értékesítő*", "|b2b|", "|b2c|", "key account", "kereskedelem", "*üzletkötő*", "account manager", "telemarketing", "sales representative"],
    "Vállalatirányítás és Menedzsment": ["üzleti", "business", "*tanácsadó*", "üzletépítő", "menedzsment", "management", "*projektmenedzser*", "stratégia", "consultant", "project manager", "scrum", "agile", "product owner"],
    "Marketing, PR és Médiatudomány": ["marketing", "social media", "tartalom", "content", "seo", "ppc", "kampány", "|pr|", "kommunikáció", "rendezvény", "média", "public relations", "brand", "márka", "kommunikációs", "copywriter", "újságíró", "szövegíró", "campaign", "*rendezvényszervező*"],
    "Emberi Erőforrás Menedzsment (HR)": ["|hr|", "human resources", "személyügy", "toborz", "recruitment", "kiválasztás", "onboarding", "munkaügy", "szervezetépítő", "talent", "employer branding", "bérügy", "sourcing", "sourcer", "talent acquisition"],
    "Logisztika és Ellátásilánc-menedzsment": ["logisztika", "logistics", "ellátási lánc", "beszerzés", "procurement", "vám", "purchasing", "supply chain", "|raktár|", "warehouse", "szállítmányozás", "fuvarszervező"],
    "Gépészmérnöki és Mechatronikai Tudományok": ["*gépész*", "mechanical", "mechatronika", "cad", "*tervezőmérnök*", "*járműmérnök*", "célgép", "*konstruktőr*", "cam", "design engineer"],
    "Villamosmérnöki és Elektronikai Tudományok": ["*villamos*", "electrical", "elektronika", "hardware", "beágyazott", "embedded", "|plc|", "áramkör", "erősáram", "gyengeáram"],
    "Építőmérnöki és Építészmérnöki Tudományok": ["*építőmérnök*", "civil engineer", "*építész*", "architecture", "kivitelező", "létesítmény", "facility", "műszaki ellenőr", "építésvezető", "statikus", "geodéta", "építésirányító", "construction"],
    "Vegyészmérnöki és Biomérnöki Tudományok": ["*vegyész*", "*kémiaimérnök*", "chemical", "*biomérnök*", "*folyamatmérnök*", "process engineer", "vegyipar", "polimer", "bioengineer"],
    "Gyártástechnológia és Minőségbiztosítás": ["minőség", "quality", "*minőségellenőr*", "minőségbiztosítás", "lean", "six sigma", "*termelésirányító*", "gyártás", "production"],
    "Orvos- és Egészségtudomány": ["*orvos*", "*ápoló*", "egészség", "klinika", "*nővér*", "*terapeuta*", "*dietetikus*", "mentő", "healthcare", "medikus", "*fogorvos*", "*szülésznő*", "*gyógytornász*", "szanitéc", "orvosi", "dentál", "asszisztencia", "műtős", "doctor", "nurse", "medical"],
    "Gyógyszerésztudomány és Klinikai Kutatás": ["*gyógyszerész*", "pharma", "clinical", "törzskönyvező", "|cra|", "gyógyszeripar", "patika", "*laboráns*", "*farmakológ*", "pharmacist"],
    "Természettudomány és Kutatás (K+F)": ["*kutató*", "labor", "*biológus*", "*fizikus*", "research", "r&d", "tudományos", "science", "*matematikus*", "*geológus*", "*csillagász*", "*meteorológus*", "scientist"],
    "Agrártudomány és Környezetgazdálkodás": ["mezőgazdaság", "*agrármérnök*", "környezetvédelem", "erdészet", "fenntarthatóság", "agrárium", "|ehs|", "*környezetmérnök*", "*agronómus*", "*állatorvos*", "*élelmiszermérnök*", "*kertész*", "agriculture", "sustainability"],
    "Állam- és Jogtudomány": ["|jog|", "|legal|", "*ügyvéd*", "szerződés", "*jogász*", "compliance", "bojtár", "jogtanácsos", "*közjegyző*", "jogi", "lawyer", "jurist", "contract"],
    "Közigazgatás és Közszolgálat": ["közigazgatás", "*referens*", "hatóság", "közszolgálat", "önkormányzat", "*tisztviselő*", "államkincstár", "*hivatalnok*", "kormányablak", "public administration", "municipality"],
    "Társadalomtudomány és Nemzetközi Tanulmányok": ["*pszichológus*", "*szociológus*", "társadalom", "esélyegyenlőség", "nemzetközi", "international relations", "politológia", "szociális", "psychology", "equality"],
    "Bölcsészettudomány és Pedagógia": ["*tanár*", "*oktató*", "*pedagógus*", "*gyógypedagógus*", "*tréner*", "*docens*", "*tanító*", "óvoda", "*nevelő*", "education", "*fordító*", "nyelv", "andragógia", "*történész*", "*tolmács*", "*bölcsész*", "teacher", "educator", "tutor", "interpreter", "pedagógia"],
    "Művészet és Design": ["*grafikus*", "|ux|", "|ui|", "dizájn", "kreatív", "videó", "fotó", "*szerkesztő*", "*animátor*", "művészet", "illustrator", "|3d|", "*vágó*", "*rendező*", "designer", "art director", "graphic"],
    "Ügyfélszolgálat és Támogatás": ["ügyfélszolgálat", "customer", "helpdesk", "|support|", "call center", "ügyfélkapcsolat", "panaszkezel", "client service", "ügyfél"],
    "Adminisztráció és Irodai Munka": ["adminisztráció", "adminisztr", "*asszisztens*", "*titkár*", "recepció", "iroda", "|office|", "*adminisztrátor*", "data entry", "operáció", "operations", "secretary", "receptionist"]
};

// 🛡️ BÜNTETŐPONTOK (-50 pont, ha ezek a szavak benne vannak)
const antiCategoriesDict = {
    "Informatika és Számítástudomány": ["toborzó", "recruiter", "értékesítő", "sales", "jogász", "lawyer", "*pedagógus*", "*tanár*", "*oktató*"],
    "Művészet és Design": ["design engineer", "tervezőmérnök", "cad", "cam"], 
    "Kereskedelem és Értékesítés": ["műszaki értékesítő", "sales engineer", "mérnök", "engineer"],
    "Pénzügy, Számvitel és Gazdaságelemzés": ["informatikus", "developer", "fejlesztő", "programmer"] 
};

// ============================================================================
// 4. PRE-COMPILATION (Memória optimalizálás)
// ============================================================================
const compiledFatalSenior = buildRegex(fatalSeniorWords);
const compiledFatalPhysical = buildRegex(fatalPhysicalWords);
const compiledDubiousPhysical = buildRegex(dubiousPhysicalWords);
const compiledSaviors = buildRegex(saviorWords);
const compiledExperienceReject = buildRegex(experienceRejectWords);
const compiledAccept = buildRegex(acceptWords);
const compiledJuniorSaviors = buildRegex(["*junior*", "*gyakornok*", "intern", "trainee", "diák", "student", "pályakezdő", "frissdiplomás", "asszisztens", "pályaindító", "kezdő", "entry level", "graduate"]);

const compiledCategories = {};
for (const [cat, words] of Object.entries(categoriesDict)) { compiledCategories[cat] = buildRegex(words); }

const compiledAntiCategories = {};
for (const [cat, words] of Object.entries(antiCategoriesDict)) { compiledAntiCategories[cat] = buildRegex(words); }

// Vibes és Címkék compilation
const vibesDict = {
    "🗣️ Emberközpontú": ["kapcsolattartás", "ügyfél", "csapatmunka", "kommunikáció", "prezentáció", "customer", "ügyfélszolgálat", "támogatás", "support", "interjú", "tárgyalás", "vendég", "kiszolgálás", "csapat", "teamwork", "collaboration", "client", "interpersonal"],
    "📊 Elemző / Adatvezérelt": ["elemzés", "riport", "statisztika", "kutatás", "adat", "data", "optimalizálás", "analytics", "reporting", "kimutatás", "modellezés", "excel", "makró", "dashboard", "analytical", "data driven"],
    "🔍 Precíz / Szabálykövető": ["ellenőrzés", "adminisztráció", "dokumentáció", "precíz", "pontos", "jogszabály", "szerződés", "nyilvántartás", "compliance", "iktatás", "audit", "szabvány", "szabályzat", "attention to detail", "accuracy", "regulatory"],
    "📝 Kreatív / Alkotó": ["kreatív", "tervezés", "ötletelés", "design", "grafika", "cikk", "tartalomgyártás", "videó", "kreativitás", "innováció", "vizuális", "szövegírás", "kampány", "creative", "brainstorming", "visual"],
    "🏃‍♂️ Pörgős / Terepmunka": ["utazás", "rendezvény", "rugalmas", "dinamikus", "helyszíni", "változatos", "agilis", "vezetés", "kiszállás", "fast-paced", "travel required", "field work"]
};
const compiledVibes = {};
for (const [vibe, words] of Object.entries(vibesDict)) { compiledVibes[vibe] = buildRegex(words); }

const rawTags = [
    "angol", "english", "német", "german", "francia", "french", "spanyol", "spanish", "olasz", "holland", "lengyel", "kínai",
    "excel", "powerpoint", "word", "|sap|", "|erp|", "salesforce", "hubspot", "power bi", "tableau", "jira", "confluence", "trello", "slack", "google analytics",
    "python", "|sql|", "|java|", "javascript", "typescript", "c++", "c#", "|c|", "ruby", "php", "swift", "kotlin", "rust", "|go|", "golang", "react", "angular", "vue", "spring", "dotnet", "laravel", "django", "express", "nodejs", "|aws|", "|gcp|", "azure", "docker", "kubernetes", "terraform", "ansible", "jenkins", "gitlab", "github", "git", "linux", "html", "css", "mongodb", "postgresql", "mysql", "redis",
    "autocad", "solidworks", "creo", "catia", "revit", "archicad", "figma", "canva", "photoshop", "illustrator", "premiere", "after effects", "indesign",
    "home office", "remote", "hibrid", "hybrid", "távmunka", "rugalmas", "flexible", "részmunkaidő", "part-time", "diákmunka", "teljes munkaidő", "full-time", "on-site", "onsite"
];
const compiledTags = rawTags.map(tag => ({
    original: tag.replace(/\|/g, '').replace(/\*/g, '').trim(),
    regex: buildRegex([tag])
}));

// ============================================================================
// FŐ FÜGGVÉNY: A SÚLYOZOTT TF-IDF PONTOZÁSOS AGY
// ============================================================================
exports.analyzeJob = function(title, description = "") {
    
    let safeTitle = title ? String(title).toLowerCase() : "";
    let safeDesc = description ? String(description).toLowerCase() : "";
    
    // Detoxifikáció
    let fullText = `${safeTitle} ${safeDesc}`;
    for (const rule of detoxRules) {
        fullText = fullText.replace(rule.regex, rule.replacement);
        safeTitle = safeTitle.replace(rule.regex, rule.replacement);
        safeDesc = safeDesc.replace(rule.regex, rule.replacement);
    }

    // Cím zajszűrése
    const cleanTitle = safeTitle.replace(/\([^()]*\)/g, '').replace(/\[[^\[\]]*\]/g, '').trim();
    
    const leadDesc = safeDesc.substring(0, 300); 
    const bodyDesc = safeDesc.substring(300);

    // --- GATEKEEPER RENDSZER ---
    if (compiledFatalSenior.test(cleanTitle)) return null; 
    if (compiledFatalPhysical.test(safeTitle)) return null; 
    
    if (compiledDubiousPhysical.test(safeTitle)) {
        if (!compiledSaviors.test(safeTitle)) return null;
    }

    let isEntryLevel = compiledAccept.test(fullText);
    let isTooSenior = compiledExperienceReject.test(fullText);

    if (isTooSenior && isEntryLevel) {
        if (compiledJuniorSaviors.test(cleanTitle)) {
            isTooSenior = false; 
        }
    }

    if (isTooSenior || !isEntryLevel) return null; 

    // ------------------------------------------------------------------------
    // 🚀 TF-IDF SÚLYOZOTT PONTOZÁS
    // ------------------------------------------------------------------------
    let categoryScores = {};
    for (const catName of Object.keys(categoriesDict)) { categoryScores[catName] = 0; }

    for (const [catName, regex] of Object.entries(compiledCategories)) {
        let score = 0;
        
        const titleMatches = (cleanTitle.match(regex) || []).length;
        score += titleMatches * 20;

        const leadMatches = (leadDesc.match(regex) || []).length;
        score += leadMatches * 5;

        const bodyMatches = (bodyDesc.match(regex) || []).length;
        score += bodyMatches * 1;

        if (compiledAntiCategories[catName]) {
            const antiMatches = (fullText.match(compiledAntiCategories[catName]) || []).length;
            score -= antiMatches * 50;
        }

        categoryScores[catName] = score;
    }

    let assignedCategory = "🔍 Egyéb / Általános";
    let maxScore = 0;
    
    for (const [catName, score] of Object.entries(categoryScores)) {
        if (score > maxScore) {
            maxScore = score;
            assignedCategory = catName;
        } else if (score === maxScore && score > 0) {
            const currentCatIndex = Object.keys(categoriesDict).indexOf(assignedCategory);
            const newCatIndex = Object.keys(categoriesDict).indexOf(catName);
            if (newCatIndex < currentCatIndex) {
                assignedCategory = catName;
            }
        }
    }

    if (maxScore <= 0) assignedCategory = "🔍 Egyéb / Általános";

    // ------------------------------------------------------------------------
    // MUNKASTÍLUS ÉS CÍMKÉK
    // ------------------------------------------------------------------------
    let assignedVibe = "";
    for (const [vibeName, regex] of Object.entries(compiledVibes)) {
        if (regex.test(fullText)) { assignedVibe = vibeName; break; }
    }

    let foundTags = [];
    for (const tagObj of compiledTags) {
        if (tagObj.regex.test(fullText)) {
            foundTags.push("#" + tagObj.original.charAt(0).toUpperCase() + tagObj.original.slice(1));
        }
    }
    foundTags = [...new Set(foundTags)];

    let jobNature = "Pályakezdő (Teljes munkaidő)";
    const internRegex = buildRegex(["*junior*", "*gyakornok*", "intern", "trainee", "diák", "student", "részmunkaidő", "part-time", "part time", "iskolaszövetkezet", "|diákmunka|", "|nappali|"]);
    
    if (internRegex.test(cleanTitle) || internRegex.test(fullText)) {
        jobNature = "Gyakornok / Részmunkaidő";
    }

    return {
        is_junior: true,
        job_nature: jobNature,
        faculty: assignedCategory,
        work_style: assignedVibe,
        tags: foundTags
    };
};