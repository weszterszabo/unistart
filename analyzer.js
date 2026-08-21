const crypto = require("crypto");

// ============================================================================
// 🧠 1. KOGNITÍV SZÓTÁRAK ÉS SZABÁLYOK (V37 NEURAL-ACCENT OMNIVERSE)
// ============================================================================

// 1.1 Címke szótár
const structuredTagsDict = {
    languages: ["angol", "német", "francia", "spanyol", "english", "german", "olasz", "orosz", "szlovák", "román", "holland", "italian", "french", "spanish", "dutch"],
    tech: ["excel", "python", "javascript", "typescript", "sql", "java", "react", "html", "css", "aws", "git", "power bi", "sap", "figma", "photoshop", "autocad", "c++", "c#", "node.js", "docker", "kubernetes", "jira", "linux", "azure", "salesforce", "tableau", "wordpress"],
    soft_skills: ["kommunikáci", "csapatmunka", "proaktív", "precíz", "problémamegoldó", "analitikus", "kreatív", "önálló", "terhelhető", "agilis", "prezentációs", "ügyfélorientált", "communication", "teamwork", "proactive", "precise", "analytical", "creative", "independent", "agile", "presentation", "flexibility"],
    work_setup: ["home office", "remote", "hibrid", "távmunka", "on-site", "rugalmas munkaidő", "flexible hours", "wfh", "hybrid"]
};

// 1.2 Tisztító szabályok (HTML és zaj eltávolítása)
const detoxRules = [
    { regex: /<[^>]*>?/gm, replacement: ' ' },
    { regex: /&nbsp;/gi, replacement: ' ' }
];

// ----------------------------------------------------------------------------
// 1.4 NLP KAPUŐR SZABÁLYOK (A MAGYAR ÉKEZET- ÉS RAGOZÁS-TŰRŐ MOTOR)
// ----------------------------------------------------------------------------

// 🔮 EGYEDI MAGYAR SZÓHATÁROK (A JavaScript \b hibájának javítása!)
const huBoundaryStart = "(?:^|[^a-zA-Z0-9_áéíóöőúüűÁÉÍÓÖŐÚÜŰ])";
const huBoundaryEnd = "(?=$|[^a-zA-Z0-9_áéíóöőúüűÁÉÍÓÖŐÚÜŰ])";

// 🔮 RAGOZÁS-TŰRŐ MODUL (Minden lehetséges ragot megfog a szavak végén)
const huSuffixes = "(?:k|t|i|ba|be|ra|re|on|en|ön|hoz|hez|höz|ban|ben|ból|ből|ról|ről|tól|től|nak|nek|val|vel|ért|ig|ként|kat|ket|okat|eket|öket|knak|knek|oknak|eknek|öknek|uk|ük|juk|jük|os|es|as|ös|s|es)?";

// ⛔ KIZÁRÓ (Vezető/Senior): Címben szerepelve azonnali elutasítás.
const seniorWords = "senior|szenior|snr|sr\\.|head of|director|igazgató|expert|architect|chief|principal|főosztályvezető|vezérigazgató|c-level|executive|vp|president|tapasztalt|experienced|advanced|master|professzionális|professional|seniority|felsővezető|igazgatóhelyettes|alapító|founder|co-founder|tulajdonos|owner|partner|sme|subject matter expert|dékán|rektor|főorvos|főmérnök|country manager|general manager|plant manager|üzletvezető|boltvezető|területi képviselő|managing director|board member|board of directors|staff engineer|principal engineer";
const compiledFatalSenior = new RegExp(huBoundaryStart + '(' + seniorWords + ')' + huSuffixes + huBoundaryEnd, 'i');

