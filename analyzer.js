// ============================================================================
// MAGYAR ÉS ANGOL NYELVŰ PRECIZIÓS SZÓHATÁR-VIZSGÁLÓ (Linguistic Engine)
// ============================================================================
function smartMatch(text, keyword) {
    keyword = keyword.toLowerCase();
    
    // Szigorú szóhatár-vizsgálat (pl. "|it|", "|hr|")
    if (keyword.startsWith("|") && keyword.endsWith("|")) {
        const word = keyword.slice(1, -1);
        const regex = new RegExp(`(^|[^a-záéíóöőúüű0-9_])${word}([^a-záéíóöőúüű0-9_]|$)`, 'i');
        return regex.test(text);
    }
    
    // Ha nincs ||, akkor sima szórészlet keresés (pl. "fejleszt" megtalálja a "fejlesztő"-t)
    return text.includes(keyword);
}

// ============================================================================
// 1. KÉTNYELVŰ MÉREGTELENÍTÉS (Detox)
// Kiszűri a hamis pozitív riasztásokat mindkét nyelven.
// ============================================================================
const detoxRules = [
    // Magyar detox
    { regex: /vezetői engedély/gi, replacement: "jogosítvány" },
    { regex: /piacvezető/gi, replacement: "piacelső" },
    { regex: /világvezető/gi, replacement: "világelső" },
    { regex: /(senior|szenior) (kollég|munkatárs)/gi, replacement: "mentor" },
    { regex: /vezető(j|k|höz|d|nek)/gi, replacement: "felettes" }, 
    { regex: /vezetői támogatás/gi, replacement: "felettesi támogatás" },
    { regex: /tapasztalat (előny|nem elvárás|nem feltétel)/gi, replacement: "pályakezdő" },
    { regex: /0-3 év|1-3 év|1-2 év|max(imum|\.)? 2 év/gi, replacement: "pályakezdő" },
    
    // Angol detox (Kritikus a multiknál!)
    { regex: /driver'?s? license/gi, replacement: "jogosítvány" },
    { regex: /market leader|industry leader/gi, replacement: "piacelső" },
    { regex: /senior colleagues?|senior team members?/gi, replacement: "mentor" },
    { regex: /experience is (an advantage|a plus|a nice to have|nice to have|optional)/gi, replacement: "pályakezdő" },
    { regex: /no (prior |previous )?experience (needed|required|necessary)/gi, replacement: "pályakezdő" },
    { regex: /(0-3|1-3|0-2|1-2) (years|yrs)( of experience)?/gi, replacement: "pályakezdő" },
    { regex: /up to 2 years( of experience)?/gi, replacement: "pályakezdő" }
];

// ============================================================================
// 2. KIZÁRÓ SZAVAK (Feketesereg - BŐVÍTETT FEHÉRGALLÉROS VÉDŐPAJZS)
// ============================================================================
const fatalTitleWords = [
    // --- 1. Vezetői és Senior tiltások (Magyar és Angol) ---
    "senior", "szenior", "manager", "menedzser", "igazgató", "szakértő", 
    "medior", "műszakvezető", "csoportvezető", "projektvezető", "üzletvezető", 
    "főorvos", "főnővér", "tulajdonos", "osztályvezető", "vezető", "sr", 
    "head of", "lead", "expert", "supervisor", "director", "architect", 
    "coordinator", "vp", "president", "chief", "principal", "founder", "partner",
    "cfo", "ceo", "cto", "coo", "cmo", 
    
    // --- 2. FIZIKAI ÉS SZAKMUNKÁK (Egyetemhez nem köthető állások) ---
    "takarító", "karbantartó", "operátor", "szerelő", "hegesztő", "forgácsoló", 
    "cnc", "kőműves", "festő", "árufeltöltő", "pénztáros", "bolti eladó", "eladó",
    "raktáros", "targoncás", "sofőr", "futár", "diszpécser", "vagyonőr", "kiszállító",
    "biztonsági őr", "fizikai", "gépkezelő", "csomagoló", "szakács", "pincér", 
    "felszolgáló", "pultos", "takarítás", "portás", "gépkocsivezető", "rakodó", 
    "technikus", "művezető", "lakatos", "villanyszerelő", "asztalos", "ács",
    // Angol fizikai tiltások
    "cleaner", "operator", "driver", "warehouse", "cashier", "worker", "mechanic",
    "courier", "security guard", "waiter", "waitress", "bartender", "chef", "cook",
    "packager", "technician", "assembler", "laborer"
];

const experienceRejectWords = [
    // Magyar
    "min. 3", "legalább 3", "minimum 3", "min. 4", "min. 5", "legalább 5",
    "3 év tapasztalat", "4 év tapasztalat", "5 év tapasztalat", "6 év tapasztalat",
    "3+ év", "4+ év", "5+ év", "több éves szakmai tapasztalat", "sokéves tapasztalat",
    "jelentős tapasztalat", "vezetői tapasztalat", "minimum 3-5 év",
    // Angol
    "min. 3 years", "minimum 3 years", "at least 3 years", "3+ years", "4+ years", "5+ years",
    "3 years of experience", "5 years of experience", "proven track record",
    "extensive experience", "senior-level", "managerial experience", "significant experience"
];

// ============================================================================
// 3. BEENGEDŐ SZAVAK (VIP Lista - Multikra optimalizálva)
// ============================================================================
const acceptWords = [
    // Magyar
    "gyakornok", "diákmunka", "diák", "pályakezdő", "junior", "frissdiplomás", 
    "asszisztens", "betanított", "iskolaszövetkezet", "hallgatói jogviszony", 
    "részmunkaidő", "tapasztalat nélkül", "pályaindító", "0 év", "kezdő",
    "gyakorlat", "szövetkezet", "nappali tagozat", 
    // Angol
    "intern", "internship", "trainee", "student", "entry level", "entry-level", 
    "assistant", "apprentice", "apprenticeship", "recent graduate", "new graduate",
    "fresh graduate", "fresh grad", "no experience", "0-1 year", "part-time", 
    "part time", "graduate program", "early career", "co-op", "coop", "scholar"
];

// ============================================================================
// 4. KÉPZÉSI TERÜLETEK (Kétnyelvű kategória-motor)
// ============================================================================
const categories = {
    "Informatika és Számítástudomány": [
        "|it|", "cyber", "security", "hálózat", "üzemeltető", "rendszergazda", "cloud", 
        "infrastruktúra", "sysadmin", "fejleszt", "developer", "szoftver", "software", 
        "devops", "tesztel", "frontend", "backend", "programozó", "fullstack", "architect", 
        "kiberbiztonság", "webfejleszt", "|ios|", "android", "mobile", "|qa|", "tester", 
        "scrum master", "network engineer", "software engineer"
    ],
    "Adattudomány és Mesterséges Intelligencia": [
        "data analyst", "data scientist", "adatelemző", "adattudós", "|bi|", "business intelligence", 
        "machine learning", "mesterséges intelligencia", "big data", "data engineer", "|ai|", 
        "|nlp|", "deep learning", "adatmérnök", "artificial intelligence"
    ],
    "Pénzügy, Számvitel és Gazdaságelemzés": [
        "pénzügy", "finance", "számvitel", "accounting", "könyvelő", "audit", "kontroller", 
        "controller", "bérszámfejt", "adó", "tax", "gazdaságelemző", "bank", "hitelezés", 
        "kockázat", "risk", "financial", "treasury", "könyvvizsgáló", "kintlévőség", "payroll"
    ],
    "Vállalatirányítás és Menedzsment": [
        "üzleti", "business", "sales", "értékesítés", "tanácsadó", "b2b", "b2c", "key account", 
        "kereskedelem", "üzletfejleszt", "menedzsment", "management", "projektmenedzser", 
        "stratégia", "consultant", "project manager", "scrum", "agile", "product owner"
    ],
    "Marketing, PR és Médiatudomány": [
        "marketing", "social media", "tartalom", "content", "seo", "ppc", "kampány", 
        "|pr|", "kommunikáció", "rendezvény", "média", "public relations", "brand", 
        "márka", "kommunikációs", "copywriter", "újságíró", "szövegíró", "campaign"
    ],
    "Emberi Erőforrás Menedzsment (HR)": [
        "|hr|", "human resources", "személyügy", "toborz", "recruitment", "kiválasztás", 
        "onboarding", "munkaügy", "szervezetfejlesztés", "talent", "employer branding", "bérügy",
        "sourcing", "sourcer", "talent acquisition"
    ],
    "Logisztika és Ellátásilánc-menedzsment": [
        "logisztika", "logistics", "ellátási lánc", "beszerzés", "procurement", "vám", 
        "purchasing", "buyer", "supply chain"
    ],
    "Gépészmérnöki és Mechatronikai Tudományok": [
        "gépész", "mechanical", "mechatronika", "cad", "tervezőmérnök", "járműmérnök", "célgép",
        "konstruktőr", "cam", "design engineer"
    ],
    "Villamosmérnöki és Elektronikai Tudományok": [
        "villamos", "electrical", "elektronika", "hardware", "beágyazott", "embedded", "|plc|",
        "áramkör", "erősáram", "gyengeáram"
    ],
    "Építőmérnöki és Építészmérnöki Tudományok": [
        "építőmérnök", "civil engineer", "építész", "architecture", "kivitelező", "létesítmény", 
        "facility", "műszaki ellenőr", "építésvezető", "statikus", "geodéta", "építésirányító", "construction"
    ],
    "Vegyészmérnöki és Biomérnöki Tudományok": [
        "vegyész", "kémiaimérnök", "chemical", "biomérnök", "folyamatmérnök", "process engineer",
        "vegyipar", "polimer", "bioengineer"
    ],
    "Gyártástechnológia és Minőségbiztosítás": [
        "minőség", "quality", "qa", "minőségellenőr", "minőségbiztosítás", "lean", "six sigma", 
        "termelésirányító", "folyamatfejlesztő"
    ],
    "Orvos- és Egészségtudomány": [
        "orvos", "ápoló", "egészség", "klinika", "nővér", "terapeuta", "dietetikus", "mentő", 
        "healthcare", "medikus", "fogorvos", "szülésznő", "gyógytornász", "szanitéc", "orvosi",
        "dentál", "asszisztencia", "műtős", "doctor", "nurse", "medical"
    ],
    "Gyógyszerésztudomány és Klinikai Kutatás": [
        "gyógyszerész", "pharma", "clinical", "törzskönyvező", "cra", "gyógyszeripar", "patika", 
        "laboráns", "farmakológ", "pharmacist"
    ],
    "Természettudomány és Kutatás (K+F)": [
        "kutató", "labor", "biológus", "fizikus", "research", "r&d", "tudományos", "science", 
        "matematikus", "geológus", "csillagász", "meteorológus", "scientist"
    ],
    "Agrártudomány és Környezetgazdálkodás": [
        "mezőgazdaság", "agrármérnök", "környezetvédelem", "erdészet", "fenntarthatóság", "agrárium", 
        "ehs", "környezetmérnök", "agronómus", "állatorvos", "élelmiszermérnök", "kertész", "agriculture", "sustainability"
    ],
    "Állam- és Jogtudomány": [
        "|jog|", "legal", "ügyvéd", "szerződés", "jogász", "compliance", "bojtár", "jogtanácsos", 
        "közjegyző", "jogi", "lawyer", "jurist", "contract"
    ],
    "Közigazgatás és Közszolgálat": [
        "közigazgatás", "referens", "hatóság", "közszolgálat", "önkormányzat", "tisztviselő", 
        "ügyintéző", "államkincstár", "hivatalnok", "kormányablak", "public administration", "municipality"
    ],
    "Társadalomtudomány és Nemzetközi Tanulmányok": [
        "pszichológ", "szociológ", "társadalom", "esélyegyenlőség", "nemzetközi", "international relations", 
        "politológia", "szociális", "psychology", "equality"
    ],
    "Bölcsészettudomány és Pedagógia": [
        "tanár", "oktató", "pedagógus", "tréner", "docens", "tanító", "óvoda", "nevelő", "education", 
        "fordító", "nyelv", "andragógia", "történész", "tolmács", "bölcsész", "teacher", "educator", "tutor", "interpreter"
    ],
    "Művészet és Design": [
        "grafikus", "|ux|", "|ui|", "dizájn", "design", "kreatív", "videó", "fotó", "szerkesztő", 
        "animátor", "művészet", "illustrator", "|3d|", "vágó", "rendező", "designer", "art director", "graphic"
    ],
    "Adminisztráció és Ügyfélszolgálati Operáció": [
        "adminisztráció", "asszisztens", "titkár", "recepció", "iroda", "office", "adminisztrátor", 
        "ügyfélszolgálat", "customer", "helpdesk", "support", "call center", "data entry", 
        "ügyfél", "operáció", "operations", "secretary", "receptionist"
    ]
};

// ============================================================================
// 5. MUNKASTÍLUS (Kétnyelvű Vibe-Check)
// ============================================================================
const vibes = {
    "🗣️ Emberközpontú": ["kapcsolattartás", "ügyfél", "csapatmunka", "kommunikáció", "prezentáció", "customer", "ügyfélszolgálat", "támogatás", "support", "interjú", "tárgyalás", "vendég", "kiszolgálás", "csapat", "teamwork", "collaboration", "client", "interpersonal"],
    "📊 Elemző / Adatvezérelt": ["elemzés", "riport", "statisztika", "kutatás", "adat", "data", "optimalizálás", "analytics", "reporting", "kimutatás", "modellezés", "excel", "makró", "dashboard", "analytical", "data driven"],
    "🔍 Precíz / Szabálykövető": ["ellenőrzés", "adminisztráció", "dokumentáció", "precíz", "pontos", "jogszabály", "szerződés", "nyilvántartás", "compliance", "iktatás", "audit", "szabvány", "szabályzat", "attention to detail", "accuracy", "regulatory"],
    "📝 Kreatív / Alkotó": ["kreatív", "tervezés", "ötletelés", "design", "grafika", "cikk", "tartalomgyártás", "videó", "kreativitás", "innováció", "vizuális", "szövegírás", "kampány", "creative", "brainstorming", "visual"],
    "🏃‍♂️ Pörgős / Terepmunka": ["utazás", "rendezvény", "rugalmas", "dinamikus", "helyszíni", "változatos", "agilis", "vezetés", "kiszállás", "fast-paced", "travel required", "field work"]
};

// ============================================================================
// 6. MIKRO-CÍMKÉK (Global Enterprise Tech Stack)
// ============================================================================
const microTagsDict = [
    "angol", "english", "német", "german", "francia", "french", "spanyol", "spanish", "olasz", "holland", "lengyel", "kínai",
    "excel", "powerpoint", "word", "sap", "erp", "salesforce", "hubspot", "power bi", "tableau", "jira", "confluence", "trello", "slack", "google analytics",
    "python", "sql", "java", "javascript", "typescript", "c++", "c#", "c", "ruby", "php", "swift", "kotlin", "rust", "go", "golang", "react", "angular", "vue", "spring", "dotnet", "laravel", "django", "express", "nodejs", "aws", "gcp", "azure", "docker", "kubernetes", "terraform", "ansible", "jenkins", "gitlab", "github", "git", "linux", "html", "css", "mongodb", "postgresql", "mysql", "redis",
    "autocad", "solidworks", "creo", "catia", "revit", "archicad", "figma", "canva", "photoshop", "illustrator", "premiere", "after effects", "indesign",
    "home office", "remote", "hibrid", "hybrid", "távmunka", "rugalmas", "flexible", "részmunkaidő", "part-time", "diákmunka", "teljes munkaidő", "full-time", "on-site", "onsite"
];

// ============================================================================
// FŐ FÜGGVÉNY: Az elemző agya
// ============================================================================
exports.analyzeJob = function(title, description = "") {
    
    // 🚨 1. HIBA JAVÍTVA: Biztonságos szövegkezelés (Null/Undefined védelem)
    const safeTitle = title ? String(title).toLowerCase() : "";
    const safeDesc = description ? String(description).toLowerCase() : "";
    let textToSearch = `${safeTitle} ${safeDesc}`;
    
    // --- 0. LÉPÉS: MÉREGTELENÍTÉS (Detox) ---
    for (const rule of detoxRules) {
        textToSearch = textToSearch.replace(rule.regex, rule.replacement);
    }

    let isTooSenior = false;
    let isEntryLevel = false;

    // --- 1. LÉPÉS: SZIGORÚ CÍM ELLENŐRZÉS ---
    // 🚨 2. HIBA JAVÍTVA: "Szó-kannibalizmus" megszűnt! Csak egzakt határokat vizsgál.
    for (const word of fatalTitleWords) {
        // A | jelek kényszerítik az egzakt szóhatárt, így az 'ács' nem vágja ki a 'tanácsadó'-t!
        if (smartMatch(safeTitle, `|${word}|`)) {
            return null; 
        }
    }

    // --- 2. LÉPÉS: BEENGEDŐ SZAVAK KERESÉSE ---
    for (const word of acceptWords) {
        if (textToSearch.includes(word)) {
            isEntryLevel = true;
            break;
        }
    }

    // --- 3. LÉPÉS: TAPASZTALAT ELLENŐRZÉS (A leírásban) ---
    for (const word of experienceRejectWords) {
        if (textToSearch.includes(word)) {
            isTooSenior = true;
            break;
        }
    }

    // A VÉDŐPAJZS: Ha a leírás "Seniornak" tűnik, de a címe Gyakornok/Junior
    if (isTooSenior && isEntryLevel) {
        const strongJuniorWords = ["junior", "gyakornok", "intern", "trainee", "diák", "student", "pályakezdő", "frissdiplomás", "asszisztens", "pályaindító", "kezdő", "entry level", "graduate"];
        for (const word of strongJuniorWords) {
            // Itt is szigorú szóhatárt alkalmazunk
            if (smartMatch(safeTitle, `|${word}|`)) {
                isTooSenior = false; 
                break;
            }
        }
    }

    if (isTooSenior || !isEntryLevel) {
        return null; 
    }

    // --- 4. KATEGORIZÁLÁS (Képzési terület) ---
    let assignedCategory = "🔍 Egyéb / Általános"; 
    for (const [catName, keywords] of Object.entries(categories)) {
        for (const keyword of keywords) {
            if (smartMatch(textToSearch, keyword)) {
                assignedCategory = catName;
                break; 
            }
        }
        if (assignedCategory !== "🔍 Egyéb / Általános") break; 
    }

    // --- 5. MUNKASTÍLUS (Vibe-check) ---
    let assignedVibe = "";
    for (const [vibeName, keywords] of Object.entries(vibes)) {
        for (const keyword of keywords) {
            if (smartMatch(textToSearch, keyword)) {
                assignedVibe = vibeName;
                break;
            }
        }
        if (assignedVibe !== "") break;
    }

    // --- 6. MIKRO-CÍMKÉK ---
    let foundTags = [];
    for (const tag of microTagsDict) {
        if (smartMatch(textToSearch, tag)) {
            const cleanTag = tag.replace(/\|/g, '').trim();
            foundTags.push("#" + cleanTag.charAt(0).toUpperCase() + cleanTag.slice(1));
        }
    }
    
    foundTags = [...new Set(foundTags)];

    // --- 7. MUNKAIDŐ TÍPUS MEGHATÁROZÁSA ---
    let jobNature = "Pályakezdő (Teljes munkaidő)";
    if (
        safeTitle.includes("gyakornok") || safeTitle.includes("intern") || 
        safeTitle.includes("diák") || safeTitle.includes("student") || 
        safeTitle.includes("trainee") || textToSearch.includes("részmunkaidő") || 
        textToSearch.includes("part-time") || textToSearch.includes("part time") || 
        textToSearch.includes("iskolaszövetkezet") || smartMatch(textToSearch, "|diákmunka|") || 
        smartMatch(textToSearch, "|nappali|")
    ) {
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