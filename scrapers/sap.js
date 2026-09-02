const cheerio = require("cheerio");
const https = require("https");
const http = require("http");
const zlib = require("zlib");
// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ Stealth Headers: SAP SuccessFactors WAF elleni védelem
const HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Upgrade-Insecure-Requests": "1"
};

// 🛡️ LÉGMENTESÍTETT WATCHDOG FETCH + ÁTIRÁNYÍTÁS (REDIRECT) KÖVETŐVEL!
function fetchSafe(urlStr, options = {}, timeoutMs = 15000, redirectCount = 0) {
    if (redirectCount > 5) return Promise.reject(new Error("Végtelen átirányítási hurok (Redirect Loop)!"));
    
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

                // 🔀 ÁTIRÁNYÍTÁS KÖVETÉSE (301, 302, 303, 307, 308)
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    clearTimeout(watchdog);
                    const nextUrl = new URL(res.headers.location, urlStr).href;
                    return resolve(fetchSafe(nextUrl, options, timeoutMs, redirectCount + 1));
                }

                if (res.statusCode < 200 || res.statusCode >= 400) {
                    return safeReject(new Error(`HTTP hiba: ${res.statusCode}`));
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
                stream.on('end', () => safeResolve(data));
                stream.on('error', (e) => safeReject(new Error(`Stream hiba: ${e.message}`)));
            });

            req.on('error', (e) => safeReject(new Error(`Hálózati hiba: ${e.message}`)));
            req.end();
        } catch (err) { safeReject(err); }
    });
}

// ⚡ SEGÉDFÜGGVÉNY: Párhuzamos végrehajtás blokkokban
async function processInBatches(items, batchSize, asyncFn) {
  let results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(asyncFn));
    results.push(...batchResults);
    await new Promise(r => setTimeout(r, 400 + Math.random() * 400));
  }
  return results;
}

// 🌍 OMNI-SEARCH AUTO-DISCOVERY V2.0 (HTML-Szonárral)
async function discoverSearchUrl(baseUrl) {
    let base = baseUrl.trim().replace(/\/$/, '');
    console.log(`   🕵️ [SAP] Főoldal szonározása a titkos keresővégpontért...`);
    
    try {
        const html = await fetchSafe(base, { headers: HEADERS }, 12000);
        const $ = cheerio.load(html);
        let bestLink = null;

        // Keresünk minden form-ot és linket, ami a keresőre mutathat
        $('a, form').each((i, el) => {
            const href = $(el).attr('href') || $(el).attr('action');
            if (href && (href.toLowerCase().includes('/search') || href.toLowerCase().includes('searchjobs') || href.toLowerCase().includes('jobsearch') || href.toLowerCase().includes('/jobs'))) {
                // Biztosítjuk, hogy nem egy konkrét állás hivatkozása
                if (!href.toLowerCase().includes('/job/') && !href.toLowerCase().includes('/position/')) {
                    bestLink = href;
                }
            }
        });

        if (bestLink) {
            let resolved = bestLink.startsWith('http') ? bestLink : new URL(bestLink, base).href;
            resolved = resolved.split('?')[0]; 
            console.log(`   💡 [SAP] Szonár találat: ${resolved}`);
            return resolved;
        }
    } catch (e) {
        console.warn(`   ⚠️ [SAP] Szonár nem talált egyértelmű formot (${e.message}). Váltás bruteforce-ra...`);
    }

    // Ha a szonár elbukik, végigpróbáljuk a legnépszerűbb SAP végpontokat
    const pathsToTry = [
        "/search/", 
        "/hu_HU/careers/SearchJobs", 
        "/en_GB/careersmarketplace/SearchJobs", 
        "/search-jobs", 
        "/content/Kereses/"
    ];

    for (let path of pathsToTry) {
        let testUrl = base + path;
        try {
            await fetchSafe(testUrl, { method: 'GET', headers: HEADERS }, 4000);
            return testUrl; // Ha visszatér hibakód nélkül, ez lesz a jó
        } catch (e) { continue; }
    }

    return base + "/search/"; // Default végső mentsvár
}

exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  console.log(`   ⬇️ [SAP] Phantom-DeepScrape letöltése indul...`);
  const allJobs = [];
  const seenUrls = new Set();
  
  knownUrls.forEach(url => seenUrls.add(url));
  
  let startrow = 0;
  const step = 25; 
  let hasMore = true;
  let page = 1;

  // 🌍 OMNI-SEARCH START
  const searchBaseUrl = await discoverSearchUrl(baseUrl);
  
  while (hasMore) {
    let currentUrl;
    try {
        const urlObj = new URL(searchBaseUrl);
        if (!urlObj.searchParams.has('sortColumn')) urlObj.searchParams.append('sortColumn', 'referencedate');
        if (!urlObj.searchParams.has('sortDirection')) urlObj.searchParams.append('sortDirection', 'desc');
        if (!urlObj.searchParams.has('locale')) urlObj.searchParams.append('locale', 'hu_HU');
        
        urlObj.searchParams.set('startrow', startrow.toString());
        currentUrl = urlObj.toString();
    } catch (e) {
        console.error(`   ❌ [SAP] Érvénytelen alap URL lett megadva: ${searchBaseUrl}`);
        throw e;
    }
    
    console.log(`   ⬇️ [SAP] Oldal ${page} (Állások ${startrow}-től) letöltése...`);
    
    try {
      const html = await fetchSafe(currentUrl, { headers: HEADERS }, 15000);
      const $ = cheerio.load(html);

      // WAF Ellenőrzés
      const pageTitle = $('title').text().toLowerCase();
      if (pageTitle.includes("just a moment") || pageTitle.includes("cloudflare") || html.includes('id="cf-wrapper"')) {
          throw new Error("WAF (Cloudflare/F5) Captcha blokkolás érzékelve!");
      }
      
      const pageLinks = [];
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        let text = $(el).text().trim().replace(/\s+/g, ' ');
        text = text.replace(/\s*\([m|f|d|w|x|n|\/]+\)\s*/gi, ' ').trim();

        // 🔭 UNIVERZÁLIS REGEX: Bármi, ami nyomokban állásnak tűnik az SAP-ban
        if (href && (href.match(/\/(job|position|career|JobDetail|opportunities|jobs)\//i) || href.match(/jobid=/i)) && text.length > 5) {
          let cleanHref = href.startsWith('http') ? href : new URL(href, currentUrl).href;
          cleanHref = cleanHref.split('?')[0]; 
          pageLinks.push({ title: text, url: cleanHref });
        }
      });

      const uniqueOnPage = pageLinks.filter((v, i, a) => a.findIndex(t => (t.url === v.url)) === i);
      const newJobsToProcess = uniqueOnPage.filter(job => !seenUrls.has(job.url));
      
      if (newJobsToProcess.length === 0) {
        console.log(`   ⏹️ [SAP] Nincs több ÚJ állás az oldalon.`);
        hasMore = false;
        break;
      }

      newJobsToProcess.forEach(job => seenUrls.add(job.url));

      // 🏎️ PÁRHUZAMOS MÉLYFÚRÁS
      console.log(`   ⚡ [SAP] ${newJobsToProcess.length} db aloldal feldolgozása párhuzamosan...`);
      
      const processedJobs = await processInBatches(newJobsToProcess, 5, async (job) => {
          const details = await getDeepDetails(job.url);
          if (!details) {
              process.stdout.write(`❌ `);
              return null;
          }
          process.stdout.write(`✔️ `);

          const rawDescription = `${details.employment_type} ${details.experience_level} ${details.subsidiary} ${details.department} ${details.salary} ${details.reqId} ${details.rawText}`;
          let analysis = null;
          
          try {
              const analyzeTask = analyzer.analyzeJob(job.title, rawDescription, companyName);
              const timeoutTask = new Promise((_, r) => setTimeout(() => r(new Error("NLP Timeout")), 5000));
              analysis = await Promise.race([analyzeTask, timeoutTask]);
              await new Promise(r => setTimeout(r, 50)); 
          } catch (e) {
              return null; 
          }

          if (analysis !== null) {
              const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
              const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
              const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
              let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
              if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

              return {
                title: job.title,
                url: job.url,
                apply_url: job.url,
                location: details.location || "Nincs megadva",
                date_posted: details.datePosted || new Date().toISOString(),
                experience_level: jobNature, 
                subsidiary: details.subsidiary || companyName,
                employment_type: details.employment_type || "Teljes munkaidő",
                faculty: faculty,
                work_style: workStyle,
                tags: tags
              };
          }
          return null;
      });

      console.log(""); 

      const validJuniorJobs = processedJobs.filter(j => j !== null);
      allJobs.push(...validJuniorJobs);

      if (uniqueOnPage.length < step) {
        hasMore = false;
        console.log(`   ⏹️ [SAP] Elértük az utolsó oldalt (${uniqueOnPage.length} db állás volt a listában).`);
      } else {
        startrow += step;
        page++;
      }

    } catch (err) {
      console.error(`   ❌ [SAP] Hiba:`, err.message);
      if (page === 1) throw err;
      hasMore = false;
    }
  }
  
  console.log(`   ✔️  [SAP] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};

// 🕵️ MÉLYFÚRÓ FÜGGVÉNY
async function getDeepDetails(jobUrl) {
  let resHtml = null;
  const maxRetries = 1;

  let finalJobUrl = jobUrl;
  if (!finalJobUrl.includes('locale=')) finalJobUrl += (finalJobUrl.includes('?') ? '&' : '?') + 'locale=hu_HU';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
          resHtml = await fetchSafe(finalJobUrl, { headers: HEADERS }, 10000);
          break;
      } catch (e) {
          if (attempt === maxRetries) return null; 
          await new Promise(r => setTimeout(r, 800 + Math.random() * 500));
      }
  }

  if (!resHtml) return null;
  
  try {
    const $ = cheerio.load(resHtml);
    let details = { location: "", employment_type: "", experience_level: "", subsidiary: "", department: "", datePosted: "", salary: "", reqId: "", rawText: "" };
    let schemaDescription = "";

    $('script[type="application/ld+json"]').each((i, el) => {
        try {
            const data = JSON.parse($(el).html().replace(/[\u0000-\u0019]+/g,""));
            const items = Array.isArray(data) ? data : (data["@graph"] || [data]);
            items.forEach(item => {
                if (item['@type'] === 'JobPosting') {
                    if (item.datePosted) details.datePosted = item.datePosted;
                    if (item.employmentType) details.employment_type = Array.isArray(item.employmentType) ? item.employmentType.join(", ") : item.employmentType;
                    if (item.jobLocation && item.jobLocation.address && item.jobLocation.address.addressLocality) details.location = item.jobLocation.address.addressLocality;
                    if (item.baseSalary) details.salary = JSON.stringify(item.baseSalary);
                    if (item.description) schemaDescription = item.description; 
                }
            });
        } catch(e) {}
    });

    if (!details.datePosted) {
        const metaDate = $('meta[itemprop="datePosted"]').attr('content');
        if (metaDate) details.datePosted = metaDate;
    }
    
    if (details.datePosted) {
        try {
            const parsedDate = new Date(details.datePosted);
            if (!isNaN(parsedDate.getTime())) details.datePosted = parsedDate.toISOString();
            else details.datePosted = new Date().toISOString(); 
        } catch (e) { details.datePosted = new Date().toISOString(); }
    }

    if (!details.location) {
        let locFound = $('.jobGeoLocation, .job-location, .location, span[itemprop="jobLocation"], span[itemprop="addressLocality"]').first().text().trim();
        if (locFound && locFound.length < 80) {
            locFound = locFound.replace(/\n/g, ' ').replace(/\s+/g, ' ');
            locFound = locFound.replace(/\bHU\b/gi, '').replace(/\bHungary\b/gi, '').replace(/\bMagyarország\b/gi, '').replace(/\b\d{4}\b/g, '');
            details.location = locFound.replace(/,\s*,/g, ',').replace(/(^,)|(,$)/g, '').trim();
            if (details.location === "") details.location = "Magyarország";
        }
    }

    let depFound = $('.jobDepartment, .department, .category, .jobFacility, span[itemprop="occupationalCategory"]').first().text().trim();
    if (depFound && depFound.length < 80) details.department = depFound;

    if (!details.salary) {
        let salaryFound = $('span[itemprop="baseSalary"], .jobSalary').first().text().trim();
        if (salaryFound && salaryFound.length < 50) details.salary = salaryFound;
    }
    
    let reqIdFound = $('.jobReqId, .job-id, span[itemprop="value"]').first().text().trim();
    if (reqIdFound && reqIdFound.length < 30) details.reqId = `Ref ID: ${reqIdFound}`;

    $('span, p, div, li, b, strong').each((i, el) => {
      const txt = $(el).text().replace(/\s+/g, ' ').trim();
      const lower = txt.toLowerCase();

      if (!details.employment_type && (lower.includes('foglalkoztatás típusa') || lower.includes('foglalkoztatás jellege') || lower.includes('munkaidő'))) {
        let val = $(el).next().text().trim() || txt.split(':')[1]?.trim() || txt.replace(/foglalkoztatás (típusa|jellege):?/i, '').replace(/munkaidő:?/i, '').trim();
        if(val.length < 50) details.employment_type = val;
      }
      if (!details.experience_level && lower.includes('tapasztalati szint')) {
        let val = $(el).next().text().trim() || txt.split(':')[1]?.trim() || txt.replace(/tapasztalati szint:?/i, '').trim();
        if(val.length < 50) details.experience_level = val;
      }
    });

    $('script, style, nav, footer, header, svg, button, iframe, noscript, img').remove();
    
    let metaDesc = $('meta[property="og:description"], meta[name="description"]').attr('content') || "";
    details.rawText = $('body').text().replace(/\s+/g, ' ').trim();

    if (details.rawText.length < 30 && schemaDescription) {
        details.rawText = cheerio.load(schemaDescription).text().replace(/\s+/g, ' ').trim();
    }

    let extraContext = "";
    if (details.department) extraContext += `Részleg/Kategória: ${details.department}`;
    if (details.salary && typeof details.salary === 'string') extraContext += ` | Fizetés: ${details.salary}`;
    if (metaDesc && !details.rawText.includes(metaDesc.substring(0, 20))) extraContext += ` | Összefoglaló: ${metaDesc}`;

    if (extraContext !== "") details.rawText = `${extraContext} | ` + details.rawText;

    return details;
  } catch (e) {
    return null; 
  }
}