// ⛔ KIZÁRÓ (Kékgalléros/Fizikai): Kőkemény fizikai munka, amit eldobunk! (ZÉRÓ TOLERANCIA)
const physicalWords = "takarító|biztonsági őr|rakodó|sofőr|futár|pénztáros|árufeltöltő|targoncás|betanított|csomagoló|bolti eladó|villanyszerelő|hegesztő|lakatos|szakács|pincér|felszolgáló|pultos|kőműves|asztalos|festő|gépkocsivezető|gyári munkás|portás|vagyonőr|takarítónő|esztergályos|marós|vízszerelő|gázszerelő|bádogos|cleaner|security guard|loader|driver|courier|cashier|shelf stacker|forklift|packer|shop assistant|electrician|welder|locksmith|cook|chef|waiter|waitress|bartender|barista|mason|carpenter|painter|factory worker|janitor|plumber|maid|housekeeper|gondnok|caretaker|kamionsofőr|truck driver|delivery|postás|postman|sori munkás|segédmunkás|gyártósori|assembly|manual labor|laborer|mezőgazdasági|traktoros|állatgondozó|mészáros|hentes|ács|állványozó|tetőfedő|burkoló|gépszerelő|fényező|pék|cukrász|húsipari|varrónő|textilipari|nyomdász|anyagmozgató|konyhai|mosogató|udvaros|cnc|gépkezelő|gépüzemeltető|fémipari|faipari|production line|higiénia|higénia|higiéniai|higéniai|hygiene|tisztító|tisztítás|mosodai|komissiózó|áruösszekészítő|áru-összekészítő|raktári dolgozó";
const compiledFatalPhysical = new RegExp(huBoundaryStart + '(' + physicalWords + ')' + huSuffixes + huBoundaryEnd, 'i');

// ⚠️ GYANÚS (Fizikai/Technikai): Ezeket MEGMENTI a rendszer, ha a címben van szellemi felmentő szó (pl. Karbantartó Mérnök).
const dubiousWords = "fizikai|raktáros|raktári|operátor|szerelő|műszerész|karbantartó|gépbeállító|physical|warehouse|operator|mechanic|technician|maintenance|diszpécser|dispatcher|technikus|művezető|shift leader|műszakvezető|szerelés|technológus";
const compiledDubiousPhysical = new RegExp(huBoundaryStart + '(' + dubiousWords + ')' + huSuffixes + huBoundaryEnd, 'i');

// ✅ EXPLICIT JUNIOR (A Joker kártyák): Mindent felülírnak!
const juniorWords = "diák|diákmunka|gyakornok|gyakornoki|intern|internship|trainee|traineeship|co-op|pályakezdő|pályakezdőket|pályaindító|karrierstart|kezdő|junior|entry-level|entry level|frissdiplomás|friss diplomás|diplomás|student|apprentice|graduate|fresh graduate|tanuló|szövetkezet|iskolaszövetkezet|diákszövetkezet|undergrad|undergraduate|pályakezdőknek|hallgató|ösztöndíjas|scholar|mentee|melo-diak|mind-diak|eudiakok|working student|werkstudent|student worker|career starter|young professional|management trainee|graduate program|rotational program";
const compiledExplicitJunior = new RegExp(huBoundaryStart + '(' + juniorWords + ')' + huSuffixes + huBoundaryEnd, 'i');

