const cheerio = require("cheerio");
// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ Stealth Headers: SAP SuccessFactors WAF elleni védelem
const HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "Upgrade-Insecure-Requests": "1"
};

// ⚡ SEGÉDFÜGGVÉNY: Párhuzamos végrehajtás blokkokban
async function processInBatches(items, batchSize, asyncFn) {
  let results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(asyncFn));
    results.push(...batchResults);
    // Extra pihenőidő, hogy az SAP ne érezze DDoS támadásnak (Tarpit elkerülése)
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
  }
  return results;
}

// 🌍 OMNI-SEARCH AUTO-DISCOVERY V2.0 (HTML-Szonárral)
async function discoverSearchUrl(baseUrl) {
    let base = baseUrl.trim().replace(/\/$/, '');
    console.log(`   🕵️ [SAP] Főoldal szonározása a titkos keresővégpontért...`);
    
    let originalParams = new URLSearchParams();
    try { originalParams = new URL(baseUrl).searchParams; } catch(e) {}
    
    try {
        // 🔥 ITT MÁR A NATÍV, BIZTONSÁGOS FETCH-ET HASZNÁLJUK! (A Hóhér védi!)
        const response = await fetch(base, { headers: HEADERS });
        if (!response.ok) throw new Error(`HTTP hiba: ${response.status}`);
        const html = await response.text();
        
        const $ = cheerio.load(html);
        let bestLink = null;

        $('a, form').each((i, el) => {
            const href = $(el).attr('href') || $(el).attr('action');
            if (href && (href.toLowerCase().includes('/search') || href.toLowerCase().includes('searchjobs') || href.toLowerCase().includes('jobsearch') || href.toLowerCase().includes('/jobs'))) {
                if (!href.toLowerCase().includes('/job/') && !href.toLowerCase().includes('/position/')) {
                    bestLink = href;
                }
            }
        });

        if (bestLink) {
            let resolved = bestLink.startsWith('http') ? bestLink : new URL(bestLink, base).href;
            const resolvedUrlObj = new URL(resolved.split('?')[0]);
            originalParams.forEach((val, key) => resolvedUrlObj.searchParams.set(key, val));
            console.log(`   💡 [SAP] Szonár találat: ${resolvedUrlObj.toString()}`);
            return resolvedUrlObj.toString();
        }
    } catch (e) {
        console.warn(`   ⚠️ [SAP] Szonár nem talált egyértelmű formot. Váltás bruteforce-ra...`);
    }

    const pathsToTry = [
        "/search/", 
        "/hu_HU/careers/SearchJobs", 
        "/en_GB/careersmarketplace/SearchJobs", 
        "/search-jobs", 
        "/content/Kereses/"
    ];

    for (let path of pathsToTry) {
        let testUrlObj;
        try {
            testUrlObj = new URL(base.split('?')[0] + path);
            originalParams.forEach((val, key) => testUrlObj.searchParams.set(key, val));
        } catch(e) { continue; }
        
        let testUrl = testUrlObj.toString();
        try {
            const testRes = await fetch(testUrl, { method: 'GET', headers: HEADERS });
            if (testRes.ok) return testUrl; 
        } catch (e) { continue; }
    }

    const defaultUrlObj = new URL(base.split('?')[0] + "/search/");
    originalParams.forEach((val, key) => defaultUrlObj.searchParams.set(key, val));
    return defaultUrlObj.toString();
}

exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  console.log(`   ⬇️ [SAP] Phantom-DeepScrape letöltése indul...`);
  const allJobs = [];
  const seenUrls = new Set(knownUrls);
  
  let startrow = 0;
  const step = 25; 
  let hasMore = true;
  let page = 1;

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
      const response = await fetch(currentUrl, { headers: HEADERS });
      if (!response.ok) throw new Error(`HTTP Hiba: ${response.status}`);
      const html = await response.text();
      
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

        let preLoc = $(el).closest('tr, li, .job-tile').find('.jobFacility, .jobLocation, .location, span.jobLocation').text().trim();

        if (href && (href.match(/\/(job|position|career|JobDetail|opportunities|jobs)\//i) || href.match(/jobid=/i)) && text.length > 5) {
          if (/\b(m\/ž|za|odnose|mjesto|klijentima|poslovalnici|persoane|serviciu|prihvatom|svetovalec|radno|suradnik)\b/i.test(text)) return;
          if (/(croatia|slovenia|romania|italy|slovakia|serbia|hrvatska)/i.test(preLoc)) return;

          let cleanHref = href.startsWith('http') ? href : new URL(href, currentUrl).href;
          cleanHref = cleanHref.split('?')[0]; 
          pageLinks.push({ title: text, url: cleanHref, preLoc: preLoc });
        }
      });

      const uniqueOnPage = pageLinks.filter((v, i, a) => a.findIndex(t => (t.url === v.url)) === i);
      const jobsToProcess = uniqueOnPage.filter(job => !seenUrls.has(job.url));
      
      if (jobsToProcess.length === 0) {
        console.log(`   ⏹️ [SAP] Nincs több érvényes/új állás az oldalon.`);
        hasMore = false;
        break;
      }

      jobsToProcess.forEach(job => seenUrls.add(job.url));

      console.log(`   ⚡ [SAP] ${jobsToProcess.length} db aloldal feldolgozása lopakodó módban (2 szálon)...`);
      
      const processedJobs = await processInBatches(jobsToProcess, 2, async (job) => {
          const details = await getDeepDetails(job.url, job.preLoc);
          if (!details) {
              process.stdout.write(`❌ `);
              return null;
          }
          process.stdout.write(`✔️ `);

          const rawDescription = `${details.employment_type} ${details.experience_level} ${details.subsidiary} ${details.department} ${details.salary} ${details.reqId} ${details.rawText}`;
          
          const analysis = analyzer.analyzeJob(job.title, rawDescription, companyName);

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

// 🕵️ MÉLYFÚRÓ FÜGGVÉNY - TITÁNIUM VÉDELEMMEL
async function getDeepDetails(jobUrl, preLoc) {
  let resHtml = null;
  const maxRetries = 1; 

  let finalJobUrl = jobUrl;
  if (!finalJobUrl.includes('locale=')) finalJobUrl += (finalJobUrl.includes('?') ? '&' : '?') + 'locale=hu_HU';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
          // 🔥 A NATÍV FETCH HASZNÁLATA (A Hóhér 15mp után levágja, ha megfagy!)
          const response = await fetch(finalJobUrl, { headers: HEADERS });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          resHtml = await response.text();
          break;
      } catch (e) {
          if (attempt === maxRetries) return null; 
          process.stdout.write(`⏳ `);
          await new Promise(r => setTimeout(r, 2000 + Math.random() * 1500));
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
                    
                    if (item.jobLocation) {
                        const locs = Array.isArray(item.jobLocation) ? item.jobLocation : [item.jobLocation];
                        const locParts = [];
                        locs.forEach(l => {
                            if (l.address) {
                                if (l.address.addressLocality) locParts.push(l.address.addressLocality);
                                if (l.address.addressRegion) locParts.push(l.address.addressRegion);
                                if (l.address.addressCountry) locParts.push(l.address.addressCountry);
                            }
                        });
                        if (locParts.length > 0) details.location = locParts.join(", ");
                    }
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
        }
    }
    if (!details.location && preLoc) details.location = preLoc;

    if (details.location && /(croatia|slovenia|romania|italy|slovakia|czech|poland|serbia|hrvatska|zagreb|split|osijek|rijeka|ljubljana|koper|maribor|cluj|bucharest)/i.test(details.location)) {
        return null; 
    }

    if (details.location) {
        details.location = details.location.replace(/\n/g, ', ').replace(/\s+/g, ' ').trim();
        if (details.location === "") details.location = "Magyarország";
    } else {
        details.location = "Magyarország"; 
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