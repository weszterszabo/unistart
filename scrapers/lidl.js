const https = require("https");
const http = require("http");
const zlib = require("zlib");
// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

const HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Referer": "https://jobs.lidl.hu/kereses-es-jelentkezes/allasok"
};

// 🛡️ LÉGMENTESÍTETT WATCHDOG FETCH (Nincs több néma Node.js összeomlás!)
function fetchSafe(urlStr, options = {}, timeoutMs = 12000, type = 'json') {
    return new Promise((resolve, reject) => {
        let req;
        let resStream;
        let unzipper;
        let isDone = false;

        const safeResolve = (data) => {
            if (isDone) return;
            isDone = true;
            clearTimeout(watchdog);
            resolve(data);
        };

        const safeReject = (err) => {
            if (isDone) return;
            isDone = true;
            clearTimeout(watchdog);
            // Minden adatfolyamot biztonságosan lezárunk
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
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname + parsedUrl.search,
                method: options.method || 'GET',
                headers: { 'Accept-Encoding': 'gzip, deflate', ...options.headers }
            }, (res) => {
                resStream = res;
                // 🔥 KULCSFONTOSSÁGÚ: Elkapjuk a megszakítás okozta sokk-hibát!
                res.on('error', (e) => safeReject(new Error(`Response hiba: ${e.message}`)));

                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return safeReject(new Error(`HTTP hiba: ${res.statusCode}`));
                }

                const contentType = (res.headers['content-type'] || "").toLowerCase();
                if (contentType.includes("text/html") && type === 'json') {
                    return safeReject(new Error("WAF/Captcha blokkolás érzékelve a JSON végponton!"));
                }

                let stream = res;
                const encoding = (res.headers['content-encoding'] || "").toLowerCase();
                if (encoding === 'gzip' || encoding === 'deflate') {
                    unzipper = encoding === 'gzip' ? zlib.createGunzip() : zlib.createInflate();
                    // 🔥 Szintén elkapjuk a kitömörítő összeomlását
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
        } catch (err) {
            safeReject(err);
        }
    });
}

exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  console.log(`   ⬇️ [LIDL] Phantom-API letöltése indul...`);
  const allJobs = [];
  const seenUrls = new Set(); 
  
  let page = 1; 
  let hasMore = true;
  const PAGE_SIZE = 100;

  while (hasMore) {
    console.log(`   ⬇️ [LIDL] Lapozás: ${page}. oldal...`);
    
    const queryObj = { page: page, resultsPerPage: PAGE_SIZE, sortField: "", sortOrder: "asc" };
    const encodedQuery = encodeURIComponent(JSON.stringify(queryObj));
    const apiUrl = `https://jobs.lidl.hu/api/v1/search?general=${encodedQuery}`;

    try {
      const json = await fetchSafe(apiUrl, { method: "GET", headers: HEADERS }, 12000, 'json');

      const jobsList = json.jobs || [];
      if (jobsList.length === 0) { hasMore = false; break; }

      let newJobsCount = 0;

      for (const job of jobsList) {
        const title = job.title || "Névtelen pozíció";
        
        let jobUrl = job.jobDetailUrl || job.url || "";
        if (!jobUrl && job.id) jobUrl = `/jobs/${job.id}`; 
        if (jobUrl && !jobUrl.startsWith("http")) jobUrl = "https://jobs.lidl.hu" + (jobUrl.startsWith("/") ? "" : "/") + jobUrl;

        if (!jobUrl || seenUrls.has(jobUrl)) continue;
        seenUrls.add(jobUrl);
        newJobsCount++;

        const experience = job.entryLevel || ""; 
        const department = job.employmentArea || job.jobCategory || "";
        const type = job.contractType || job.workingHours || "Teljes munkaidő";
        
        const rawDescription = [
            experience, department, type,
            job.description, job.profile, job.tasks, job.requirements, job.benefits
        ].filter(Boolean).join(" ").replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();

        const analysis = analyzer.analyzeJob(title, rawDescription);

        if (analysis !== null) {
            const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
            const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
            const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
            let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
            if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

            let location = "Magyarország";
            if (job.location && (job.location.city || job.location.name)) {
                location = job.location.city || job.location.name;
                if (job.location.zipCode && !location.includes(job.location.zipCode)) {
                    location = `${job.location.zipCode} ${location}`;
                }
            } else if (job.city) {
                location = job.city;
            }

            allJobs.push({
              title: title.replace(/\s+/g, ' ').trim(),
              url: jobUrl,
              apply_url: jobUrl,
              location: location.replace(/\s+/g, ' ').trim(),
              date_posted: job.onlineFrom || job.modifiedTime || new Date().toISOString(),
              experience_level: jobNature, 
              subsidiary: department || "Lidl Magyarország",
              employment_type: type,
              faculty: faculty,
              work_style: workStyle,
              tags: tags
            });
        }
      }

      if (jobsList.length < PAGE_SIZE || newJobsCount === 0) {
        console.log(`   ⏹️ [LIDL] Utolsó oldal (${jobsList.length} db).`);
        hasMore = false;
      } else {
        page++;
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
      }

    } catch (err) {
      console.error(`   ❌ [LIDL] Hálózat hiba a ${page}. oldalon:`, err.message);
      if (page === 1) throw err;
      hasMore = false;
    }
  }

  console.log(`   ✔️  [LIDL] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};