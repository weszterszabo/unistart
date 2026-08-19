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
// ============================================================================
// 4. KÉPZÉSI TERÜLETEK (Hivatalos akadémiai és vállalati szaknyelv szerint)
// ============================================================================
const categories = {
    // --- INFORMATIKA ÉS ADATTUDOMÁNY ---
    "Informatika és Számítástudomány": ["it ", "cyber", "security", "hálózat", "üzemeltető", "rendszergazda", "cloud", "infrastruktúra", "sysadmin", "fejlesztő", "developer", "szoftver", "software", "devops", "tesztelő", "frontend", "backend", "programozó", "fullstack", "architect"],
    "Adattudomány és Mesterséges Intelligencia": ["data analyst", "data scientist", "adatelemző", "adattudós", "bi ", "business intelligence", "machine learning", "mesterséges intelligencia", "big data"],

    // --- GAZDASÁGTUDOMÁNYOK ---
    "Pénzügy, Számvitel és Gazdaságelemzés": ["pénzügy", "finance", "számvitel", "accounting", "könyvelő", "audit", "kontroller", "controller", "bérszámfejtő", "adó", "tax", "gazdaságelemző"],
    "Vállalatirányítás és Menedzsment": ["üzleti", "business", "sales", "értékesítés", "tanácsadó", "b2b", "key account", "kereskedelem", "üzletfejlesztő", "menedzsment", "management", "projektmenedzser"],
    "Marketing, PR és Médiatudomány": ["marketing", "social media", "tartalom", "content", "seo", "ppc", "kampány", "pr ", "kommunikáció", "rendezvény", "média", "public relations"],
    "Emberi Erőforrás Menedzsment (HR)": ["hr ", "human resources", "személyügy", "toborz", "recruitment", "kiválasztás", "onboarding", "munkaügy", "szervezetfejlesztés"],
    "Logisztika és Ellátásilánc-menedzsment": ["logisztika", "logistics", "raktár", "szállítmányozás", "fuvarszervező", "supply chain", "ellátási lánc", "beszerzés", "procurement", "vám"],

    // --- MŰSZAKI TUDOMÁNYOK ÉS MÉRNÖKI KÉPZÉS ---
    "Gépészmérnöki és Mechatronikai Tudományok": ["gépész", "mechanical", "mechatronika", "cad", "tervezőmérnök"],
    "Villamosmérnöki és Elektronikai Tudományok": ["villamos", "electrical", "elektronika", "hardware"],
    "Építőmérnöki és Építészmérnöki Tudományok": ["építőmérnök", "civil engineer", "építész", "architecture", "kivitelező", "létesítmény", "facility"],
    "Vegyészmérnöki és Biomérnöki Tudományok": ["vegyész", "kémiaimérnök", "chemical", "biomérnök", "folyamatmérnök"],
    "Gyártástechnológia és Minőségbiztosítás": ["gyártás", "termelés", "operátor", "technikus", "művezető", "karbantartó", "minőség", "quality", "qa ", "minőségellenőr", "minőségbiztosítás"],

    // --- ORVOS- ÉS EGÉSZSÉGTUDOMÁNY ---
    "Orvos- és Egészségtudomány": ["orvos", "ápoló", "egészség", "klinika", "nővér", "terapeuta", "dietetikus", "mentő", "healthcare", "medikus"],
    "Gyógyszerésztudomány és Klinikai Kutatás": ["gyógyszerész", "pharma", "clinical", "törzskönyvező", "cra", "gyógyszeripar"],

    // --- TERMÉSZETTUDOMÁNY ÉS KUTATÁS ---
    "Természettudomány és Kutatás (K+F)": ["kutató", "labor", "biológus", "fizikus", "research", "r&d", "tudományos", "science"],
    "Agrártudomány és Környezetgazdálkodás": ["mezőgazdaság", "agrármérnök", "környezetvédelem", "erdészet", "fenntarthatóság", "agrárium", "ehs", "környezetmérnök", "agronómus"],

    // --- TÁRSADALOMTUDOMÁNY, JOG ÉS BÖLCSÉSZET ---
    "Állam- és Jogtudomány": ["jog", "legal", "ügyvéd", "szerződés", "jogász", "compliance", "bojtár", "jogtanácsos"],
    "Közigazgatás és Közszolgálat": ["közigazgatás", "referens", "hatóság", "közszolgálat", "önkormányzat", "tisztviselő", "ügyintéző"],
    "Társadalomtudomány és Nemzetközi Tanulmányok": ["pszichológ", "szociológ", "társadalom", "esélyegyenlőség", "nemzetközi", "international relations"],
    "Bölcsészettudomány és Pedagógia": ["tanár", "oktató", "pedagógus", "tréner", "docens", "tanító", "óvoda", "nevelő", "education", "fordító", "nyelv", "andragógia"],

    // --- MŰVÉSZET ÉS EGYÉB OPERATÍV TERÜLETEK ---
    "Művészet és Design": ["grafikus", "ux", "ui", "dizájn", "design", "kreatív", "videó", "fotó", "szerkesztő", "animátor", "művészet"],
    "Adminisztráció és Ügyfélszolgálati Operáció": ["adminisztráció", "asszisztens", "titkár", "recepció", "iroda", "office", "adminisztrátor", "ügyfélszolgálat", "customer", "helpdesk", "support", "call center"]
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