// ✅ SZELLEMI MUNKÁK (A "Nagy Háló"): Bármelyik átmegy, ha nem Senior és nem kér 3+ évet kötelezően.
const whiteCollarWords = "asszisztens|adminisztrátor|referens|munkatárs|tanácsadó|szakértő|specialista|koordinátor|tervező|fejlesztő|mérnök|elemző|kutató|tanár|oktató|pedagógus|ügyintéző|képviselő|támogatás|ügyfélszolgálat|szerkesztő|író|könyvelő|kontroller|auditor|értékesítő|marketinges|hr|toborzó|programozó|orvos|ápoló|gyógyszerész|jogász|ügyvéd|építész|animátor|grafikus|készítő|felelős|ügyvédjelölt|oktatásszervező|menedzser|manager|assistant|administrator|clerk|representative|associate|advisor|consultant|specialist|coordinator|designer|developer|engineer|analyst|researcher|teacher|educator|instructor|tutor|agent|support|customer service|editor|writer|copywriter|accountant|controller|auditor|sales|marketing|recruiter|programmer|architect|animator|graphic|creator|officer|executive|planner|buyer|purchaser|strategist|scientist|lawyer|legal|counsel|személyügyi|pénzügyi|bookkeeper|paralegal|sourcer|talent acquisition|ux|ui|seo|ppc|vlogger|blogger|social media|pr|szóvivő|spokesperson|jogtanácsos|pszichológus|terapeuta|pharmacist|gépészmérnök|villamosmérnök|vegyészmérnök|mechatronikai|építőmérnök|építészmérnök|laboráns|data scientist|adatelemző|business analyst|üzleti elemző|financial analyst|kockázatelemző|underwriter|actuarial|aktuárius|újságíró|riporter|tudósító|tolmács|fordító|logisztikus|fuvarszervező|beszerző|journalist|reporter|translator|interpreter|logistician|lead|csoportvezető|osztályvezető|scrum master|product owner|agile coach|product manager|project manager|projektmenedzser|tesztelő|tester|qa|quality assurance|minőségbiztosítás|helpdesk|üzemeltető|sysadmin|rendszergazda|titkár|secretary|recepciós|receptionist|front office|back office|front-office|back-office|bankár|banker|teller|szervező|organizer|könyvtáros|librarian|modellező|modeler|statisztikus|statistician|ügyfélkapcsolati|térképész|urbanista|szociológus|múzeológus|kurátor|producer|rendező|operatőr|vágó|hangmérnök|világosító|stewardess|légiutaskísérő|meteorológus|geológus|biológus|vegyész|fizikus|matematikus|csillagász|régész|történész|filozófus|nyelvész|irodalmár|teológus|prompt engineer|ai engineer|data engineer|cloud engineer|devops|vámügyintéző|speditőr|vállalkozó|freelancer|bérszámfejtő|számlázó|vámszakértő|adatbázis|telemarketing|piackutató|biztosítás|hitelbíráló|data annotator|ai trainer|kárrendező|payroll|billing|claims|pricing|árazási|purchasing|supply chain|ellátási lánc|compliance|megfelelőségi|attorney|alkalmazott|sdr|bdr|sales development|key account|kam|customer success|ügyfélélmény|köztisztviselő|kormánytisztviselő|ügykezelő|business developer|sales support|sales operations|employer branding|content creator|rendszerszervező|network engineer|biztonsági elemző|clinical research|klinikai kutató|mlops|secops|biztonságtechnikai|hálózat|network administrator|systems engineer|growth hacker|demand generation|seo specialist|ppc specialist|motion designer|video editor|content manager";
const compiledWhiteCollarRoles = new RegExp(huBoundaryStart + '(' + whiteCollarWords + ')' + huSuffixes + huBoundaryEnd, 'i');

// ⛔ KIZÁRÓ (Tapasztalat Regex-ek): Globális (g) kapcsolóval!
const compiledExperienceReject = /(?<![0-2]\s*[-–]\s*)(?:min\.|minimum|legalább|at least|>|több mint|more than)?\s*(?:[3-9]|[1-9][0-9])(?:[\.,][0-9])?\s*(?:\+|or more|[-–]\s*[4-9])?\s*(?:év|éves|évet|year|years|yrs)\s*(?:of\s*)?(?:releváns\s*|szakmai\s*|igazolt\s*|vezetői\s*|munkatapasztalat\s*|igazolható\s*|relevant\s*|professional\s*|work\s*|hands-on\s*)?(?:tapasztalat|gyakorlat|experience|tapasztalattal)/gi;
const compiledExperienceRejectWords = /(?:több|számos|several|multiple|minimum|legalább|at least)\s*(?:éves|év|years of|years)\s*(?:szakmai\s*|releváns\s*|relevant\s*|professional\s*|work\s*)?(?:tapasztalat|gyakorlat|experience)/gi;

// ✅ NULLKILOMÉTERES FELÜLÍRÁS (Zero-Experience Bypass Regex)
const bypassExperienceRegex = /(?:tapasztalat nem elvárás|tapasztalat nem feltétel|tapasztalat nélkül|no experience required|without experience|no prior experience|fresh graduates welcome|pályakezdők jelentkezését|kezdők jelentkezését|előzetes tapasztalat nem|not required|0\s*év|0-tól|0\s*\-)/i;

// A kibővített "Előny" és "Nem kötelező" szótár
const niceToHaveKeywords = ["előny", "plusz", "nice to have", "nem elvárás", "nem feltétel", "plussz", "örülünk", "bónusz", "kiváló, ha", "ideális", "advantage", "plus", "preferred", "optional", "welcome", "beneficial", "asset", "szívesen látjuk", "desirable", "not required"];
const niceToHaveRegex = new RegExp(`(${niceToHaveKeywords.join('|')})`, 'i');

