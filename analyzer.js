const crypto = require("crypto");
const { performance } = require("perf_hooks"); 

// ============================================================================
// 🧠 1. KOGNITÍV SZÓTÁRAK (V51.0 AHO-CORASICK CORE)
// ============================================================================

const structuredTagsDict = {
    languages: ["angol", "német", "francia", "spanyol", "english", "german", "olasz", "orosz", "szlovák", "román", "holland", "italian", "french", "spanish", "dutch", "lengyel", "polish", "cseh", "czech", "ukrán", "ukrainian", "kínai", "chinese"],
    tech: ["excel", "python", "javascript", "typescript", "sql", "java", "react", "html", "css", "aws", "git", "power bi", "sap", "figma", "photoshop", "autocad", "c++", "c#", "node.js", "docker", "kubernetes", "jira", "linux", "azure", "salesforce", "tableau", "wordpress", "angular", "vue", "django", "spring boot", "php", "laravel", "golang", "rust", "ruby", "swift", "kotlin", "bash", "powershell", "mongodb", "postgresql", "mysql", "redis", "elasticsearch", "terraform", "ansible", "jenkins", "confluence", "trello", "asana", "illustrator", "indesign", "premiere pro", "after effects", "solidworks", "revit", "archicad", "matlab", "spss", "r", "hadoop", "spark", "kafka", "snowflake", "dax", "vba", "google analytics", "seo", "sem", "hubspot", "mailchimp", "oracle"],
    soft_skills: ["kommunikáci", "csapatmunka", "proaktív", "precíz", "problémamegoldó", "analitikus", "kreatív", "önálló", "terhelhető", "agilis", "prezentációs", "ügyfélorientált", "communication", "teamwork", "proactive", "precise", "analytical", "creative", "independent", "agile", "presentation", "flexibility", "empatikus", "empathy", "vezetési", "leadership", "time management", "időgazdálkodás", "konfliktuskezelés", "conflict resolution", "tárgyalástechnika", "negotiation", "kritikus gondolkodás", "critical thinking", "alkalmazkodókészség", "adaptability", "részletorientált", "detail-oriented", "megbízható", "reliable"],
    work_setup: ["home office", "remote", "hibrid", "távmunka", "on-site", "rugalmas munkaidő", "flexible hours", "wfh", "hybrid", "törzsmunkaidő", "core hours", "irodai", "office-based"],
    benefits: ["cafeteria", "bónusz", "bonus", "aycm", "all you can move", "medicover", "magánegészségügy", "laptop", "céges telefon", "céges autó", "company car", "utazástámogatás", "bejárás támogatás", "szép kártya", "szép-kártya", "angol oktatás", "nyelvtanfolyam", "language course", "training", "képzés", "továbbképzés", "részvény", "stock options", "esop", "rsu", "gyümölcsnap", "fruit day", "csapatépítő", "teambuilding", "kutyabarát", "dog-friendly", "parkoló", "parking"]
};

const typoToleranceDict = {
    "javascript": ["javascipt", "js", "java script"],
    "python": ["phyton", "pyton", "py"],
    "excel": ["excell", "exel", "ms excel"],
    "power bi": ["powerbi", "pbi", "power-bi"],
    "wordpress": ["wordpres", "wordpressz", "wp"],
    "node.js": ["nodejs", "node js", "node"],
    "c++": ["cpp", "c/c++"],
    "c#": ["c-sharp", "c sharp"]
};

const urgencyDict = {
    "Azonnali kezdés": /\b(azonnali kezdés|asap|sürgős|azonnal keresünk|immediate start|azonnali belépés)\b/i,
    "Hétvégi munkavégzés": /\b(hétvégi munkavégzés|hétvégén is|szombati|vasárnapi|hétvégén végezhető)\b/i,
    "Órarendhez igazodó": /\b(órarendhez igazodó|rugalmas beosztás|te osztod be|tanulmányok mellett|iskola mellett)\b/i
};

const redFlagDict = {
    "Rejtett bér": /(versenyképes fizetés|bérezés megegyezés szerint|vonzó juttatási csomag|versenyképes jövedelem)/i,
    "Túlterheltség gyanú": /(jól bírja a stresszt|stressztűrő|terhelhető|pörgős környezet|work hard play hard|rugalmasság elvárt|túlóra)/i,
    "Toxikus pozitivitás": /(családias légkör|családias csapat|mi egy nagy család vagyunk|dinamikusan fejlődő)/i,
    "Mindenes/Kihasználás": /(talpraesett|jég hátán is megél|mindenes|ninja|rockstar|guru|unicorn)/i
};

const scamDict = {
    "MLM / Piramisjáték": /\b(nem mlm|piramis|hálózatépítés|építsd fel a saját csapatod|passzív jövedelem|csatlakozási díj|regisztrációs díj|üzleti partner)\b/i,
    "Gyanús ügynöki munka": /\b(legyél a saját magad főnöke|korlátlan kereseti lehetőség|nincs alapbér|jutalékos rendszer|befektetési tanácsadó|kizárólag jutalék)\b/i
};

const certificationsDict = /\b(istqb|itil|pmp|scrum master|csm|psm|aws certified|azure fundamentals|cisco|ccna|ccnp|comptia|ceh|cissp|telc|ecl|euroexam|ielts|toefl|cambridge)\b/gi;
const corporateBSDict = /\b(szinergia|paradigmaváltás|out of the box|think outside the box|agilis transzformáció|game changer|disruptív|ninja|rockstar|guru|unicorn|dna|vízió|mission-critical|leverage|empower)\b/gi;

