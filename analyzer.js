// ============================================================================
// 1. A KAPUŐR (Pozitív és Negatív szótár)
// ============================================================================
const rejectWords = [
    "senior", "szenior", "vezető", "manager", "igazgató", "head of", "lead", 
    "tapasztalt", "expert", "medior", "principal", "supervisor", "co-ordinator",
    "3 év", "5 év", "3+ év", "5+ év", "min. 2 év", "legalább 2 év", "több éves tapasztalat"
];

const acceptWords = [
    "gyakornok", "intern", "trainee", "diákmunka", "diák", "student", 
    "pályakezdő", "junior", "frissdiplomás", "fresh graduate", "entry level", 
    "0 év", "1 év", "hallgatói jogviszony", "részmunkaidő", "diákszövetkezet"
];

// ============================================================================
// 2. KÉPZÉSI TERÜLETEK (Főkategóriák)
// ============================================================================
const categories = {
    "💻 IT & Fejlesztés": ["fejlesztő", "developer", "szoftver", "software", "it ", "üzemeltető", "devops", "tesztelő", "frontend", "backend", "rendszergazda", "programozó", "cyber", "security"],
    "💼 Gazdasági & Üzleti": ["pénzügy", "finance", "számvitel", "accounting", "könyvelő", "audit", "kontroller", "controller", "üzleti", "business", "sales", "értékesítés", "tanácsadó"],
    "⚙️ Mérnöki & Műszaki": ["mérnök", "engineer", "gépész", "villamos", "mechatronika", "minőségügy", "quality", "karbantartó", "építő", "gyártás", "termelés", "üzemmérnök"],
    "🤝 HR & Toborzás": ["hr ", "toborz", "recruitment", "human resources", "személyügy", "kiválasztás", "onboarding"],
    "⚖️ Jogi & Államigazgatás": ["jog", "legal", "ügyvéd", "compliance", "közigazgatás", "referens", "hatóság", "szerződés", "közszolgálat"],
    "📣 Marketing & PR": ["marketing", "kommunikáció", "pr ", "social media", "tartalom", "content", "rendezvény", "event", "grafikus", "design", "copywriter"],
    "📦 Logisztika & Beszerzés": ["logisztika", "logistics", "beszerzés", "procurement", "raktár", "supply chain", "szállítmányozás", "fuvarszervező"],
    "🧠 Társadalom & Bölcsész": ["oktatás", "kutatás", "pszichológia", "fordító", "szerkesztő", "újságíró", "szociológia", "ügyfélszolgálat", "nyelv"]
};

// ============================================================================
// 3. MUNKASTÍLUS (A "Vibe-Check")
// ============================================================================
const vibes = {
    "🗣️ Emberközpontú": ["kapcsolattartás", "ügyfél", "csapatmunka", "kommunikáció", "prezentáció", "customer", "ügyfélszolgálat", "támogatás", "support", "interjú"],
    "📊 Elemző / Adatvezérelt": ["elemzés", "riport", "statisztika", "kutatás", "adat", "data", "optimalizálás", "analytics", "reporting", "kimutatás"],
    "🔍 Precíz / Szabálykövető": ["ellenőrzés", "adminisztráció", "dokumentáció", "precíz", "pontos", "jogszabály", "szerződés", "nyilvántartás", "compliance", "iktatás"],
    "📝 Kreatív / Alkotó": ["kreatív", "tervezés", "ötletelés", "design", "grafika", "cikk", "tartalomgyártás", "videó", "kreativitás"],
    "🏃‍♂️ Pörgős / Terepmunka": ["terepmunka", "utazás", "rendezvény", "rugalmas", "dinamikus", "helyszíni", "gyártósor", "raktár", "változatos"]
};

// ============================================================================
// 4. MIKRO-CÍMKÉK (Hard skillek és eszközök)
// ============================================================================
const microTagsDict = ["angol", "english", "német", "german", "excel", "python", "sql", "autocad", "java ", "javascript", "c++", "sap", "home office", "remote", "hibrid"];

// FŐ FÜGGVÉNY: Ezt hívják meg a scraper motorok
exports.analyzeJob = function(title, description = "") {
    // Egyesítjük a címet és a leírást, és kisbetűssé alakítjuk a könnyebb kereséshez
    const textToSearch = `${title} ${description}`.toLowerCase();
    
    // --- 1. KAPUŐR LOGIKA ---
    let isTooSenior = false;
    let isEntryLevel = false;

    // Megnézzük, van-e benne KIZÁRÓ (senior) szó
    for (const word of rejectWords) {
        if (textToSearch.includes(word)) {
            isTooSenior = true;
            break;
        }
    }

    // Megnézzük, van-e benne BEENGEDŐ (junior/gyakornok) szó
    if (!isTooSenior) {
        for (const word of acceptWords) {
            if (textToSearch.includes(word)) {
                isEntryLevel = true;
                break;
            }
        }
    }

    // DÖNTÉS: Ha senior, VAGY ha egyáltalán nem egyértelműen pályakezdő -> ELDOBJUK!
    if (isTooSenior || !isEntryLevel) {
        return null; // Ez a "null" fogja megmondani a scrapernek, hogy felejtse el ezt az állást.
    }

    // --- 2. KATEGORIZÁLÁS (Képzési terület) ---
    let assignedCategory = "🔍 Egyéb / Általános"; // Alapértelmezett, ha nem talál mást
    for (const [catName, keywords] of Object.entries(categories)) {
        for (const keyword of keywords) {
            if (textToSearch.includes(keyword)) {
                assignedCategory = catName;
                break; // Megtaláltuk a kategóriát, kilépünk a belső ciklusból
            }
        }
        if (assignedCategory !== "🔍 Egyéb / Általános") break; // Kilépünk a külső ciklusból is
    }

    // --- 3. MUNKASTÍLUS (Vibe-check) ---
    // Itt akár több Vibe-ot is összeszedhetünk, de most kiválasztjuk a legjellemzőbbet (az első találatot)
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

    // --- 4. MIKRO-CÍMKÉK ---
    let foundTags = [];
    for (const tag of microTagsDict) {
        if (textToSearch.includes(tag)) {
            // Szép formázás (pl: "excel" -> "#Excel")
            foundTags.push("#" + tag.trim().charAt(0).toUpperCase() + tag.trim().slice(1));
        }
    }
    
    // Külön munkaidő jelleg a CÍM alapján
    let jobNature = "Pályakezdő (Teljes munkaidő)";
    if (title.toLowerCase().includes("gyakornok") || title.toLowerCase().includes("intern") || title.toLowerCase().includes("diák")) {
        jobNature = "Gyakornok / Részmunkaidő";
    }

    // --- VISSZATÉRÉS AZ EREDMÉNNYEL ---
    return {
        is_junior: true,
        job_nature: jobNature,
        faculty: assignedCategory,
        work_style: assignedVibe,
        tags: foundTags
    };
};