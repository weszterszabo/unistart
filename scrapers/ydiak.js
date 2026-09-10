const cheerio = require("cheerio");
const analyzer = require("../analyzer");

const HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7"
};

const withTimeout = (promise, ms) => {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('HARD_TIMEOUT')), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
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

        for (let i = 0; i < jobUrls.length; i++) {
            const jobUrl = jobUrls[i];
            process.stdout.write(`   ⏳ [YDIAK] ${i + 1} / ${jobUrls.length} feldolgozása... \r`);
            
            try {
                await withTimeout((async () => {
                    const response = await fetch(jobUrl, { headers: HEADERS });
                    if (!response.ok) return;
                    
                    const html = await response.text();
                    const $ = cheerio.load(html);

                    // 🧨 1. VÉDELMI VONAL: Törlünk minden rejtett kódot, formázást és SVG grafikát, ami lefagyaszthatja az NLP-t!
                    $('script, style, noscript, iframe, svg, meta, link').remove();

                    let title = $('h1').first().text().replace(/\s+/g, ' ').trim() || $('title').text().split('-')[0].trim();
                    if (!title || title.length < 3) return;

                    let rawDescription = $('main').text() || $('.container').text() || $('body').text();
                    
                    // 🧨 2. VÉDELMI VONAL: Levágjuk a felesleget! Maximum 4000 karakter mehet be az NLP-be!
                    rawDescription = rawDescription.replace(/\s+/g, ' ').trim().substring(0, 4000);

                    const urlCategory = new URL(jobUrl).pathname.split('/')[1] || "";
                    const finalDesc = `Kategória: ${urlCategory}\n${rawDescription}`;

                    let jobNature = "Pályakezdő", faculty = "Egyéb", finalTags = [], workStyle = "", location = "Magyarország"; 

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
                        title: title, url: jobUrl, apply_url: jobUrl, location: location, 
                        date_posted: new Date().toISOString(), experience_level: jobNature,
                        subsidiary: companyName, employment_type: "Diákmunka",
                        faculty: faculty, work_style: workStyle,
                        tags: Array.isArray(finalTags) ? finalTags : []
                    });
                })(), 6000); 

                await new Promise(r => setTimeout(r, Math.floor(Math.random() * 150) + 100));

            } catch (err) {
                console.log(`\n   ⚠️ [YDIAK] Ugrás! Hiba vagy megfagyott állás (időtúllépés): ${jobUrl}`);
            }
        }

        console.log(`\n   ✔️  [YDIAK] Kész! ${allJobs.length} db valid állás sikeresen megmentve a Sitemap-ből.`);
        return allJobs;

    } catch (err) {
        console.error(`   ❌ [YDIAK] Hiba a Sitemap feldolgozásakor:`, err.message);
        throw err;
    }
};