const onboardingDict = {
    "Strukturált Betanítás": /\b(betanítási terv|onboarding program|onboarding folyamat|structured onboarding|training period|betanulás)\b/i,
    "Dedikált Mentor": /\b(dedikált mentor|saját mentor|mentorálás|buddy program|shadowing|árnyékmunka|tapasztalt kolléga támogatásával)\b/i
};

const hiddenReqsDict = {
    "B kategóriás jogosítvány": /\b(b kategóriás jogosítvány|b kat\. jogosítvány|b kategória|jogosítvány|vezetői engedély|b-category driving license|driving license)\b/i,
    "Saját eszköz (BYOD)": /\b(saját laptop|saját számítógép|saját gép|byod|bring your own device|saját okostelefon)\b/i,
    "Utazási hajlandóság": /\b(utazási hajlandóság|hajlandóság utazásra|travel required|willingness to travel|kiküldetés)\b/i,
    "Folyamatos/Több műszak": /\b(több műszak|folyamatos műszak|éjszakai műszak|hétvégi munkavégzés|shift work|2 műszak|3 műszak)\b/i,
    "Erkölcsi bizonyítvány": /\b(erkölcsi bizonyítvány|tiszta erkölcsi|criminal record check|background check)\b/i
};

const appFrictionDict = {
    "Motivációs levél": /\b(motivációs levél|cover letter|kísérőlevél)\b/i,
    "Idegennyelvű CV": /\b(angol nyelvű önéletrajz|angol cv|english cv|english resume|német nyelvű önéletrajz)\b/i,
    "Portfólió / Referencia": /\b(portfólió|portfolio|github link|referencia munka|korábbi munkák|behance)\b/i,
    "Videós bemutatkozás": /\b(videós bemutatkozó|video intro|videóinterjú|video interview)\b/i
};

const careerPathDict = {
    "Hosszútávú lehetőség": /\b(hosszútávú|hosszú távú lehetőség|long-term opportunity|később főállás|főállású lehetőség|állandó pozíció)\b/i,
    "Karrierút / Előléptetés": /\b(előrelépési lehetőség|karrierút|career path|career progression|fejlődési lehetőség|promotion)\b/i
};

const transitDict = {
    "Könnyen megközelíthető": /\b(könnyen megközelíthető|jól megközelíthető|tömegközlekedéssel|kiváló közlekedés|easy to reach)\b/i,
    "Központi / Belváros": /\b(belváros|központi helyen|metróhoz közel|metróvonal|city center|downtown)\b/i,
    "Ingyenes parkolás": /\b(ingyenes parkolás|saját parkoló|free parking|cég busz|céges buszjárat)\b/i
};

const interviewDict = {
    "1 körös interjú (Gyors)": /\b(1 körös interjú|egy körös interjú|one-round interview|egyetlen interjú|gyors kiválasztás)\b/i,
    "Többkörös interjú": /\b(több körös interjú|többkörös|multi-round interview|2 körös|3 körös|második kör)\b/i,
    "Próbafeladat / Teszt": /\b(próbafeladat|tesztírás|szakmai teszt|home assignment|coding task|esettanulmány|case study)\b/i,
    "Assessment Center": /\b(assessment center|ac|kiválasztási nap|értékelő központ)\b/i
};

const equipmentDict = {
    "Apple Eszköz (Mac/iPhone)": /\b(macbook|céges mac|iphone|apple eszköz|imac)\b/i,
    "Céges Laptop (Általános)": /\b(céges laptop|vállalati laptop|company laptop|munkaállomás)\b/i,
    "Céges Telefon": /\b(céges telefon|vállalati mobil|company phone)\b/i
};

const relocationDict = {
    "Relokációs támogatás": /\b(relocation support|relokációs támogatás|költözési támogatás|relocation package)\b/i,
    "Vízum / Engedély támogatás": /\b(visa sponsorship|munkavállalási engedély|visa support|munkavállalási vízum)\b/i
};

const toneDict = {
    "Corporate / Formális": /\b(multinacionális|szabályozott|folyamatközpontú|korporatív|vállalati|hierarchia|corporate|compliance|szabályzat|standard|global leader)\b/i,
    "Laza / Fiatalos": /\b(csocsó|sör|kutyabarát|laza|fiatalos|nincs dress code|pizza|startup|gaming|csapatépítő|kávé|xbox)\b/i,
    "Teljesítményorientált": /\b(jutalék|kpi|célkitűzés|teljesítménybér|target|bónuszrendszer|eredményorientált|versenyképes|jutalmazási|sales target)\b/i
};

const diversityDict = /\b(esélyegyenlőség|equal opportunity|sokszínűség|diversity|inclusive|inkluzív|akadálymentes|megváltozott munkaképességű|női vezetők|women in tech|lgbtq|büszkeség)\b/i;

const detoxRules = [
    { regex: /<[^>]*>?/gm, replacement: ' ' },
    { regex: /&nbsp;/gi, replacement: ' ' },
    { regex: /\r\n|\n|\r/g, replacement: ' \n ' } 
];

const huBoundaryStart = "(?:^|[^a-zA-Z0-9_áéíóöőúüűÁÉÍÓÖŐÚÜŰ])";
const huBoundaryEnd = "(?=$|[^a-zA-Z0-9_áéíóöőúüűÁÉÍÓÖŐÚÜŰ])";
const huSuffixes = "(?:k|t|i|ba|be|ra|re|on|en|ön|hoz|hez|höz|ban|ben|ból|ből|ról|ről|tól|től|nak|nek|val|vel|ért|ig|ként|kat|ket|okat|eket|öket|knak|knek|oknak|eknek|öknek|uk|ük|juk|jük|os|es|as|ös|s|es)?";

