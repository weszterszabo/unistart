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
        const originUrl = new URL(baseUrl).origin;
        console.log(`   🗺️ [YDIAK] Oldaltérkép lekérése innen: ${originUrl}/sitemap.xml`);
        const sitemapRes = await fetch(`${originUrl}/sitemap.xml`, { headers: HEADERS });
        if (!sitemapRes.ok) throw new Error(`Sitemap HTTP Hiba: ${sitemapRes.status}`);
        
        const sitemapXml = await sitemapRes.text();
        const locMatches = [...sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
        
        const jobUrls = [];
        for (const url of locMatches) {
            try {
                const parsed = new URL(url);
                const pathSegments = parsed.pathname.split('/').filter(Boolean);
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
            } catch (e) {}
        }

        console.log(`   🎯 [YDIAK] ${jobUrls.length} db érvényes állás link kiszűrve! Letöltés indul...`);

        // 4. ÁLLÁSOK EGYENKÉNTI LETÖLTÉSE (Időtúllépés elleni védelemmel)
        for (let i = 0; i < jobUrls.length; i++) {
            const jobUrl = jobUrls[i];
            
            try {
                // ⏱️ HÓHÉR: Maximum 8 másodpercet adunk egy oldalnak
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);

                const response = await fetch(jobUrl, { 
                    headers: HEADERS, 
                    signal: controller.signal 
                });
                
                clearTimeout(timeoutId); // Ha letöltött, leállítjuk a stoppert

                if (!response.ok) continue;
                
                const html = await response.text();
                const $ = cheerio.load(html);

                let title = $('h1').first().text().replace(/\s+/g, ' ').trim() || $('title').text().split('-')[0].trim();
                if (!title || title.length < 3) continue;

                let rawDescription = $('main').text() || $('.container').text() || $('body').text();
                rawDescription = stripHtml(rawDescription);

                const urlCategory = new URL(jobUrl).pathname.split('/')[1] || "";
                const finalDesc = `Kategória: ${urlCategory}\n${rawDescription}`;

                let jobNature = "Pályakezdő";
                let faculty = "Egyéb";
                let finalTags = [];
                let workStyle = "";
                let location = "Magyarország"; 

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

                // Írjuk ki pontosan, hol tartunk, hogy lássuk ha megakad
                process.stdout.write(`   ⏳ [YDIAK] ${i + 1} / ${jobUrls.length} feldolgozva... \r`);
                
                // Udvarias, de dinamikus szünet (hogy összezavarjuk a robot-szűrőt)
                const randomDelay = Math.floor(Math.random() * 300) + 100;
                await new Promise(r => setTimeout(r, randomDelay));

            } catch (err) {
                // Ha a 8 másodperc lejárt, vagy egyéb hiba van, eldobjuk az oldalt és megyünk tovább
                console.log(`\n   ⚠️ [YDIAK] Ugrás, az oldal nem válaszolt időben: ${jobUrl}`);
            }
        }

        console.log(`\n   ✔️  [YDIAK] Kész! ${allJobs.length} db valid állás sikeresen megmentve a Sitemap-ből.`);
        return allJobs;

    } catch (err) {
        console.error(`   ❌ [YDIAK] Hiba a Sitemap feldolgozásakor:`, err.message);
        throw err;
    }
};