// ----------------------------------------------------------------------------
// 1.5 KATEGÓRIÁK ÉS VIBE-OK
// ----------------------------------------------------------------------------
const compiledCategories = {
    "💻 IT & Szoftverfejlesztés": /(fejlesztő|developer|programmer|it support|tesztelő|software|rendszergazda|informatikus|data engineer|devops|üzemeltető|frontend|backend|fullstack|qa|tester|scrum|agile)/i,
    "💼 Gazdasági & Üzleti": /(pénzügy|gazdaság|business|sales|marketing|hr|könyvelő|kontroller|értékesítő|emberi erőforrás|toborzó|beszerző|logisztika|projektmenedzser|közgazdász|finance|accounting|talent)/i,
    "⚙️ Mérnöki & Műszaki": /(mérnök|engineer|villamosmérnök|gépészmérnök|mechatronika|minőségbiztosítás|quality|lean|tervező|építész|CAD|műszaki|architect)/i,
    "📊 Elemző & Adattudomány": /(elemző|analyst|data scientist|adatelemző|business intelligence|riporter|statisztikus|kutató|research)/i,
    "🎨 Ügyfélszolgálat & Admin": /(adminisztrátor|ügyfélszolgálat|customer service|recepciós|asszisztens|támogatás|irodai|back office|helpdesk|assistant|clerk|secretary)/i,
    "📚 Oktatás & Tudomány": /(tanár|oktató|pedagógus|kutató|mentor|tréner|tudományos munkatárs|asszisztens tanár|education|laboráns|teacher|tutor)/i
};

const compiledAntiCategories = {
    "💻 IT & Szoftverfejlesztés": /(értékesítő|sales|takarító)/i
};

const compiledVibes = {
    "🚀 Innovatív / Startup": /(startup|innováció|agilis|scrum|modern|fejlődő|dinamikus|kreatív|innovative)/i,
    "📊 Elemző / Adatvezérelt": /(analitikus|adatvezérelt|precíz|statisztika|kutatás|big data|data-driven)/i,
    "🤝 Emberközpontú": /(támogató|csapatjátékos|emberközpontú|mentorálás|kellemes légkör|családias|friendly|team)/i,
    "🌍 Nemzetközi": /(multinacionális|nemzetközi|angol|külföldi|global|diverse|diverz|international)/i
};

const locationsDict = /(budapest|debrecen|szeged|miskolc|pécs|győr|nyíregyháza|kecskemét|székesfehérvár|szombathely|veszprém|zalaegerszeg|szolnok|tatabánya|sopron|érd|békéscsaba)/gi;

// ============================================================================
// 🚀 2. V37.0 NEURAL-ACCENT ENGINE (MÉLY-SZEMANTIKAI PARSER)
// ============================================================================

const compiledStructuredTags = {};
for (const [group, tags] of Object.entries(structuredTagsDict)) {
    compiledStructuredTags[group] = tags.map(tag => {
        const cleanedTag = tag.replace(/\|/g, '').replace(/\*/g, '').trim();
        const escapedTag = cleanedTag.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
        // Itt is lecseréljük a sima \b-t az okos magyar szóhatárra a tökéletes egyezésért!
        const baseRegex = new RegExp(huBoundaryStart + '(' + escapedTag + ')' + huBoundaryEnd, 'i');
        
        return {
            original: cleanedTag,
            regex: baseRegex,
            globalRegex: new RegExp(baseRegex.source, 'gi') 
        };
    });
}

const sanitizeText = (text) => text ? String(text).toLowerCase() : "";

class LRUCache {
    constructor(limit = 2000) {
        this.cache = new Map();
        this.limit = limit;
    }
    get(key) {
        if (!this.cache.has(key)) return null;
        const val = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, val);
        return val;
    }
    set(key, value) {
        if (this.cache.size >= this.limit) {
            this.cache.delete(this.cache.keys().next().value);
        }
        this.cache.set(key, value);
    }
}
const analysisCache = new LRUCache(2000);