// 🔥 BŐVÍTETT SZÓTÁRAK INNENTŐL LEFELÉ 🔥

// Hozzáadva: medior, mid-level, csapatvezető, team lead, tech lead, osztályvezető, vezető ápoló, manager, supervisor, lead, főállatorvos
const seniorWords = "senior|szenior|snr|sr\\.|medior|mid-level|mid level|mid\\b|head of|director|igazgató|expert|architect|chief|principal|főosztályvezető|osztályvezető|csapatvezető|team lead|tech lead|vezérigazgató|c-level|executive|vp|president|tapasztalt|experienced|advanced|master|professzionális|professional|seniority|felsővezető|igazgatóhelyettes|alapító|founder|co-founder|tulajdonos|owner|partner|sme|subject matter expert|dékán|rektor|főorvos|főállatorvos|vezető ápoló|főmérnök|country manager|general manager|plant manager|üzletvezető|boltvezető|területi képviselő|managing director|board member|board of directors|staff engineer|principal engineer|manager\\b|supervisor|lead\\b";
const compiledFatalSenior = new RegExp(huBoundaryStart + '(' + seniorWords + ')' + huSuffixes + huBoundaryEnd, 'i');

// Hozzáadva: bolti dolgozó, összekészítő, szárazáru, hűtőraktári, göngyölegraktári, áruösszekészítő, és az összes orvosi/kórházi szakma
const physicalWords = "bolti dolgozó|összekészítő|szárazáru|hűtőraktári|göngyölegraktári|göngyöleg|áruösszekészítő|ápoló|ápolónő|szakápoló|gondozó|orvosírnok|orvos|rezidens|szakorvos|mentőtiszt|terapeuta|védőnő|szülésznő|kardiológiai|angiológiai|sebkezelő|dializáló|csecsemő|kórházi|műtős|takarító|biztonsági őr|rakodó|sofőr|futár|pénztáros|árufeltöltő|targoncás|betanított|csomagoló|bolti eladó|villanyszerelő|hegesztő|lakatos|szakács|pincér|felszolgáló|pultos|kőműves|asztalos|festő|gépkocsivezető|gyári munkás|portás|vagyonőr|takarítónő|esztergályos|marós|vízszerelő|gázszerelő|bádogos|cleaner|security guard|loader|driver|courier|cashier|shelf stacker|forklift|packer|shop assistant|electrician|welder|locksmith|cook|chef|waiter|waitress|bartender|barista|mason|carpenter|painter|factory worker|janitor|plumber|maid|housekeeper|gondnok|caretaker|kamionsofőr|truck driver|delivery|postás|postman|sori munkás|segédmunkás|gyártósori|assembly|manual labor|laborer|mezőgazdasági|traktoros|állatgondozó|mészáros|hentes|ács|állványozó|tetőfedő|burkoló|gépszerelő|fényező|pék|cukrász|húsipari|varrónő|textilipari|nyomdász|anyagmozgató|konyhai|mosogató|udvaros|cnc|gépkezelő|gépüzemeltető|fémipari|faipari|production line|higiénia|higénia|higiéniai|higéniai|hygiene|tisztító|tisztítás|mosodai|komissiózó|raktári dolgozó";
const compiledFatalPhysical = new RegExp(huBoundaryStart + '(' + physicalWords + ')' + huSuffixes + huBoundaryEnd, 'i');

const dubiousWords = "fizikai|raktáros|raktári|operátor|szerelő|műszerész|karbantartó|gépbeállító|physical|warehouse|operator|mechanic|technician|maintenance|diszpécser|dispatcher|technikus|művezető|shift leader|műszakvezető|szerelés|technológus";
const compiledDubiousPhysical = new RegExp(huBoundaryStart + '(' + dubiousWords + ')' + huSuffixes + huBoundaryEnd, 'i');

const juniorWords = "diák|diákmunka|gyakornok|gyakornoki|intern|internship|trainee|traineeship|co-op|pályakezdő|pályakezdőket|pályaindító|karrierstart|kezdő|junior|entry-level|entry level|frissdiplomás|friss diplomás|diplomás|student|apprentice|graduate|fresh graduate|tanuló|szövetkezet|iskolaszövetkezet|diákszövetkezet|undergrad|undergraduate|pályakezdőknek|hallgató|ösztöndíjas|scholar|mentee|melo-diak|mind-diak|eudiakok|working student|werkstudent|student worker|career starter|young professional|management trainee|graduate program|rotational program";
const compiledExplicitJunior = new RegExp(huBoundaryStart + '(' + juniorWords + ')' + huSuffixes + huBoundaryEnd, 'i');

