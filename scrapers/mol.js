const https = require('https');
// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ BIZTONSÁGOS KAPCSOLAT: Állami és Akamai lejárt SSL ignorálása, TCP Keep-Alive
const secureAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 10,
    rejectUnauthorized: false
});

// 🛡️ TÖKÉLETES BÖNGÉSZŐ ÁLCA (Chrome 126 ujjlenyomat + Akamai Bypass fejlécek)
const BASE_HEADERS = {
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": "https://molgroup.taleo.net",
    "Referer": "https://molgroup.taleo.net/careersection/mhu/jobsearch.ftl?lang=hu",
    "tz": "GMT+02:00",
    "tzname": "Europe/Budapest",
    "Connection": "keep-alive"
};

// 🔥 SÜTI TÁROLÓ (Ez ment meg a 6. oldali fagyástól!)
let globalCookieMap = new Map();

function updateCookies(setCookieHeader) {
    if (!setCookieHeader) return;
    setCookieHeader.forEach(c => {
        const pair = c.split(';')[0];
        const idx = pair.indexOf('=');
        if (idx > -1) {
            const key = pair.substring(0, idx).trim();
            const val = pair.substring(idx + 1).trim();
            if (key) globalCookieMap.set(key, val);
        }
    });
}

function getCookieString() {
    return Array.from(globalCookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

// 🛡️ BIZTONSÁGOS HTTPS KÉRÉS (Abszolút Kátránygödör védelemmel és Gyorsított Halállal)
async function fetchTaleoApiWithRetry(postDataObj, page, isPreWarm = false) {
    const postData = postDataObj ? JSON.stringify(postDataObj) : "";
    
    // 🔥 JAVÍTÁS: 3 helyett 1 újrapróbálkozás, hogy ne várakoztassa a rendszert 50 másodpercig!
    const maxRetries = 1;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await new Promise((resolve, reject) => {
                let isDone = false;
                let watchdog;
                
                // Csendes lezárók a memóriaszivárgás ellen
                const safeReject = (err) => { 
                    if (!isDone) { isDone = true; clearTimeout(watchdog); reject(err); } 
                };
                const safeResolve = (data) => { 
                    if (!isDone) { isDone = true; clearTimeout(watchdog); resolve(data); } 
                };

                const options = {
                    hostname: 'molgroup.taleo.net',
                    path: isPreWarm ? '/careersection/mhu/jobsearch.ftl?lang=hu' : '/careersection/rest/jobboard/searchjobs?lang=hu&portal=8205100397',
                    method: isPreWarm ? 'GET' : 'POST',
                    agent: secureAgent,
                    headers: { ...BASE_HEADERS }
                };

                if (!isPreWarm) {
                    options.headers['Content-Type'] = 'application/json';
                    options.headers['Content-Length'] = Buffer.byteLength(postData);
                } else {
                    options.headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
                    options.headers['Sec-Fetch-Dest'] = 'document';
                    options.headers['Sec-Fetch-Mode'] = 'navigate';
                }

                // 🍪 Injekciózzuk a memóriából a sütiket a kérésbe!
                const cookieStr = getCookieString();
                if (cookieStr) options.headers['Cookie'] = cookieStr;

                const req = https.request(options, (res) => {
                    updateCookies(res.headers['set-cookie']);

                    const contentType = res.headers['content-type'] || "";
                    if (!isPreWarm && (contentType.includes("text/html") || contentType.includes("text/plain"))) {
                        return safeReject(new Error("WAF / Akamai Tűzfal blokkolás (Nem JSON érkezett)!"));
                    }

                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => safeResolve({ status: res.statusCode, headers: res.headers, data }));
                });

                req.on('error', e => safeReject(new Error(`Hálózati hiba: ${e.message}`)));
                
                // 🔥 ABSZOLÚT WATCHDOG: 10 mp után MINDENKÉPP kíméletlenül elvágja a kábelt!
                watchdog = setTimeout(() => {
                    if (req && !req.destroyed) req.destroy(new Error('Abszolút Tarpit Timeout (10s)'));
                    safeReject(new Error('Taleo Kátránygödör Timeout (10s)'));
                }, 10000);
                
                if (!isPreWarm) req.write(postData);
                req.end();
            });
        } catch (err) {
            if (attempt === maxRetries) throw err;
            if (!isPreWarm) process.stdout.write(`⏳ `); 
            await new Promise(r => setTimeout(r, 1500)); 
        }
    }
}