function parseSalary(text) {
    const salaryRegex = /(?:(bruttó|br\.|nettó|net\.|gross|net)\s*)?(?:€|eur\s*)?(\d{1,3}(?:[\s\.]\d{3})*|\d{1,4}[kmM])(?:\s*-\s*(?:€|eur\s*)?(\d{1,3}(?:[\s\.]\d{3})*|\d{1,4}[kmM]))?\s*(ft|huf|eur|€|euro)?(?:\s*\/\s*(óra|hó|hónap|év|hour|month|year))?/i;
    const match = text.match(salaryRegex);
    if (!match) return null;

    const parseNum = (str) => {
        if (!str) return null;
        let numStr = str.replace(/[\s\.]/g, '').toLowerCase();
        if (numStr.endsWith('k')) return parseInt(numStr) * 1000;
        if (numStr.endsWith('m')) return parseInt(numStr) * 1000000;
        return parseInt(numStr, 10);
    };

    const minAmount = parseNum(match[2]);
    const maxAmount = parseNum(match[3]) || minAmount;
    const currency = (match[4] || "").toLowerCase().includes("eur") || (match[4] || "") === "€" || match[0].includes("€") ? "EUR" : "HUF";
    const periodStr = (match[5] || "").toLowerCase();
    
    let isHourly = periodStr.includes('óra') || periodStr.includes('hour');
    let isYearly = periodStr.includes('év') || periodStr.includes('year');
    if (!periodStr) {
        if (currency === "HUF" && minAmount < 10000) isHourly = true;
        if (currency === "HUF" && minAmount > 3000000) isYearly = true;
    }

    return {
        raw_text: match[0].replace(/\s+/g, ' ').trim(),
        min_amount: minAmount,
        max_amount: maxAmount,
        currency: currency,
        is_net: !!(match[1] && (match[1].startsWith('net') || match[1].toLowerCase() === 'net')),
        is_hourly: isHourly,
        is_yearly: isYearly
    };
}

function parseLanguageLevels(text) {
    const levels = {};
    const langRegex = /(angol|német|francia|spanyol|olasz|orosz|english|german|french|spanish|italian)[^\w]{0,35}(a1|a2|b1|b2|c1|c2|alapfok|középfok|felsőfok|társalgási|tárgyalási|tárgyalóképes|folyékony|anyanyelvi|fluent|native|intermediate|advanced)/gi;
    let match;
    while ((match = langRegex.exec(text)) !== null) {
        let lang = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        let level = match[2].toUpperCase();
        
        if (lang === "English") lang = "Angol";
        if (lang === "German") lang = "Német";
        if (lang === "French") lang = "Francia";
        if (lang === "Spanish") lang = "Spanyol";
        if (lang === "Italian") lang = "Olasz";

        if (level.includes("KÖZÉP") || level.includes("TÁRSALGÁS") || level.includes("INTERMEDIATE")) level = "B2";
        else if (level.includes("FELSŐ") || level.includes("TÁRGYALÁSI") || level.includes("TÁRGYALÓ") || level.includes("FOLYÉKONY") || level.includes("FLUENT") || level.includes("ADVANCED")) level = "C1";
        else if (level.includes("ALAP")) level = "A2/B1";
        else if (level.includes("ANYANYELV") || level.includes("NATIVE")) level = "C2";

        levels[lang] = levels[lang] > level ? levels[lang] : level; 
    }
    return Object.keys(levels).length > 0 ? levels : null;
}

function extractHomeOfficeRatio(text) {
    const hoRegex = /(?:heti|weekly)\s*(\d)\s*(?:nap|napot|days?)?\s*(home office|ho|távmunka|wfh)/i;
    const match = text.match(hoRegex);
    if (match && parseInt(match[1]) <= 5) {
        const days = parseInt(match[1]);
        return `Hibrid (${days} nap HO)`;
    }
    return null;
}