// Kivéve a tiltólistás egészségügyi szakmák (orvos, ápoló, gyógyszerész stb.), hogy ne minősüljenek irodainak
const whiteCollarWords = "asszisztens|adminisztrátor|referens|munkatárs|tanácsadó|szakértő|specialista|koordinátor|tervező|fejlesztő|mérnök|elemző|kutató|tanár|oktató|pedagógus|ügyintéző|képviselő|támogatás|ügyfélszolgálat|szerkesztő|író|könyvelő|kontroller|auditor|értékesítő|marketinges|hr|toborzó|programozó|jogász|ügyvéd|építész|animátor|grafikus|készítő|felelős|ügyvédjelölt|oktatásszervező|menedzser|assistant|administrator|clerk|representative|associate|advisor|consultant|specialist|coordinator|designer|developer|engineer|analyst|researcher|teacher|educator|instructor|tutor|agent|support|customer service|editor|writer|copywriter|accountant|controller|auditor|sales|marketing|recruiter|programmer|architect|animator|graphic|creator|officer|executive|planner|buyer|purchaser|strategist|scientist|lawyer|legal|counsel|személyügyi|pénzügyi|bookkeeper|paralegal|sourcer|talent acquisition|ux|ui|seo|ppc|vlogger|blogger|social media|pr|szóvivő|spokesperson|jogtanácsos|pszichológus|gépészmérnök|villamosmérnök|vegyészmérnök|mechatronikai|építőmérnök|építészmérnök|laboráns|data scientist|adatelemző|business analyst|üzleti elemző|financial analyst|kockázatelemző|underwriter|actuarial|aktuárius|újságíró|riporter|tudósító|tolmács|fordító|logisztikus|fuvarszervező|beszerző|journalist|reporter|translator|interpreter|logistician|scrum master|product owner|agile coach|product manager|project manager|projektmenedzser|tesztelő|tester|qa|quality assurance|minőségbiztosítás|helpdesk|üzemeltető|sysadmin|rendszergazda|titkár|secretary|recepciós|receptionist|front office|back office|front-office|back-office|bankár|banker|teller|szervező|organizer|könyvtáros|librarian|modellező|modeler|statisztikus|statistician|ügyfélkapcsolati|térképész|urbanista|szociológus|múzeológus|kurátor|producer|rendező|operatőr|vágó|hangmérnök|világosító|stewardess|légiutaskísérő|meteorológus|geológus|biológus|vegyész|fizikus|matematikus|csillagász|régész|történész|filozófus|nyelvész|irodalmár|teológus|prompt engineer|ai engineer|data engineer|cloud engineer|devops|vámügyintéző|speditőr|vállalkozó|freelancer|bérszámfejtő|számlázó|vámszakértő|adatbázis|telemarketing|piackutató|biztosítás|hitelbíráló|data annotator|ai trainer|kárrendező|payroll|billing|claims|pricing|árazási|purchasing|supply chain|ellátási lánc|compliance|megfelelőségi|attorney|alkalmazott|sdr|bdr|sales development|key account|kam|customer success|ügyfélélmény|köztisztviselő|kormánytisztviselő|ügykezelő|business developer|sales support|sales operations|employer branding|content creator|rendszerszervező|network engineer|biztonsági elemző|clinical research|klinikai kutató|mlops|secops|biztonságtechnikai|hálózat|network administrator|systems engineer|growth hacker|demand generation|seo specialist|ppc specialist|motion designer|video editor|content manager";
const compiledWhiteCollarRoles = new RegExp(huBoundaryStart + '(' + whiteCollarWords + ')' + huSuffixes + huBoundaryEnd, 'i');

const compiledExperienceReject = /(?<![0-2]\s*[-–]\s*)(?:min\.|minimum|legalább|at least|>|több mint|more than)?\s*(?:[3-9]|[1-9][0-9])(?:[\.,][0-9])?\s*(?:\+|or more|[-–]\s*[4-9])?\s*(?:év|éves|évet|year|years|yrs)\s*(?:of\s*)?(?:releváns\s*|szakmai\s*|igazolt\s*|vezetői\s*|munkatapasztalat\s*|igazolható\s*|relevant\s*|professional\s*|work\s*|hands-on\s*)?(?:tapasztalat|gyakorlat|experience|tapasztalattal)/gi;
const compiledExperienceRejectWords = /(?:több|számos|several|multiple|minimum|legalább|at least)\s*(?:éves|év|years of|years)\s*(?:szakmai\s*|releváns\s*|relevant\s*|professional\s*|work\s*)?(?:tapasztalat|gyakorlat|experience)/gi;

const bypassExperienceRegex = /(?:tapasztalat nem elvárás|tapasztalat nem feltétel|tapasztalat nélkül|no experience required|without experience|no prior experience|fresh graduates welcome|pályakezdők jelentkezését|kezdők jelentkezését|előzetes tapasztalat nem|not required|0\s*év|0-tól|0\s*\-)/i;

const niceToHaveKeywords = ["előny", "plusz", "nice to have", "nem elvárás", "nem feltétel", "plussz", "örülünk", "bónusz", "kiváló, ha", "ideális", "advantage", "plus", "preferred", "optional", "welcome", "beneficial", "asset", "szívesen látjuk", "desirable", "not required", "nice-to-have"];
const niceToHaveRegex = new RegExp(`(${niceToHaveKeywords.join('|')})`, 'gi'); 

const compiledCategories = {
    "💻 IT & Szoftverfejlesztés": /(fejlesztő|developer|programmer|it support|tesztelő|software|rendszergazda|informatikus|data engineer|devops|üzemeltető|frontend|backend|fullstack|qa|tester|scrum|agile|kiberbiztonság|cybersecurity)/gi,
    "💼 Gazdasági & Üzleti": /(pénzügy|gazdaság|business|sales|marketing|hr|könyvelő|kontroller|értékesítő|emberi erőforrás|toborzó|beszerző|logisztika|projektmenedzser|közgazdász|finance|accounting|talent|ellátási lánc)/gi,
    "⚙️ Mérnöki & Műszaki": /(mérnök|engineer|villamosmérnök|gépészmérnök|mechatronika|minőségbiztosítás|quality|lean|tervező|építész|CAD|műszaki|architect)/gi,
    "📊 Elemző & Adattudomány": /(elemző|analyst|data scientist|adatelemző|business intelligence|riporter|statisztikus|kutató|research|bi|adattudomány)/gi,
    "🎨 Ügyfélszolgálat & Admin": /(adminisztrátor|ügyfélszolgálat|customer service|recepciós|asszisztens|támogatás|irodai|back office|helpdesk|assistant|clerk|secretary)/gi,
    "📚 Oktatás & Tudomány": /(tanár|oktató|pedagógus|kutató|mentor|tréner|tudományos munkatárs|asszisztens tanár|education|laboráns|teacher|tutor)/gi
};

