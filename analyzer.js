const crypto = require("crypto");

// ============================================================================
// 🚀 V18.0 NEXUS-COGNITION ENGINE: MÉLY-SZEMANTIKAI ÉS KOGNITÍV PARSER
// ============================================================================

const niceToHaveKeywords = ["előny", "plusz", "nice to have", "nem elvárás", "nem feltétel", "plussz", "örülünk", "bónusz", "kiváló, ha", "ideális"];
const niceToHaveRegex = new RegExp(`(${niceToHaveKeywords.join('|')})`, 'i');

// Pre-compilation a sebességért
const compiledStructuredTags = {};
for (const [group, tags] of Object.entries(structuredTagsDict)) {
    compiledStructuredTags[group] = tags.map(tag => {
        const baseRegex = buildRegex([tag]);
        return {
            original: tag.replace(/\|/g, '').replace(/\*/g, '').trim(),
            regex: baseRegex,
            globalRegex: new RegExp(baseRegex.source, 'gi') 
        };
    });
}

const sanitizeText = (text) => text ? String(text).toLowerCase() : "";

// 🧠 1. LRU CACHE (Memória-védelem OOM ellen! Max 2000 elemet tárol)
class LRUCache {
    constructor(limit = 2000) {
        this.cache = new Map();
        this.limit = limit;
    }
    get(key) {
        if (!this.cache.has(key)) return null;
        const val = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, val); // Frissítjük a pozícióját (legutóbb használt)
        return val;
    }
    set(key, value) {
        if (this.cache.size >= this.limit) {
            // Töröljük a legrégebbit (az első elemet a Map-ben)
            this.cache.delete(this.cache.keys().next().value);
        }
        this.cache.set(key, value);
    }
}
const analysisCache = new LRUCache(2000);

// 🧠 2. HYPER-SALARY PARSER (A piac legokosabb fizetés-kinyerője)
function parseSalary(text) {
    // Felismeri: 1.2M, 850k, 12.000.000, 2000 EUR, bruttó/nettó, óra/hó/év
    const salaryRegex = /(?:(bruttó|br\.|nettó|net\.)\s*)?(?:€|eur\s*)?(\d{1,3}(?:[\s\.]\d{3})*|\d{1,4}[kmM])(?:\s*-\s*(?:€|eur\s*)?(\d{1,3}(?:[\s\.]\d{3})*|\d{1,4}[kmM]))?\s*(ft|huf|eur|€|euro)?(?:\s*\/\s*(óra|hó|hónap|év))?/i;
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
    
    // Intelligens időszak becslés
    let isHourly = periodStr.includes('óra');
    let isYearly = periodStr.includes('év');
    if (!periodStr) {
        if (currency === "HUF" && minAmount < 10000) isHourly = true;
        if (currency === "HUF" && minAmount > 3000000) isYearly = true;
    }

    return {
        raw_text: match[0].replace(/\s+/g, ' ').trim(),
        min_amount: minAmount,
        max_amount: maxAmount,
        currency: currency,
        is_net: !!(match[1] && match[1].startsWith('net')),
        is_hourly: isHourly,
        is_yearly: isYearly
    };
}

// 🧠 3. NYELVTUDÁS SZINT (Javított normalizáció)
function parseLanguageLevels(text) {
    const levels = {};
    const langRegex = /(angol|német|francia|spanyol|olasz)[^\w]{0,35}(a1|a2|b1|b2|c1|c2|alapfok|középfok|felsőfok|társalgási|tárgyalási|tárgyalóképes|folyékony|anyanyelvi)/gi;
    let match;
    while ((match = langRegex.exec(text)) !== null) {
        const lang = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        let level = match[2].toUpperCase();
        
        if (level.includes("KÖZÉP") || level.includes("TÁRSALGÁS")) level = "B2";
        else if (level.includes("FELSŐ") || level.includes("TÁRGYALÁSI") || level.includes("TÁRGYALÓ") || level.includes("FOLYÉKONY")) level = "C1";
        else if (level.includes("ALAP")) level = "A2/B1";
        else if (level.includes("ANYANYELV")) level = "C2";

        // Csak a legmagasabb szintet tartjuk meg, ha egy nyelvet többször említenek
        levels[lang] = levels[lang] > level ? levels[lang] : level; 
    }
    return Object.keys(levels).length > 0 ? levels : null;
}

// 🧠 4. HOME OFFICE ARÁNY DETEKTOR
function extractHomeOfficeRatio(text) {
    const hoRegex = /heti\s*(\d)\s*nap(ot)?\s*(home office|ho|távmunka)/i;
    const match = text.match(hoRegex);
    if (match && parseInt(match[1]) <= 5) {
        const days = parseInt(match[1]);
        return `Hibrid (${days} nap HO)`;
    }
    return null;
}

