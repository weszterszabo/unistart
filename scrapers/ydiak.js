const cheerio = require("cheerio");
const analyzer = require("../analyzer");

const HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7"
};

const stripHtml = (html) => {
    if (!html) return "";
    return html.toString().replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
};

exports.scrape = async function(companyName = "Y Diákszövetkezet", baseUrl = "https://ydiak.hu", knownUrls = []) {
    const allJobs = [];
    const seenUrls = new Set();
    
    console.log(`   🚀 [YDIAK SITEMAP SCRAPER] Indulás: ${companyName}`);

    try {
        // 1. SITEMAP LETÖLTÉSE
        console.log(`   🗺️ [YDIAK] Oldaltérkép (Sitemap) lekérése...`);
        const originUrl = new URL(baseUrl).origin; // Ezzel visszakapjuk a tiszta "https://ydiak.hu"-t
console.log(`   🗺️ [YDIAK] Oldaltérkép lekérése innen: ${originUrl}/sitemap.xml`);
const sitemapRes = await fetch(`${originUrl}/sitemap.xml`, { headers: HEADERS });
        if (!sitemapRes.ok) throw new Error(`Sitemap HTTP Hiba: ${sitemapRes.status}`);
        
        const sitemapXml = await sitemapRes.text();
        
        // 2. AZ ÖSSZES LINK KINYERÉSE (Regex mágia)
        const locMatches = [...sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
        console.log(`   🔍 [YDIAK] Összesen ${locMatches.length} db link találva az oldaltérképen.`);

        // 3. CSAK AZ ÁLLÁSOK KISZŰRÉSE (A Cheat Code logika)
        const jobUrls = [];
        for (const url of locMatches) {
            try {
                const parsed = new URL(url);
                const pathSegments = parsed.pathname.split('/').filter(Boolean);
                
                // Szabály: Pontosan 2 mappa mélység (kategoria/allas-neve), nem angol, nem a kategória lista
                if (
                    pathSegments.length === 2 && 
                    pathSegments[0] !== 'en' && 
                    pathSegments[0] !== 'aktualis-diakmunkaink' &&
                    !url.includes('/uploads/')
                ) {
                    if (!seenUrls.has(url) && !knownUrls.includes(url)) {
                        jobUrls.push(url);
                        seenUrls.add(url);
                    }
                }
            } catch (e) { /* Hibás URL ignorálása */ }
        }

        console.log(`   🎯 [YDIAK] ${jobUrls.length} db érvényes állás link kiszűrve! Letöltés indul...`);

        // 4. ÁLLÁSOK EGYENKÉNTI LETÖLTÉSE (Kíméletes sebességgel)
        let processedCount = 0;
        
        for (const jobUrl of jobUrls) {
            try {
                const response = await fetch(jobUrl, { headers: HEADERS });
                if (!response.ok) continue;
                
                const html = await response.text();
                const $ = cheerio.load(html);

                // Cím és tartalom kinyerése
                let title = $('h1').first().text().replace(/\s+/g, ' ').trim() || $('title').text().split('-')[0].trim();
                if (!title || title.length < 3) continue;

                // Az Y Diák általában a cikkeket egy main, article vagy .container tagbe teszi
                let rawDescription = $('main').text() || $('.container').text() || $('body').text();
                rawDescription = stripHtml(rawDescription);

                // Ha az URL-ből ki tudjuk nyerni a kategóriát, azt is átadjuk az NLP-nek
                const urlCategory = new URL(jobUrl).pathname.split('/')[1] || "";
                const finalDesc = `Kategória: ${urlCategory}\n${rawDescription}`;

                // 🧠 KÖZPONTI NLP AGY HÍVÁSA
                let jobNature = "Pályakezdő";
                let faculty = "Egyéb";
                let finalTags = [];
                let workStyle = "";
                let location = "Magyarország"; // Az NLP vagy a Sanitizer úgyis javítja a szövegből!

                if (analyzer && typeof analyzer.analyzeJob === 'function') {
                    const analysis = analyzer.analyzeJob(title, finalDesc);
                    if (analysis !== null) {
                        jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
                        faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
                        workStyle = analysis.metadata?.work_style || analysis.work_style || "";
                        finalTags = analysis.airtable_ready?.required_tags || analysis.tags || [];
                        if (!Array.isArray(finalTags) && analysis.tags?.required) finalTags = analysis.tags.required;
                    }
                }

                allJobs.push({
                    title: title,
                    url: jobUrl,
                    apply_url: jobUrl,
                    location: location, 
                    date_posted: new Date().toISOString(),
                    experience_level: jobNature,
                    subsidiary: companyName,
                    employment_type: "Diákmunka",
                    faculty: faculty,
                    work_style: workStyle,
                    tags: Array.isArray(finalTags) ? finalTags : []
                });

                processedCount++;
                // Fejlődés kijelzése minden 10. állásnál
                if (processedCount % 10 === 0) {
                    process.stdout.write(`   ⏳ [YDIAK] ${processedCount} / ${jobUrls.length} állás feldolgozva...\r`);
                }

                // Udvarias szünet, nehogy a Tarpit védelem kivágjon minket
                await new Promise(r => setTimeout(r, 250));

            } catch (err) {
                console.warn(`   ⚠️ [YDIAK] Hiba az oldal letöltésekor: ${jobUrl} - ${err.message}`);
            }
        }

        console.log(`\n   ✔️  [YDIAK] Kész! ${allJobs.length} db valid állás sikeresen megmentve a Sitemap-ből.`);
        return allJobs;

    } catch (err) {
        console.error(`   ❌ [YDIAK] Hiba a Sitemap feldolgozásakor:`, err.message);
        throw err;
    }
};