const compiledAntiCategories = {
    "💻 IT & Szoftverfejlesztés": /(értékesítő|sales|takarító)/gi
};

const compiledVibes = {
    "🚀 Innovatív / Startup": /(startup|innováció|agilis|scrum|modern|fejlődő|dinamikus|kreatív|innovative|cutting-edge|disruptive)/gi,
    "📊 Elemző / Adatvezérelt": /(analitikus|adatvezérelt|precíz|statisztika|kutatás|big data|data-driven|evidence-based)/gi,
    "🤝 Emberközpontú": /(támogató|csapatjátékos|emberközpontú|mentorálás|kellemes légkör|családias|friendly|team|inkluzív|inclusive)/gi,
    "🌍 Nemzetközi": /(multinacionális|nemzetközi|angol|külföldi|global|diverse|diverz|international|cross-border)/gi
};

const locationsDict = /(budapest|debrecen|szeged|miskolc|pécs|győr|nyíregyháza|kecskemét|székesfehérvár|szombathely|veszprém|zalaegerszeg|szolnok|tatabánya|sopron|érd|békéscsaba)/gi;

// ============================================================================
// 🚀 2. V51.0 AHO-CORASICK OMNI-TRIE ENGINE (ALGORITHMIC APEX)
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
    constructor(size = 8192) {
        this.size = size;
        this.bitset = new Uint32Array(Math.ceil(size / 32));
    }
    _hash(str) {
        let hash1 = 5381, hash2 = 52711;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash1 = ((hash1 << 5) + hash1) ^ char;
            hash2 = ((hash2 << 5) + hash2) ^ char;
        }
        return [Math.abs(hash1 % this.size), Math.abs(hash2 % this.size)];
    }
    add(word) {
        const [h1, h2] = this._hash(word);
        this.bitset[h1 >> 5] |= (1 << (h1 & 31));
        this.bitset[h2 >> 5] |= (1 << (h2 & 31));
    }
    mightContain(word) {
        const [h1, h2] = this._hash(word);
        const b1 = this.bitset[h1 >> 5] & (1 << (h1 & 31));
        const b2 = this.bitset[h2 >> 5] & (1 << (h2 & 31));
        return b1 !== 0 && b2 !== 0;
    }
}

const compiledStructuredTags = {};
for (const [group, tags] of Object.entries(structuredTagsDict)) {
    compiledStructuredTags[group] = tags.map(tag => {
        const cleanedTag = tag.replace(/\|/g, '').replace(/\*/g, '').trim();
        const rootWord = cleanedTag.split(/\s+/)[0].toLowerCase(); 
        const escapedTag = cleanedTag.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
        const baseRegex = new RegExp(huBoundaryStart + '(' + escapedTag + ')' + huBoundaryEnd, 'i');
        return { original: cleanedTag, root: rootWord, regex: baseRegex, globalRegex: new RegExp(baseRegex.source, 'gi') };
    });
}

const sanitizeText = (text) => text ? String(text).normalize('NFC').toLowerCase() : "";

const typoLookupMap = new Map();
const typoPatterns = [];
for (const [correctTech, typos] of Object.entries(typoToleranceDict)) {
    for (const typo of typos) {
        typoPatterns.push(typo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        typoLookupMap.set(typo.toLowerCase(), correctTech);
    }
}
const masterTypoRegex = new RegExp(`${huBoundaryStart}(${typoPatterns.join('|')})${huBoundaryEnd}`, 'gi');

function correctTyposAdvanced(text) {
    const typoLog = new Set();
    const correctedText = text.replace(masterTypoRegex, (match, p1) => {
        const lowerMatch = p1.toLowerCase();
        const replacement = typoLookupMap.get(lowerMatch);
        typoLog.add(`${lowerMatch} -> ${replacement}`);
        return match.replace(p1, replacement); 
    });
    return { correctedText, typosFixed: Array.from(typoLog) };
}

class AdvancedLRUCache {
    constructor(limit = 2000, ttlMs = 3600000, maxBytes = 50 * 1024 * 1024) { 
        this.cache = new Map(); 
        this.limit = limit; 
        this.ttlMs = ttlMs;
        this.maxBytes = maxBytes;
        this.currentBytes = 0;
    }
    
    _exactSizeOfV8(obj) {
        const seen = new WeakSet();
        const queue = [obj];
        let head = 0; 
        let bytes = 0;

        while(head < queue.length) {
            const item = queue[head++];
            if (item === null || item === undefined) continue;
            if (typeof item === 'boolean') { bytes += 4; continue; }
            if (typeof item === 'number') { bytes += 8; continue; }
            if (typeof item === 'string') { bytes += 12 + item.length * 2; continue; }
            if (typeof item === 'object') {
                if (seen.has(item)) continue;
                seen.add(item);
                bytes += 24; 
                for (let key in item) {
                    if (Object.prototype.hasOwnProperty.call(item, key)) {
                        bytes += 12 + key.length * 2; 
                        bytes += 8; 
                        queue.push(item[key]); 
                    }
                }
            }
        }
        return bytes;
    }
    
    get(key) {
        if (!this.cache.has(key)) return null;
        const entry = this.cache.get(key);
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.currentBytes -= entry.size;
            this.cache.delete(key);
            return null;
        }
        this.cache.delete(key); 
        this.cache.set(key, entry);
        return structuredClone(entry.data); 
    }
    set(key, value) {
        const size = this._exactSizeOfV8(value);
        while ((this.cache.size >= this.limit || this.currentBytes + size > this.maxBytes) && this.cache.size > 0) {
            const firstKey = this.cache.keys().next().value;
            this.currentBytes -= this.cache.get(firstKey).size;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, { data: structuredClone(value), timestamp: Date.now(), size });
        this.currentBytes += size;
    }
}
const analysisCache = new AdvancedLRUCache(2000);