// ============================================================================
// 🚀 FŐ ELEMZŐ FÜGGVÉNY
// ============================================================================
exports.analyzeJob = function(title, description = "") {
    
    // --- CACHE ELLENŐRZÉS (O(1) sebesség) ---
    const cacheKey = crypto.createHash('md5').update(`${sanitizeText(title)}||${description ? description.length : 0}`).digest('hex');
    const cachedResult = analysisCache.get(cacheKey);
    if (cachedResult) return cachedResult;

    // 🛡️ 1. FÁZIS: EARLY-EXIT
    let safeTitle = sanitizeText(title);
    for (const rule of detoxRules) safeTitle = safeTitle.replace(rule.regex, rule.replacement);
    const cleanTitle = safeTitle.replace(/\([^()]*\)/g, '').replace(/\[[^\[\]]*\]/g, '').trim();

    if (compiledFatalSenior.test(cleanTitle) || compiledFatalPhysical.test(safeTitle)) return null; 
    if (compiledDubiousPhysical.test(safeTitle) && !compiledSaviors.test(safeTitle)) return null;

    // 🧹 2. FÁZIS: TELJES SZÖVEG DETOX
    let safeDesc = sanitizeText(description);
    for (const rule of detoxRules) safeDesc = safeDesc.replace(rule.regex, rule.replacement);
    let fullText = `${safeTitle} \n ${safeDesc}`;

    let isEntryLevel = compiledAccept.test(fullText);
    let isTooSenior = compiledExperienceReject.test(fullText);
    if (isTooSenior && isEntryLevel && compiledJuniorSaviors.test(cleanTitle)) isTooSenior = false; 
    if (isTooSenior || !isEntryLevel) return null; 

    // 📊 3. FÁZIS: SÚLYOZOTT PONTOZÁS (TF-IDF Logika)
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

    // 🎯 4. FÁZIS: MÉLYFÚRÁS ÉS KÖRÜLMÉNYEK
    const isMandatoryInternship = /kötelező (szakmai )?gyakorlat|gyakorlat( le)?igazolás/i.test(fullText);
    const requiresActiveStudent = /aktív( nappali)? (hallgatói )?jogviszony|nappali tagozat/i.test(fullText);
    
    let extractedHours = "Rugalmas";
    const hoursMatch = fullText.match(/(?:heti|min\.|legalább)?\s*(\d{1,2})\s*(?:óra|órás|órát|órában)/i);
    if (hoursMatch && parseInt(hoursMatch[1]) >= 10 && parseInt(hoursMatch[1]) <= 40) extractedHours = parseInt(hoursMatch[1]);

    const parsedSalary = parseSalary(fullText);
    const parsedLanguageLevels = parseLanguageLevels(fullText);
    const hoRatio = extractHomeOfficeRatio(fullText);
    
    // ÚJ: Kiterjesztett végzettség azonosítás
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
    if (buildRegex(["diák", "iskolaszövetkezet", "|diákmunka|"]).test(fullText) || requiresActiveStudent) jobNature = "Diákmunka";
    else if (buildRegex(["*gyakornok*", "intern", "trainee"]).test(fullText) || isMandatoryInternship) jobNature = "Gyakornok";
    else if (buildRegex(["részmunkaidő", "part-time", "4 órás", "6 órás"]).test(fullText)) jobNature = "Pályakezdő (Részmunkaidő)";

    // 🧬 5. FÁZIS: O(1) KONTEXTUS-TUDATOS CÍMKÉZÉS
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
    
    // HO Arány betöltése a címkék közé, ha találtunk pontosat
    if (hoRatio && extractedTags.work_setup.includes("Home office")) {
        extractedTags.work_setup = extractedTags.work_setup.filter(t => t !== "Home office");
        extractedTags.work_setup.push(hoRatio);
        allFlatTags = allFlatTags.filter(t => t !== "Home office");
        allFlatTags.push(hoRatio);
    }

    niceToHaveTags = [...new Set(niceToHaveTags)].filter(tag => !allFlatTags.includes(tag));

    // 🚀 6. FÁZIS: VÉGLEGES ADATSTRUKTÚRA ÖSSZEÁLLÍTÁSA ÉS CACHELÉSE
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
        // EZ A BLOKK TÖKÉLETES TULAJDONSÁG-MAPPINGET BIZTOSÍT A FRONTEND ÉS DB SZÁMÁRA
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

    // Eredmény elmentése az OOM-védett memóriába
    analysisCache.set(cacheKey, finalPayload);

    return finalPayload;
};