// ------------------------------------------------------------------
// 🚀 FŐ SCRAPER EXPORT
// ------------------------------------------------------------------
exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  console.log(`   ⬇️ [MOL Group] Páncélozott Taleo API letöltés indul...`);
  const allJobs = [];
  const seenUrls = new Set(knownUrls); 
  
  // 1. LÉPÉS: ELŐMELEGÍTÉS (Session Warm-up)
  console.log(`   🕵️ [MOL] Tűzfal csendes áttörése (Munkamenet inicializálása)...`);
  try {
      await fetchTaleoApiWithRetry(null, 1, true);
      await new Promise(r => setTimeout(r, 800 + Math.random() * 500)); // Emberi késleltetés a "kattintás" előtt
  } catch(e) {
      console.warn(`   ⚠️ [MOL] Előmelegítési hiba, de folytatjuk a fő kéréssel...`);
  }

  let page = 1;
  let hasMore = true;

  while (hasMore) {
    console.log(`   ⬇️ [MOL] Lapozás: ${page}. oldal...`);
    
    const requestBody = {
      "multilineEnabled": false,
      "sortingSelection": { "sortBySelectionParam": "3", "ascendingSortingOrder": "false" },
      "fieldData": {
          "fields": { "KEYWORD": "", "LOCATION": "2205100397" }, // 2205100397 = Magyarország
          "valid": true
      },
      "filterSelectionParam": { "searchFilterSelections": [{ "id": "LOCATION", "selectedValues": [] }] },
      "advancedSearchFiltersSelectionParam": {
          "searchFilterSelections": [
              { "id": "ORGANIZATION", "selectedValues": [] },
              { "id": "LOCATION", "selectedValues": [] },
              { "id": "JOB_FIELD", "selectedValues": [] },
              { "id": "JOB_SCHEDULE", "selectedValues": [] }
          ]
      },
      "pageNo": page
    };

    try {
      const response = await fetchTaleoApiWithRetry(requestBody, page, false);

      if (response.status !== 200) {
        throw new Error(`HTTP hiba! Státusz: ${response.status}`);
      }

      const json = JSON.parse(response.data);
      const jobsList = json.requisitionList || [];

      if (jobsList.length === 0) {
        hasMore = false;
        break;
      }

      let newJobsCount = 0;

      for (const job of jobsList) {
        const columns = job.column || [];
        let title = columns[0] || "Névtelen pozíció";
        
        let jobIdForUrl = job.contestNo || job.jobId || job.requisitionNo || "";
        let jobUrl = jobIdForUrl ? `https://molgroup.taleo.net/careersection/mhu/jobdetail.ftl?job=${jobIdForUrl}&lang=hu` : "";
        
        if (!jobUrl || seenUrls.has(jobUrl)) continue;
        seenUrls.add(jobUrl);
        newJobsCount++;

        // 📍 INTELLIGENS HELYSZÍN KINYERÉS
        let rawLocation = columns[1] || "";
        let location = "Magyarország";
        
        if (rawLocation.includes("Budapest") || rawLocation.includes("Dombóvári")) location = "Budapest";
        else if (rawLocation.includes("Tiszaújváros")) location = "Tiszaújváros";
        else if (rawLocation.includes("Százhalombatta")) location = "Százhalombatta";
        else if (rawLocation.includes("Algyő")) location = "Algyő";
        else if (rawLocation.includes("Siófok")) location = "Siófok";
        else if (rawLocation.includes("Almásfüzitő")) location = "Almásfüzitő";
        else if (rawLocation.includes("Eger")) location = "Eger";
        else if (rawLocation.includes("Győr")) location = "Győr";
        else if (rawLocation.includes("Szeged")) location = "Szeged";
        else if (rawLocation.includes("Nagykanizsa")) location = "Nagykanizsa";
        else {
             const match = rawLocation.match(/Hungary(?:-[^-]+)*-([^"-]+)/i);
             if (match && match[1]) location = match[1].trim();
        }

        const companyLabel = job.company || "MOL Group";
        let department = Array.isArray(job.labels) ? job.labels.join(", ") : "";

        const rawDescription = [
            companyLabel, department, job.organization, ...columns
        ].filter(Boolean).join(" ").replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();

        // 🧠 AI ELEMZÉS
        const analysis = analyzer.analyzeJob(title, rawDescription, companyName);

        // 🛡️ SZELLEMI KAPUŐR
        if (analysis !== null) {
            
            const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
            const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
            const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
            let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
            if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

            let postedDate = new Date().toISOString();
            if (columns[2] && isNaN(Date.parse(columns[2])) === false) {
                postedDate = new Date(columns[2]).toISOString();
            }

            allJobs.push({
              title: title.replace(/\s+/g, ' ').trim(),
              url: jobUrl,
              apply_url: jobUrl,
              location: location,
              date_posted: postedDate,
              experience_level: jobNature, 
              subsidiary: companyLabel !== "MOL Group" ? companyLabel : (department || "MOL Group"),
              employment_type: "Teljes munkaidő",
              faculty: faculty,
              work_style: workStyle,
              tags: tags
            });
        }
      }

      // 🏎️ OKOS EARLY-EXIT ÉS THROTTLING
      const pagingData = json.pagingData || {};
      const totalCount = pagingData.totalCount || 0;
      const currentPage = pagingData.currentPageNo || page;
      const pageSize = pagingData.pageSize || 25;
      
      if ((currentPage * pageSize) >= totalCount || newJobsCount === 0) {
          console.log(`   ⏹️ [MOL] Elértük a lista végét. (Összes állás a szerveren: ${totalCount})`);
          hasMore = false;
      } else {
          page++;
          // 🔥 Lopakodó mód: 1-1.5 másodperc várakozás két oldal között
          await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
      }

    } catch (err) {
      console.error(`\n   ❌ [MOL] Hálózat hiba vagy időtúllépés a ${page}. oldalon:`, err.message);
      
      if (page === 1) {
          throw err; // Először hibázik -> megmentjük a régi adatokat!
      }
      hasMore = false; // Ha lapozás közben szakad meg, kimentjük ami eddig lejött!
    }
  }

  console.log(`   ✔️  [MOL Group] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};