function buildTextAST_FSM(text) {
    const clauses = [];
    const abbreviations = new Set(["pl", "stb", "ill", "kb", "kft", "zrt", "nyrt", "bt", "dr", "prof", "tel", "fax", "e.g", "i.e"]);
    let start = 0;
    let i = 0;
    const len = text.length;
    let bracketDepth = 0;

    while (i < len) {
        const code = text.charCodeAt(i);
        if (code === 40 || code === 91) bracketDepth++;
        else if (code === 41 || code === 93) bracketDepth = Math.max(0, bracketDepth - 1);

        if ((code === 46 || code === 33 || code === 63 || code === 10) && bracketDepth === 0) {
            let wordStart = i - 1;
            while (wordStart >= start && 
                   ((text.charCodeAt(wordStart) >= 97 && text.charCodeAt(wordStart) <= 122) ||
                    (text.charCodeAt(wordStart) >= 48 && text.charCodeAt(wordStart) <= 57) || 
                    text.charCodeAt(wordStart) > 127)) { 
                wordStart--;
            }
            const lastWord = text.substring(wordStart + 1, i).toLowerCase();

            if (code === 46 && abbreviations.has(lastWord) && i + 1 < len) {
                i++; continue;
            }

            while (i < len && (text.charCodeAt(i) === 46 || text.charCodeAt(i) === 33 || text.charCodeAt(i) === 63 || text.charCodeAt(i) === 10)) i++;

            clauses.push({ text: text.substring(start, i), start, end: i });
            start = i;
        } else {
            i++;
        }
    }
    if (start < len) clauses.push({ text: text.substring(start, len), start, end: len });
    return clauses;
}

function binarySearchAST(ast, targetIndex) {
    let left = 0; let right = ast.length - 1;
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const clause = ast[mid];
        if (targetIndex >= clause.start && targetIndex <= clause.end) return clause;
        if (targetIndex < clause.start) right = mid - 1;
        else left = mid + 1;
    }
    return null;
}

const MAX_DOC_LEN = 1048576; 
const diffBuffer = new ArrayBuffer(MAX_DOC_LEN * 4); 
const globalDiffView = new Int32Array(diffBuffer);

function populateNiceToHaveZonesBitwise(text) {
    const textLen = text.length;
    if (textLen >= MAX_DOC_LEN) return null; 
    
    globalDiffView.fill(0, 0, textLen + 2); 
    let match;
    niceToHaveRegex.lastIndex = 0;
    let foundAny = false;
    
    while ((match = niceToHaveRegex.exec(text)) !== null) {
        foundAny = true;
        const start = Math.max(0, match.index - 60);
        const end = Math.min(textLen, match.index + match[0].length + 60);
        globalDiffView[start] += 1;
        globalDiffView[end + 1] -= 1;
    }
    
    if (!foundAny) return false;
    
    for(let i = 1; i <= textLen; i++) {
        globalDiffView[i] = (globalDiffView[i] + globalDiffView[i - 1]) | 0; 
    }
    return true; 
}

const simulatedIDF = new Map();
function initBM25IDF() {
    const N = 10000; 
    for (const [cat, regex] of Object.entries(compiledCategories)) {
        const terms = regex.source.replace(/[()|^]/g, ' ').split(/\s+/).filter(t => t.length > 2);
        for (const term of terms) {
            if (!simulatedIDF.has(term)) {
                const df = term.length > 8 ? 500 : 3000; 
                const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
                simulatedIDF.set(term, idf);
            }
        }
    }
}
initBM25IDF(); 

// ----------------------------------------------------------------------------
// SEGÉDFÜGGVÉNYEK (Érintetlen kimeneti logika)
// ----------------------------------------------------------------------------
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
    return { raw_text: match[0].replace(/\s+/g, ' ').trim(), min_amount: minAmount, max_amount: maxAmount, currency: currency, is_net: !!(match[1] && (match[1].startsWith('net') || match[1].toLowerCase() === 'net')), is_hourly: isHourly, is_yearly: isYearly };
}

