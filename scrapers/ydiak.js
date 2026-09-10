const https = require('https');
const cheerio = require("cheerio");
const analyzer = require("../analyzer");

const HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

const stripHtml = (html) => {
    if (!html) return "";
    return html.toString().replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
};

function vipDownload(urlStr) {
    return new Promise((resolve) => {
        const req = https.get(urlStr, {
            headers: HEADERS,
            agent: new https.Agent({ keepAlive: false })
        }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return resolve(null);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', () => resolve(null));
        req.setTimeout(5000, () => {
            req.destroy();
            resolve(null);
        });
    });
}

exports.scrape = async function(companyName = "Y Diákszövetkezet", baseUrl = "https://ydiak.hu", knownUrls = []) {
    const allJobs = [];
    const seenUrls = new Set();
    
    console.log(`   🚀 [YDIAK SITEMAP SCRAPER] Indulás: ${companyName}`);

    try {
        const originUrl = new URL(baseUrl).origin;
        console.log(`   🗺️ [YDIAK] Oldaltérkép lekérése innen: ${originUrl}/sitemap.xml`);
        
        const sitemapXml = await vipDownload(`${originUrl}/sitemap.xml`);
        if (!sitemapXml) throw new Error("Nem sikerült letölteni a sitemap-ot!");
        
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
                    !url.includes('/uploads/') &&
                    !url.includes('blog')
                ) {
                    if (!seenUrls.has(url) && !knownUrls.includes(url)) {
                        jobUrls.push(url);
                        seenUrls.add(url);
                    }
                }
            } catch (e) {}
        }

        console.log(`   🎯 [YDIAK] ${jobUrls.length} db érvényes állás link kiszűrve! Letöltés indul...`);

        // 4. ÁLLÁSOK LETÖLTÉSE (NYOMKÖVETŐ MÓD)
        for (let i = 0; i < jobUrls.length; i++) {
            const jobUrl = jobUrls[i];
            
            console.log(`\n▶️ [YDIAK] ${i + 1} / ${jobUrls.length} feldolgozása indul: ${jobUrl}`);
            
            console.log(`   ├─ 1. Letöltés...`);
            const html = await vipDownload(jobUrl);
            if (!html) { console.log(`   └─ ❌ Ugrás (Hálózati hiba)`); continue; }

            console.log(`   ├─ 2. Cheerio betöltés és tisztítás...`);
            const $ = cheerio.load(html);
            $('script, style, noscript, iframe, svg, meta, link').remove();

            let title = $('h1').first().text().replace(/\s+/g, ' ').trim() || $('title').text().split('-')[0].trim();
            if (!title || title.length < 3) {
                console.log(`   └─ ❌ Ugrás (Nincs cím)`);
                continue;
            }

            let rawDescription = $('main').text() || $('.container').text() || $('body').text();
            
            rawDescription = stripHtml(rawDescription);
            rawDescription = rawDescription.replace(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ.,:;?!%\-\s]/g, ' ');
            rawDescription = rawDescription.replace(/\s+/g, ' ').trim().substring(0, 1500);

            const urlCategory = new URL(jobUrl).pathname.split('/')[1] || "";
            const finalDesc = `Kategória: ${urlCategory}\n${rawDescription}`;

            let jobNature = "Pályakezdő", faculty = "Egyéb", finalTags = [], workStyle = "", location = "Magyarország"; 

            console.log(`   ├─ 3. NLP agy hívása (Cím: ${title})`);
            
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

            console.log(`   └─ 4. Kész! NLP végzett, állás mentve.`);

            allJobs.push({
                title: title, url: jobUrl, apply_url: jobUrl, location: location, 
                date_posted: new Date().toISOString(), experience_level: jobNature,
                subsidiary: companyName, employment_type: "Diákmunka",
                faculty: faculty, work_style: workStyle,
                tags: Array.isArray(finalTags) ? finalTags : []
            });

            await new Promise(r => setTimeout(r, 100));
        }

        console.log(`\n   ✔️  [YDIAK] Kész! ${allJobs.length} db valid állás sikeresen megmentve a Sitemap-ből.`);
        return allJobs;

    } catch (err) {
        console.error(`   ❌ [YDIAK] Hiba a Sitemap feldolgozásakor:`, err.message);
        throw err;
    }
};