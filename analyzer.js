// ============================================================================
// 1. HAMIS POZITÍV KIFEJEZÉSEK MÉREGTELENÍTÉSE (Detox)
// Ezek a kifejezések tartalmaznak "veszélyes" szavakat (pl. senior, vezető, év), 
// de valójában ártalmatlanok egy junior számára. Kicseréljük őket a memóriában.
// ============================================================================
const detoxRules = [
    { regex: /vezetői engedély/gi, replacement: "jogosítvány" },
    { regex: /piacvezető/gi, replacement: "piacelső" },
    { regex: /senior kollég/gi, replacement: "mentor" },
    { regex: /szenior kollég/gi, replacement: "mentor" },
    { regex: /senior munkatárs/gi, replacement: "mentor" },
    { regex: /vezető(j|k|höz)/gi, replacement: "felettes" }, // pl. vezetőhöz, vezetőjük
    { regex: /tapasztalat előny/gi, replacement: "nem feltétel" },
    { regex: /nem feltétel/gi, replacement: "pályakezdő" },
    { regex: /tapasztalat nem elvárás/gi, replacement: "pályakezdő" },
    { regex: /0-3 év/gi, replacement: "pályakezdő" },
    { regex: /1-3 év/gi, replacement: "pályakezdő" },
    { regex: /1-2 év/gi, replacement: "pályakezdő" }
];

// ============================================================================
// 2. KIZÁRÓ SZAVAK (Feketesereg)
// ============================================================================
// A) Szavak, amik ha a CÍMBEN szerepelnek, azonnali halált jelentenek:
const fatalTitleWords = [
    "senior", "szenior", "manager", "menedzser", "igazgató", "head of", "lead", 
    "expert", "szakértő", "medior", "supervisor", "director", "architect", 
    "műszakvezető", "csoportvezető", "projektvezető", "üzletvezető", "főorvos"
];

// B) Tapasztalatra utaló szavak, amik a LEÍRÁSBAN is kizárnak:
const experienceRejectWords = [
    "min. 3", "legalább 3", "minimum 3", "min. 4", "min. 5", "legalább 5",
    "3 év tapasztalat", "4 év tapasztalat", "5 év tapasztalat", 
    "3+ év", "5+ év", "több éves szakmai tapasztalat", "sokéves tapasztalat",
    "többéves tapasztalat"
];

// ============================================================================
// 3. BEENGEDŐ SZAVAK (VIP Lista)
// ============================================================================
const acceptWords = [
    // Magyar
    "gyakornok", "diákmunka", "diák", "pályakezdő", "junior", "frissdiplomás", 
    "asszisztens", "betanított", "iskolaszövetkezet", "hallgatói jogviszony", 
    "részmunkaidő", "tapasztalat nélkül", "pályaindító", "0 év", "kezdő",
    // Angol
    "intern", "internship", "trainee", "student", "entry level", "entry-level", 
    "assistant", "apprentice", "apprenticeship", "recent graduate", "new graduate",
    "no experience", "0-1 year", "part-time", "part time"
];

// ============================================================================
// 4. KÉPZÉSI TERÜLETEK (A karokhoz)
// ============================================================================
const categories = {
    "💻 IT & Fejlesztés": ["fejlesztő", "developer", "szoftver", "software", "it ", "üzemeltető", "devops", "tesztelő", "frontend", "backend", "rendszergazda", "programozó", "cyber", "security", "data scientist", "cloud", "hálózat"],
    "💼 Gazdasági & Üzleti": ["pénzügy", "finance", "számvitel", "accounting", "könyvelő", "audit", "kontroller", "controller", "üzleti", "business", "sales", "értékesítés", "tanácsadó", "kereskedelem", "b2b", "key account"],
    "⚙️ Mérnöki & Műszaki": ["mérnök", "engineer", "gépész", "villamos", "mechatronika", "minőségügy", "quality", "karbantartó", "építő", "gyártás", "termelés", "üzemmérnök", "tervező", "cad"],
    "🤝 HR & Toborzás": ["hr ", "toborz", "recruitment", "human resources", "személyügy", "kiválasztás", "onboarding", "bérszámfejtés", "payroll"],
    "⚖️ Jogi & Államigazgatás": ["jog", "legal", "ügyvéd", "compliance", "közigazgatás", "referens", "hatóság", "szerződés", "közszolgálat", "jogász"],
    "📣 Marketing & PR": ["marketing", "kommunikáció", "pr ", "social media", "tartalom", "content", "rendezvény", "event", "grafikus", "design", "copywriter", "seo", "ppc", "kampány"],
    "📦 Logisztika & Beszerzés": ["logisztika", "logistics", "beszerzés", "procurement", "raktár", "supply chain", "szállítmányozás", "fuvarszervező", "ellátási lánc", "vám"],
    "🧠 Társadalom & Bölcsész": ["oktatás", "kutatás", "pszichológia", "fordító", "szerkesztő", "újságíró", "szociológia", "ügyfélszolgálat", "nyelv", "tanár"]
};

