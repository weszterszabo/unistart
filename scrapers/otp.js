const https = require("https");
const http = require("http");
const zlib = require("zlib");
const cheerio = require("cheerio");
// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "Upgrade-Insecure-Requests": "1"
};

// 🛡️ LÉGMENTESÍTETT WATCHDOG FETCH
function fetchSafe(urlStr, options = {}, timeoutMs = 12000, type = 'json') {
    return new Promise((resolve, reject) => {
        let req; let resStream; let unzipper; let isDone = false;

        const safeResolve = (data) => {
            if (isDone) return; isDone = true; clearTimeout(watchdog); resolve(data);
        };
        const safeReject = (err) => {
            if (isDone) return; isDone = true; clearTimeout(watchdog);
            if (req && !req.destroyed) req.destroy();
            if (resStream && !resStream.destroyed) resStream.destroy();
            if (unzipper && !unzipper.destroyed) unzipper.destroy();
            reject(err);
        };

        const watchdog = setTimeout(() => {
            safeReject(new Error(`Kátránygödör védelem: Abszolút időtúllépés (${timeoutMs}ms)`));
        }, timeoutMs);

        try {
            const parsedUrl = new URL(urlStr);
            const client = parsedUrl.protocol === 'https:' ? https : http;
            
            req = client.request({
                hostname: parsedUrl.hostname, port: parsedUrl.port,
                path: parsedUrl.pathname + parsedUrl.search,
                method: options.method || 'GET',
                headers: { 'Accept-Encoding': 'gzip, deflate', ...options.headers }
            }, (res) => {
                resStream = res;
                res.on('error', (e) => safeReject(new Error(`Response hiba: ${e.message}`)));

                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return safeReject(new Error(`HTTP hiba: ${res.statusCode}`));
                }

                const contentType = (res.headers['content-type'] || "").toLowerCase();
                if (contentType.includes("text/html") && type === 'json') {
                    return safeReject(new Error("WAF/Captcha blokkolás érzékelve az oldalon!"));
                }

                let stream = res;
                const encoding = (res.headers['content-encoding'] || "").toLowerCase();
                if (encoding === 'gzip' || encoding === 'deflate') {
                    unzipper = encoding === 'gzip' ? zlib.createGunzip() : zlib.createInflate();
                    unzipper.on('error', (e) => safeReject(new Error(`Zlib hiba: ${e.message}`)));
                    stream = res.pipe(unzipper);
                }

                let data = '';
                stream.on('data', (chunk) => { data += chunk.toString('utf8'); });
                stream.on('end', () => {
                    try { safeResolve(type === 'json' ? JSON.parse(data) : data); } 
                    catch (e) { safeReject(new Error("Parse hiba")); }
                });
                stream.on('error', (e) => safeReject(new Error(`Stream hiba: ${e.message}`)));
            });

            req.on('error', (e) => safeReject(new Error(`Hálózati hiba: ${e.message}`)));
            if (options.body) req.write(options.body);
            req.end();
        } catch (err) { safeReject(err); }
    });
}

exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  console.log(`   ⬇️ [OTP] Phantom-SAP Scraper elindult...`);
  const allJobs = [];
  let startrow = 0;
  let hasMore = true;
  const seenUrls = new Set();
  const PAGE_SIZE = 25; 

  while (hasMore) {
    const targetUrl = `https://karrier.otpbank.hu/search/?q=&sortColumn=referencedate&sortDirection=desc&startrow=${startrow}`;
    console.log(`   ⬇️ [OTP] Oldal letöltése: startrow=${startrow}`);
    
    try {
      // 🚀 NATÍV HÍVÁS (HTML mód, 'text' paraméter)
      const html = await fetchSafe(targetUrl, { headers: HEADERS }, 12000, 'text');
      const $ = cheerio.load(html);

      const pageTitle = $('title').text().toLowerCase();
      if (pageTitle.includes("just a moment") || pageTitle.includes("cloudflare") || html.includes('id="cf-wrapper"')) {
          throw new Error("WAF (Cloudflare/F5) Captcha blokkolás érzékelve az oldalon!");
      }
      
      let newJobsCount = 0;
      let jobLinks = $('a.jobTitle-link');
      if (jobLinks.length === 0) jobLinks = $('a[href*="/job/"]');

      jobLinks.each((i, el) => {
        let link = $(el).attr('href');
        if (!link) return;
        if (!link.startsWith("http")) link = "https://karrier.otpbank.hu" + link;
        
        if (seenUrls.has(link)) return;
        seenUrls.add(link);
        newJobsCount++;

        const title = $(el).text().replace(/\s+/g, ' ').trim();
        const parentCard = $(el).closest('tr, li, .searchResultItem, .job-row');
        const rawCardText = parentCard.length > 0 ? parentCard.text() : "";

        let location = parentCard.find('.jobLocation, .jobFacility').text().replace(/\s+/g, ' ').trim();
        if (!location) location = "Budapest"; 
        location = location.replace(/,?\s*HU\b/i, '').replace(/,\s*\d{4}/, '').trim(); 

        const department = parentCard.find('.jobDepartment').text().replace(/\s+/g, ' ').trim();
        const analysis = analyzer.analyzeJob(title, rawCardText);

        if (analysis !== null) {
            const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
            const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
            const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
            let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
            if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

            allJobs.push({
              title: title, url: link, apply_url: link, location: location,
              date_posted: parentCard.find('.jobDate').text().trim() || new Date().toISOString(),
              experience_level: jobNature, subsidiary: department || "OTP Bank",
              employment_type: "Teljes munkaidő", faculty: faculty,
              work_style: workStyle, tags: tags
            });
        }
      });

      if (newJobsCount === 0 || newJobsCount < (PAGE_SIZE * 0.5)) { 
        console.log(`   ⏹️ [OTP] Elértük az adatbázis végét.`);
        hasMore = false;
      } else {
        startrow += PAGE_SIZE; 
        await new Promise(r => setTimeout(r, 600 + Math.random() * 500)); 
      }

    } catch (err) {
      console.error(`   ❌ [OTP] Hiba a(z) ${startrow}. sornál:`, err.message);
      if (startrow === 0) throw err;
      hasMore = false;
    }
  }

  console.log(`   ✔️  [OTP] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};