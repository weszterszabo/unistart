// ============================================================================
// 🚀 V17.0 SINGULARITY ENGINE: MÉLY-SZEMANTIKAI ÉS CACHE OPTIMALIZÁLT PARSER
// ============================================================================

const niceToHaveKeywords = ["előny", "plusz", "nice to have", "nem elvárás", "nem feltétel", "plussz", "örülünk", "bónusz", "kiváló, ha"];
const niceToHaveRegex = new RegExp(`(${niceToHaveKeywords.join('|')})`, 'i');

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

// --- Gyorsítótár (Cache) a tömeges API hívások teljesítményének maximalizálásához ---
const analysisCache = new Map();

// --- 1. Fizetés Parsoló (Maradt a V16-ból, szuper-stabil) ---
function parseSalary(text) {
    const salaryRegex = /(?:(bruttó|br\.|nettó|net\.)\s*)?(\d{1,3}(?:[\s\.]\d{3})+|\d{3,7})(?:\s*-\s*(\d{1,3}(?:[\s\.]\d{3})+|\d{3,7}))?\s*(ft|huf)(?:\s*\/\s*(óra|hó|hónap))?/i;
    const match = text.match(salaryRegex);
    if (!match) return null;

    const parseNum = (str) => parseInt(str.replace(/[\s\.]/g, ''), 10);
    const minStr = match[2];
    const maxStr = match[3];
    return {
        raw_text: match[0].replace(/\s+/g, ' ').trim(),
        min_amount: minStr ? parseNum(minStr) : null,
        max_amount: maxStr ? parseNum(maxStr) : (minStr ? parseNum(minStr) : null),
        is_net: !!(match[1] && match[1].startsWith('net')),
        is_hourly: !!(match[5] && match[5].includes('óra')) || (minStr && parseNum(minStr) < 10000)
    };
}

// --- ÚJ 2. Nyelvtudás Szint Parsoló ---
function parseLanguageLevels(text) {
    const levels = {};
    // 30 karakteres ablakot vizsgál a nyelv és a szint között (pl. "Angol nyelv - magabiztos C1")
    const langRegex = /(angol|német|francia|spanyol|olasz)[^\w]{0,30}(a2|b1|b2|c1|c2|alapfok|középfok|felsőfok|társalgási|tárgyalási|tárgyalóképes|folyékony)/gi;
    let match;
    while ((match = langRegex.exec(text)) !== null) {
        const lang = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        let level = match[2].toUpperCase();
        
        // Szabványosítás a szűrőkhöz
        if (level.includes("KÖZÉP") || level.includes("TÁRSALGÁS")) level = "B2";
        if (level.includes("FELSŐ") || level.includes("TÁRGYALÁSI") || level.includes("TÁRGYALÓ") || level.includes("FOLYÉKONY")) level = "C1";
        if (level.includes("ALAP")) level = "A2/B1";

        levels[lang] = level;
    }
    return Object.keys(levels).length > 0 ? levels : null;
}

// ============================================================================
// FŐ ELEMZŐ FÜGGVÉNY
// ============================================================================
exports.analyzeJob = function(title, description = "") {
    
    // --- CACHE ELLENŐRZÉS ---
    // Minimalizáljuk az IO-t: ha már láttuk ezt a hirdetést, azonnal visszadjuk.
    const cacheKey = `${sanitizeText(title)}||${description ? description.length : 0}`;
    if (analysisCache.has(cacheKey)) return analysisCache.get(cacheKey);

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

    // 📊 3. FÁZIS: SÚLYOZOTT PONTOZÁS
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

    // 🎯 4. FÁZIS: MÉLYFÚRÁS ÉS KÖRÜLMÉNYEK (Óraszám, Fizetés, Nyelv, Diploma)
    const isMandatoryInternship = /kötelező (szakmai )?gyakorlat|gyakorlat( le)?igazolás/i.test(fullText);
    const requiresActiveStudent = /aktív( nappali)? (hallgatói )?jogviszony|nappali tagozat/i.test(fullText);
    
    let extractedHours = "Rugalmas";
    const hoursMatch = fullText.match(/(?:heti|min\.|legalább)?\s*(\d{2})\s*(?:óra|órás|órát|órában)/i);
    if (hoursMatch && parseInt(hoursMatch[1]) >= 10 && parseInt(hoursMatch[1]) <= 40) extractedHours = parseInt(hoursMatch[1]);

    const parsedSalary = parseSalary(fullText);
    const parsedLanguageLevels = parseLanguageLevels(fullText);
    
    // ÚJ: Képzési típus azonosítása
    const degreeMatch = fullText.match(/\b(bsc|msc|ba|ma|bachelor|master|alapképzés|mesterképzés)\b/i);
    const requiredDegree = degreeMatch ? degreeMatch[1].toUpperCase().replace("BACHELOR", "BSC").replace("MASTER", "MSC") : null;

    let foundLocations = [...new Set((fullText.match(locationsDict) || []).map(l => l.charAt(0).toUpperCase() + l.slice(1)))];
    
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
        flat_db_record: { 
            faculty: assignedCategory,
            job_nature: jobNature,
            degree: requiredDegree,
            weekly_hours: extractedHours !== "Rugalmas" ? extractedHours : null,
            salary_min: parsedSalary?.min_amount || null,
            salary_max: parsedSalary?.max_amount || null,
            required_tags: allFlatTags,
            bonus_tags: niceToHaveTags
        }
    };

    // Eredmény elmentése a memóriába a következő azonos hirdetéshez
    analysisCache.set(cacheKey, finalPayload);

    return finalPayload;
};