// ============================================================================
// 5. MUNKASTÍLUS (Vibe-Check)
// ============================================================================
const vibes = {
    "🗣️ Emberközpontú": ["kapcsolattartás", "ügyfél", "csapatmunka", "kommunikáció", "prezentáció", "customer", "ügyfélszolgálat", "támogatás", "support", "interjú", "tárgyalás"],
    "📊 Elemző / Adatvezérelt": ["elemzés", "riport", "statisztika", "kutatás", "adat", "data", "optimalizálás", "analytics", "reporting", "kimutatás", "modellezés", "excel"],
    "🔍 Precíz / Szabálykövető": ["ellenőrzés", "adminisztráció", "dokumentáció", "precíz", "pontos", "jogszabály", "szerződés", "nyilvántartás", "compliance", "iktatás", "audit"],
    "📝 Kreatív / Alkotó": ["kreatív", "tervezés", "ötletelés", "design", "grafika", "cikk", "tartalomgyártás", "videó", "kreativitás", "innováció"],
    "🏃‍♂️ Pörgős / Terepmunka": ["terepmunka", "utazás", "rendezvény", "rugalmas", "dinamikus", "helyszíni", "gyártósor", "raktár", "változatos", "agilis"]
};

// ============================================================================
// 6. MIKRO-CÍMKÉK (Tech stack, nyelvek, munkarend)
// ============================================================================
const microTagsDict = [
    // Nyelvek
    "angol", "english", "német", "german", "francia", "spanyol", "olasz",
    // Office / Üzlet
    "excel", "powerpoint", "word", "sap", "erp", "salesforce", "power bi", "tableau",
    // Tech & Dev
    "python", "sql", "java ", "javascript", "typescript", "c++", "c#", "react", "angular", "node", "aws", "azure", "docker", "git", "linux", "html", "css",
    // Mérnöki / Design
    "autocad", "solidworks", "figma", "canva", "photoshop",
    // Munkavégzés módja
    "home office", "remote", "hibrid", "távmunka", "rugalmas"
];

// ============================================================================
// FŐ FÜGGVÉNY
// ============================================================================
exports.analyzeJob = function(title, description = "") {
    const lowerTitle = title.toLowerCase();
    let textToSearch = `${lowerTitle} ${description.toLowerCase()}`;
    
    // --- 0. LÉPÉS: MÉREGTELENÍTÉS (Detox) ---
    // Lecseréljük a megtévesztő szavakat ártalmatlanokra, hogy ne zavarják meg a szűrőt
    for (const rule of detoxRules) {
        textToSearch = textToSearch.replace(rule.regex, rule.replacement);
    }

    let isTooSenior = false;
    let isEntryLevel = false;

    // --- 1. LÉPÉS: SZIGORÚ CÍM ELLENŐRZÉS ---
    // Ha a pozíció címe konkrétan kimondja, hogy vezető vagy senior, azonnal kuka!
    for (const word of fatalTitleWords) {
        if (lowerTitle.includes(word)) {
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

    // A VÉDŐPAJZS: Ha a leírás "Seniornak" tűnik a tapasztalat miatt (pl. benne maradt valami fura szó), 
    // DE a címe egyértelműen Junior/Gyakornok, megmentjük!
    if (isTooSenior && isEntryLevel) {
        const strongJuniorWords = ["junior", "gyakornok", "intern", "trainee", "diák", "student", "pályakezdő", "frissdiplomás", "asszisztens"];
        for (const word of strongJuniorWords) {
            if (lowerTitle.includes(word)) {
                isTooSenior = false; // Felülbíráljuk a kizárást!
                break;
            }
        }
    }

    // VÉGSŐ DÖNTÉS: Ha túl sok tapasztalatot kér és a címe nem védte meg, VAGY ha egyáltalán nem említi, hogy pályakezdő -> KUKA.
    if (isTooSenior || !isEntryLevel) {
        return null; 
    }

    // --- 4. KATEGORIZÁLÁS (Képzési terület) ---
    let assignedCategory = "🔍 Egyéb / Általános"; 
    for (const [catName, keywords] of Object.entries(categories)) {
        for (const keyword of keywords) {
            // Szóközökkel biztosítjuk, hogy a "hit" ne találja meg az "építész"-t, stb.
            if (textToSearch.includes(keyword)) {
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
            if (textToSearch.includes(keyword)) {
                assignedVibe = vibeName;
                break;
            }
        }
        if (assignedVibe !== "") break;
    }

    // --- 6. MIKRO-CÍMKÉK ---
    let foundTags = [];
    for (const tag of microTagsDict) {
        // Hogy elkerüljük az apró betűs egyezéseket (pl. 'it' a 'mit' szóban), a rövid szavakat szóközzel ellenőrizzük
        const searchTag = tag.length <= 3 && !tag.includes("c++") && !tag.includes("c#") ? ` ${tag} ` : tag;
        
        if (textToSearch.includes(searchTag)) {
            foundTags.push("#" + tag.trim().charAt(0).toUpperCase() + tag.trim().slice(1));
        }
    }
    
    // --- 7. MUNKAIDŐ TÍPUS MEGHATÁROZÁSA A CÍM ALAPJÁN ---
    let jobNature = "Pályakezdő (Teljes munkaidő)";
    if (lowerTitle.includes("gyakornok") || lowerTitle.includes("intern") || lowerTitle.includes("diák") || lowerTitle.includes("student") || lowerTitle.includes("trainee") || textToSearch.includes("részmunkaidő") || textToSearch.includes("part-time")) {
        jobNature = "Gyakornok / Részmunkaidő";
    }

    // EREDMÉNY VISSZAADÁSA
    return {
        is_junior: true,
        job_nature: jobNature,
        faculty: assignedCategory,
        work_style: assignedVibe,
        tags: foundTags
    };
};