function estimateMarketSalary(faculty, jobNature) {
    let baseHourly = 1600; 
    if (faculty.includes("IT") || faculty.includes("Adattudomány")) baseHourly += 800;
    else if (faculty.includes("Mérnöki") || faculty.includes("Gazdasági")) baseHourly += 500;
    else if (faculty.includes("Ügyfélszolgálat")) baseHourly += 200;
    if (jobNature === "Pályakezdő (Teljes munkaidő)") {
        const monthlyMin = (baseHourly * 168) * 1.1; 
        return { estimate_type: "Monthly Gross", min: Math.round(monthlyMin / 1000) * 1000, max: Math.round((monthlyMin * 1.4) / 1000) * 1000, currency: "HUF" };
    } else return { estimate_type: "Hourly Gross", min: baseHourly, max: baseHourly + 600, currency: "HUF" };
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
        engine.regex.lastIndex = 0;
        if (engine.regex.test(text)) results.push(engine.name);
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

function extractCertificates(text) {
    const certs = [...new Set((text.match(certificationsDict) || []).map(c => c.toUpperCase()))];
    return certs.length > 0 ? certs : null;
}

function analyzeApplicationFriction(text) {
    const frictionPoints = extractFromMatrix(text, PreCompiledEngines.appFriction) || [];
    return frictionPoints.length > 0 ? { points: frictionPoints, score: frictionPoints.length } : null;
}

function calculateBullshitIndex(text) {
    const bsCount = (text.match(corporateBSDict) || []).length;
    let category = "Tiszta / Érthető";
    if (bsCount >= 5) category = "Kritikus BS-szint (HR sablon)";
    else if (bsCount >= 2) category = "Enyhe Corporate Zsargon";
    return { score: bsCount, category: category };
}

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

function extractCompanyTone(text) {
    let toneScores = [];
    for (const engine of PreCompiledEngines.tone) {
        const matches = (text.match(engine.regex) || []).length;
        if (matches > 0) toneScores.push({ name: engine.name, score: matches });
    }
    toneScores.sort((a, b) => b.score - a.score);
    return toneScores.length > 0 ? toneScores[0].name : "Semleges / Vegyes";
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
    const enterpriseTech = { "java": 1, "c#": 1, "c++": 1, "oracle": 2, "sap": 2, "salesforce": 2, "jenkins": 1 };
    const modernTech = { "react": 1, "node.js": 1, "typescript": 1, "aws": 2, "docker": 1, "kubernetes": 2, "vue": 1, "tailwind": 1 };
    lcTags.forEach(tag => {
        if (enterpriseTech[tag]) enterpriseScore += enterpriseTech[tag];
        if (modernTech[tag]) modernScore += modernTech[tag];
    });
    if (enterpriseScore > modernScore && enterpriseScore >= 3) return "Enterprise / Legacy Stack";
    if (modernScore > enterpriseScore && modernScore >= 3) return "Modern / Cloud-Native Stack";
    return "Vegyes / Általános Stack";
}

function runSemanticInference(flatTags) {
    let inferred = new Set();
    const lcTags = flatTags.map(t => t.toLowerCase());
    if (lcTags.includes("react") || lcTags.includes("vue") || lcTags.includes("angular") || lcTags.includes("html") || lcTags.includes("css")) inferred.add("Frontend Focus");
    if (lcTags.includes("node.js") || lcTags.includes("java") || lcTags.includes("python") || lcTags.includes("c#") || lcTags.includes("php")) inferred.add("Backend Focus");
    if (lcTags.includes("sql") || lcTags.includes("postgresql") || lcTags.includes("mongodb") || lcTags.includes("redis")) inferred.add("Database Management");
    if (lcTags.includes("aws") || lcTags.includes("azure") || lcTags.includes("docker") || lcTags.includes("kubernetes")) inferred.add("Cloud / DevOps Focus");
    if (lcTags.includes("power bi") || lcTags.includes("tableau") || lcTags.includes("hadoop") || lcTags.includes("spark")) inferred.add("Data / Analytics Focus");
    if (lcTags.includes("figma") || lcTags.includes("photoshop") || lcTags.includes("illustrator")) inferred.add("Design / UI Focus");
    if (lcTags.includes("seo") || lcTags.includes("sem") || lcTags.includes("google analytics")) inferred.add("Digital Marketing Focus");
    return Array.from(inferred);
}

function generateJsonLd(jobData, rawTitle, companyName) {
    const validThroughDate = new Date(); validThroughDate.setDate(validThroughDate.getDate() + 30); 
    return {
        "@context": "https://schema.org/",
        "@type": "JobPosting",
        "title": rawTitle,
        "description": "Részletek az oldalon.",
        "datePosted": new Date().toISOString(),
        "validThrough": validThroughDate.toISOString(),
        "employmentType": jobData.airtable_ready.job_nature.includes("Részmunkaidő") ? "PART_TIME" : (jobData.airtable_ready.job_nature.includes("Diák") || jobData.airtable_ready.job_nature.includes("Gyakornok") ? "INTERN" : "FULL_TIME"),
        "hiringOrganization": { "@type": "Organization", "name": companyName || "N/A" },
        "jobLocation": jobData.locations.map(loc => ({ "@type": "Place", "address": { "@type": "PostalAddress", "addressLocality": loc, "addressCountry": "HU" } })),
        "baseSalary": jobData.airtable_ready.salary_min ? {
            "@type": "MonetaryAmount",
            "currency": jobData.airtable_ready.salary_currency,
            "value": { "@type": "QuantitativeValue", "minValue": jobData.airtable_ready.salary_min, "maxValue": jobData.airtable_ready.salary_max, "unitText": jobData.airtable_ready.is_hourly_wage ? "HOUR" : "MONTH" }
        } : undefined
    };
}

function generateTLDR(companyName, jobNature, faculty, locationArray, workSetupArray, salaryData, equipment) {
    const loc = locationArray && locationArray.length > 0 ? locationArray[0] : "Országos";
    const setup = workSetupArray && workSetupArray.length > 0 ? workSetupArray[0] : "irodai";
    let salaryString = salaryData && salaryData.min_amount ? `, akár ${salaryData.min_amount.toLocaleString('hu-HU')} ${salaryData.currency} bérrel` : "";
    let gearString = equipment && equipment.length > 0 ? ` (Extrák: ${equipment[0]}).` : ".";
    return `A(z) ${companyName} új ${jobNature.toLowerCase()} pozíciót nyitott ${faculty.replace(/[^\w\s\u00C0-\u017F]/g, '').trim()} területen. Munkavégzés: ${loc} / ${setup}${salaryString}${gearString}`;
}

// ============================================================================
// 🚀 FŐ ELEMZŐ FÜGGVÉNY EXPORTÁLÁSA (V51.0 AHO-CORASICK)
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
    const docBloom = new BloomFilter(8192);
    for (let i=0; i<docWords.length; i++) {
        if (docWords[i].length > 2) docBloom.add(docWords[i]);
    }

    mark('guard_start');
    if (detectScamAndMLM(fullText)) return null; 

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

    if (compiledFatalSenior.test(cleanTitle) && !isExplicitJuniorTitle) return null;
    if (compiledFatalPhysical.test(cleanTitle) && !isExplicitJuniorTitle) return null;
    if (compiledDubiousPhysical.test(cleanTitle) && !isExplicitJunior && !compiledWhiteCollarRoles.test(cleanTitle)) return null;
    if (isTooSenior && !isExplicitJuniorTitle) return null;
    if (!isExplicitJunior && !isWhiteCollar) return null; 
    const timeGuard = measure('Guard_Time', 'guard_start');

    mark('score_start');
    const leadDesc = fullText.substring(0, 300); 
    const bodyDesc = fullText.substring(300);
    
    const wordsCount = Math.max(1, docWords.length);
    const avgDl = 400; 
    const k1 = 1.5;    
    const b = 0.75;    
    const bm25LenNorm = 1 - b + b * (wordsCount / avgDl);
    
    let maxScore = 0; let assignedCategory = "🔍 Egyéb / Általános";
    for (const [catName, regex] of Object.entries(compiledCategories)) {
        let termFrequency = 0;
        let match;
        
        regex.lastIndex = 0;
        while ((match = regex.exec(cleanTitle)) !== null) termFrequency += (simulatedIDF.get(match[0]) || 1.5) * 20;
        
        regex.lastIndex = 0;
        while ((match = regex.exec(leadDesc)) !== null) termFrequency += (simulatedIDF.get(match[0]) || 1.5) * 5;
        
        regex.lastIndex = 0;
        while ((match = regex.exec(bodyDesc)) !== null) termFrequency += (simulatedIDF.get(match[0]) || 1.5) * 1;
        
        let score = (termFrequency * (k1 + 1)) / (termFrequency + k1 * bm25LenNorm);

        if (compiledAntiCategories[catName]) score -= (fullText.match(compiledAntiCategories[catName]) || []).length * 50;
        if (score > maxScore && score > 0.5) { maxScore = score; assignedCategory = catName; }
    }

    let vibeScores = [];
    for (const [vibeName, regex] of Object.entries(compiledVibes)) {
        const matches = (fullText.match(regex) || []).length;
        if (matches > 0) vibeScores.push({ name: vibeName, score: matches });
    }
    vibeScores.sort((a, b) => b.score - a.score);
    let assignedVibe = vibeScores.length > 0 ? vibeScores[0].name : "⚖️ Kiegyensúlyozott";
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
    const companyTone = extractCompanyTone(fullText);
    const diversityIndex = calculateDiversityIndex(fullText);
    const urgencyMatrix = extractUrgency(fullText);
    
    const redFlags = detectRedFlags(fullText);
    const certifications = extractCertificates(fullText);
    const onboardingStatus = analyzeOnboarding(fullText);
    const bsIndex = calculateBullshitIndex(fullText);

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

    const marketSalaryEstimate = parsedSalary ? null : estimateMarketSalary(assignedCategory, jobNature);
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
                    isNiceToHave = true;
                    matchCount += globalDiffView[match.index] * 0.5;
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
    const timeTag = measure('Tag_Time', 'tag_start');

    const inferredMetaTags = runSemanticInference(allFlatTags);
    const techStackTier = evaluateTechStack(extractedTags.tech); 
    
    let confidenceScore = 100;
    if (isExplicitJunior) confidenceScore = 100;
    else {
        if (!bypassExperienceRegex.test(fullText)) confidenceScore -= 20; 
        if (compiledWhiteCollarRoles.test(fullText)) confidenceScore += 10;
        if (redFlags) confidenceScore -= (redFlags.length * 10);
        if (bsIndex.score >= 5) confidenceScore -= 15; 
        if (appFriction && appFriction.score >= 2) confidenceScore -= 5; 
        if (isTooSenior) confidenceScore -= 50; 
    }
    confidenceScore = Math.max(0, Math.min(100, confidenceScore));

    const dynamicTLDR = generateTLDR(companyName, jobNature, assignedCategory, foundLocations, extractedTags.work_setup, parsedSalary || marketSalaryEstimate, equipmentProvided);

    const timeTotal = measure('Total_Time', 'total_start');

    const finalPayload = {
        metadata: {
            is_valid_entry_level: true,
            confidence_score_pct: confidenceScore,
            faculty: assignedCategory,
            job_nature: jobNature,
            contract_type: contractType,
            work_style: assignedVibe,
            company_tone: companyTone, 
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
            auto_corrected_typos: typoFixResult.typosFixed 
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
            is_hourly_wage: parsedSalary ? parsedSalary.is_hourly : (marketSalaryEstimate ? marketSalaryEstimate.estimate_type === "Hourly Gross" : null),
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