// ============================================================================
// 🚀 FŐ ELEMZŐ FÜGGVÉNY EXPORTÁLÁSA
// ============================================================================
exports.analyzeJob = function(title, description = "") {
    
    // --- CACHE ELLENŐRZÉS (O(1) sebesség) ---
    const cacheKey = crypto.createHash('md5').update(`${sanitizeText(title)}||${description ? description.length : 0}`).digest('hex');
    const cachedResult = analysisCache.get(cacheKey);
    if (cachedResult) return cachedResult;

    // 🧹 SZÖVEG ELŐKÉSZÍTÉSE ÉS TISZTÍTÁSA
    let safeTitle = sanitizeText(title);
    for (const rule of detoxRules) safeTitle = safeTitle.replace(rule.regex, rule.replacement);
    const cleanTitle = safeTitle.replace(/\([^()]*\)/g, '').replace(/\[[^\[\]]*\]/g, '').trim();

    let safeDesc = sanitizeText(description);
    for (const rule of detoxRules) safeDesc = safeDesc.replace(rule.regex, rule.replacement);
    let fullText = `${safeTitle} \n ${safeDesc}`;

    // 🛡️ 1. FÁZIS: NEURAL-ACCENT EARLY-EXIT LOGIKA (A Nagy Kapuőr)
    const isExplicitJuniorTitle = compiledExplicitJunior.test(cleanTitle);
    const isExplicitJuniorText = compiledExplicitJunior.test(fullText);
    const isExplicitJunior = isExplicitJuniorTitle || isExplicitJuniorText;
    const isWhiteCollar = compiledWhiteCollarRoles.test(fullText) || compiledWhiteCollarRoles.test(safeTitle);
    
    // Zseniális 360 Fokos Tapasztalat-Szűrés (Dinamikus Illúzió és Spektrum Logikával)
    let isTooSenior = false;
    
    // ABSZOLÚT FELÜLÍRÁS: Ha a szöveg expliciten kiírja, hogy pályakezdőket várnak
    if (!bypassExperienceRegex.test(fullText)) {
        const expMatches = [...fullText.matchAll(compiledExperienceReject), ...fullText.matchAll(compiledExperienceRejectWords)];
        
        for (const match of expMatches) {
            // Ablak az elemzéshez: 100 karakter előre, 100 karakter hátra
            const startIdx = Math.max(0, match.index - 100);
            const endIdx = Math.min(fullText.length, match.index + match[0].length + 100);
            const contextWindow = fullText.substring(startIdx, endIdx);

            const contextBefore = fullText.substring(Math.max(0, match.index - 70), match.index);
            const contextAfter = fullText.substring(match.index + match[0].length, Math.min(fullText.length, match.index + match[0].length + 60));
            
            // KIVÉTEL 1: Tartomány vizsgáló VAGY "maximum/kevesebb" jelzők
            if (/(?:0|1|2|1[,.]5|2[,.]5|egy|két|kettő|fél|max\b|max\.|maximum|legfeljebb|akár|up to|kevesebb|less than|<)\s*(?:[-–]|\s|ig\b|to\b)?\s*$/i.test(contextBefore)) {
                continue; // Mentesítve!
            }
            
            // KIVÉTEL 2: "Céges Tapasztalat" illúzió szűrő (Ha a cég a saját múltjáról beszél!)
            if (/(?:cégünk|vállalatunk|csapatunk|irodánk|múltunk|our company|our team|we have|founded|működő|piacon|market)\b/i.test(contextBefore)) {
                continue; // Mentesítve! A cég dicséri magát.
            }

            // KIVÉTEL 3: "3 év alatt / kevesebb mint" kontextus a szám után
            if (/^\s*(?:alatt|under|below|kevesebb|or less|maximum|max)\b/i.test(contextAfter)) {
                continue; // Mentesítve!
            }

            // KIVÉTEL 4: Egyetemistára/hallgatóra utal
            if (/(?:hallgató|tanuló|student|egyetemista|semester|félév|évfolyam|osztály)/i.test(contextWindow)) {
                continue; // Mentesítve!
            }

            // KIVÉTEL 5: Előny/Bónusz kontextus (nice-to-have)
            if (niceToHaveRegex.test(contextWindow)) {
                continue; // Mentesítve!
            }
            
            // Ha egyetlen mentesítő szabály sem érvényesült, ez egy Senior állás!
            isTooSenior = true;
            break; 
        }
    }

    // Kuka 1: Senior. DE ha a CÍMBEN benne van a Joker (Diák/Gyakornok), megmentjük!
    if (compiledFatalSenior.test(cleanTitle) && !isExplicitJuniorTitle) return null;

    // Kuka 2: Ha a címben kőkemény fizikai munka van (DE ha a CÍMBEN explicit "Diákmunka" van, megmentjük!)
    // Mostantól a higiéniai munkatárs, gépkezelő stb. GARANTÁLTAN kiesik!
    if (compiledFatalPhysical.test(cleanTitle) && !isExplicitJuniorTitle) return null;

    // Kuka 3: Ha gyanús fizikai. DE ha mellette ott van a szellemi háló VAGY explicit diák, megmentjük!
    if (compiledDubiousPhysical.test(cleanTitle) && !isExplicitJunior && !compiledWhiteCollarRoles.test(cleanTitle)) {
        return null;
    }

    // Kuka 4: Tapasztalat szűrés. Ha 3+ évet kér kötelezően, DE a cím alapján egyértelműen gyakornok/diák, megkegyelmezünk.
    if (isTooSenior && !isExplicitJuniorTitle) {
        return null;
    }

    // Kuka 5: A végső háló. Ha NEM explicit Junior/Diák, ÉS még csak nem is ismert szellemi munka, akkor eldobjuk.
    if (!isExplicitJunior && !isWhiteCollar) {
        return null; 
    }

    // 📊 2. FÁZIS: SÚLYOZOTT PONTOZÁS (TF-IDF Logika a kategóriákhoz)
    const leadDesc = safeDesc.substring(0, 300); 
    const bodyDesc = safeDesc.substring(300);
    
    let maxScore = 0;
    let assignedCategory = "🔍 Egyéb / Általános";

    for (const [catName, regex] of Object.entries(compiledCategories)) {
        let score = (cleanTitle.match(regex) || []).length * 20;
        score += (leadDesc.match(regex) || []).length * 5;
        score += (bodyDesc.match(regex) || []).length * 1;
        if (compiledAntiCategories[catName]) score -= (fullText.match(compiledAntiCategories[catName]) || []).length * 50;
        if (score > maxScore) { maxScore = score; assignedCategory = catName; }
    }

    let vibeScores = [];
    for (const [vibeName, regex] of Object.entries(compiledVibes)) {
        const matches = (fullText.match(regex) || []).length;
        if (matches > 0) vibeScores.push({ name: vibeName, score: matches });
    }
    vibeScores.sort((a, b) => b.score - a.score);
    let assignedVibe = vibeScores.length > 0 ? vibeScores[0].name : "⚖️ Kiegyensúlyozott";

    // 🎯 3. FÁZIS: MÉLYFÚRÁS ÉS KÖRÜLMÉNYEK
    const isMandatoryInternship = /kötelező (szakmai )?gyakorlat|gyakorlat( le)?igazolás|mandatory internship/i.test(fullText);
    const requiresActiveStudent = /aktív( nappali)? (hallgatói )?jogviszony|nappali tagozat|active student/i.test(fullText);
    
    let extractedHours = "Rugalmas";
    const hoursMatch = fullText.match(/(?:heti|min\.|legalább)?\s*(\d{1,2})\s*(?:óra|órás|órát|órában|hours?)/i);
    if (hoursMatch && parseInt(hoursMatch[1]) >= 10 && parseInt(hoursMatch[1]) <= 40) extractedHours = parseInt(hoursMatch[1]);

    const parsedSalary = parseSalary(fullText);
    const parsedLanguageLevels = parseLanguageLevels(fullText);
    const hoRatio = extractHomeOfficeRatio(fullText);
    
    // Kiterjesztett végzettség azonosítás
    const degreeMatch = fullText.match(/\b(bsc|msc|ba|ma|bachelor|master|alapképzés|mesterképzés|érettségi|okj|technikum|phd)\b/i);
    let requiredDegree = null;
    if (degreeMatch) {
        requiredDegree = degreeMatch[1].toUpperCase()
            .replace("BACHELOR", "BSC").replace("ALAPKÉPZÉS", "BSC")
            .replace("MASTER", "MSC").replace("MESTERKÉPZÉS", "MSC")
            .replace("ÉRETTSÉGI", "Érettségi").replace("TECHNIKUM", "OKJ/Technikum").replace("OKJ", "OKJ/Technikum");
    }

    let foundLocations = [...new Set((fullText.match(locationsDict) || []).map(l => l.charAt(0).toUpperCase() + l.slice(1)))];
    
    // Munka Jellege Finomítás
    let jobNature = "Pályakezdő (Teljes munkaidő)";
    if (/\b(diák|diákmunka|iskolaszövetkezet|student|working student|werkstudent)\b/i.test(fullText) || requiresActiveStudent) jobNature = "Diákmunka";
    else if (/\b(gyakornok|intern|internship|trainee)\b/i.test(fullText) || isMandatoryInternship) jobNature = "Gyakornok";
    else if (/\b(részmunkaidő|part-time|part time|4 órás|6 órás)\b/i.test(fullText)) jobNature = "Pályakezdő (Részmunkaidő)";

    // 🧬 4. FÁZIS: O(1) KONTEXTUS-TUDATOS CÍMKÉZÉS
    let extractedTags = { tech: [], languages: [], soft_skills: [], work_setup: [] };
    let niceToHaveTags = [];
    let allFlatTags = []; 

    for (const [group, tagObjects] of Object.entries(compiledStructuredTags)) {
        let groupTags = [];
        for (const tagObj of tagObjects) {
            let match;
            let matchCount = 0;
            let isNiceToHave = false;
            tagObj.globalRegex.lastIndex = 0; 

            while ((match = tagObj.globalRegex.exec(fullText)) !== null) {
                matchCount++;
                let start = Math.max(0, match.index - 50);
                let end = Math.min(fullText.length, match.index + 50);
                if (niceToHaveRegex.test(fullText.substring(start, end))) isNiceToHave = true;
            }

            if (matchCount > 0) {
                const formattedTag = tagObj.original.charAt(0).toUpperCase() + tagObj.original.slice(1);
                if (isNiceToHave) niceToHaveTags.push(formattedTag);
                else groupTags.push({ tag: formattedTag, count: matchCount });
            }
        }
        groupTags.sort((a, b) => b.count - a.count);
        extractedTags[group] = groupTags.map(t => t.tag);
        allFlatTags.push(...extractedTags[group]);
    }
    
    // HO Arány betöltése a címkék közé
    if (hoRatio && extractedTags.work_setup.includes("Home office")) {
        extractedTags.work_setup = extractedTags.work_setup.filter(t => t !== "Home office");
        extractedTags.work_setup.push(hoRatio);
        allFlatTags = allFlatTags.filter(t => t !== "Home office");
        allFlatTags.push(hoRatio);
    }

    niceToHaveTags = [...new Set(niceToHaveTags)].filter(tag => !allFlatTags.includes(tag));

    // 🚀 5. FÁZIS: VÉGLEGES ADATSTRUKTÚRA ÖSSZEÁLLÍTÁSA ÉS CACHELÉSE
    const finalPayload = {
        metadata: {
            is_valid_entry_level: true,
            faculty: assignedCategory,
            job_nature: jobNature,
            work_style: assignedVibe,
            required_degree: requiredDegree
        },
        student_details: {
            requires_active_student: requiresActiveStudent,
            accepts_mandatory_internship: isMandatoryInternship,
            weekly_hours_int: extractedHours !== "Rugalmas" ? extractedHours : null,
        },
        financials: parsedSalary,
        languages_with_levels: parsedLanguageLevels,
        locations: foundLocations,
        tags: {
            required: extractedTags,
            nice_to_have: niceToHaveTags
        },
        airtable_ready: { 
            faculty: assignedCategory,
            job_nature: jobNature,
            degree: requiredDegree,
            weekly_hours: extractedHours !== "Rugalmas" ? extractedHours : null,
            salary_min: parsedSalary?.min_amount || null,
            salary_max: parsedSalary?.max_amount || null,
            salary_currency: parsedSalary?.currency || null,
            is_hourly_wage: parsedSalary?.is_hourly || null,
            required_tags: allFlatTags,
            bonus_tags: niceToHaveTags
        }
    };

    analysisCache.set(cacheKey, finalPayload);
    return finalPayload;
};