const cheerio = require("cheerio");
const https = require("https");
const http = require("http");
const analyzer = require("../analyzer");

const HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "Upgrade-Insecure-Requests": "1",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
};

const secureAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 10,
    rejectUnauthorized: false
});

// ☢️ NUKLEÁRIS FIZIKAI MEGSZAKÍTÓ (OS Szintű Socket Killer + RAM Pajzs)
async function unbreakableFetchText(targetUrl, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
        let isDone = false;
        let req;
        
        const watchdog = setTimeout(() => {
            if (!isDone) {
                isDone = true;
                if (req && !req.destroyed) req.destroy(new Error('Hard Socket Timeout'));
                reject(new Error('Kátránygödör Timeout'));
            }
        }, timeoutMs);

        try {
            const urlObj = new URL(targetUrl);
            const client = urlObj.protocol === 'http:' ? http : https;
            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                method: 'GET',
                agent: secureAgent,
                headers: HEADERS
            };

            req = client.request(options, (res) => {
                if (res.statusCode >= 400) {
                    if (!isDone) { isDone = true; clearTimeout(watchdog); req.destroy(); reject(new Error(`HTTP ${res.statusCode}`)); }
                    return;
                }

                let data = '';
                res.on('data', chunk => {
                    data += chunk;
                    // 🔥 RAM VÉDELEM: Ha 1 Megabájtnál nagyobb, elvágjuk!
                    if (data.length > 1000000) {
                        if (!isDone) { isDone = true; clearTimeout(watchdog); req.destroy(); resolve(data); }
                    }
                });
                res.on('end', () => {
                    if (!isDone) { isDone = true; clearTimeout(watchdog); resolve(data); }
                });
            });

            req.on('error', e => {
                if (!isDone) { isDone = true; clearTimeout(watchdog); reject(e); }
            });

            req.end();
        } catch (e) {
            if (!isDone) { isDone = true; clearTimeout(watchdog); reject(e); }
        }
    });
}

// ⚡ SEGÉDFÜGGVÉNY: Párhuzamos végrehajtás
async function processInBatches(items, batchSize, asyncFn) {
  let results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(asyncFn));
    results.push(...batchResults);
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
  }
  return results;
}

// 🌍 OMNI-SEARCH AUTO-DISCOVERY
async function discoverSearchUrl(baseUrl) {
    let base = baseUrl.trim().replace(/\/$/, '');
    console.log(`   🕵️ [SAP] Főoldal szonározása a titkos keresővégpontért...`);
    
    let originalParams = new URLSearchParams();
    try { originalParams = new URL(baseUrl).searchParams; } catch(e) {}
    
    try {
        const html = await unbreakableFetchText(base, 10000);
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

    const pathsToTry = ["/search/", "/hu_HU/careers/SearchJobs", "/en_GB/careersmarketplace/SearchJobs", "/search-jobs", "/content/Kereses/"];

    for (let path of pathsToTry) {
        let testUrlObj;
        try {
            testUrlObj = new URL(base.split('?')[0] + path);
            originalParams.forEach((val, key) => testUrlObj.searchParams.set(key, val));
        } catch(e) { continue; }
        
        let testUrl = testUrlObj.toString();
        try {
            await unbreakableFetchText(testUrl, 5000);
            return testUrl; 
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
      const html = await unbreakableFetchText(currentUrl, 15000);
      const $ = cheerio.load(html); // Itt a Cheerio még jó, mert csak listát elemez, nem óriás szöveget

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
          
          let analysis = null;
          try {
              // Delay használata a szinkron hívás előtt, hogy az Event Loop lélegezni tudjon
              await new Promise(r => setImmediate(r));
              
              const analyzePromise = Promise.resolve(analyzer.analyzeJob(job.title, rawDescription, companyName));
              const timeoutPromise = new Promise((_, r) => setTimeout(() => r(new Error("NLP Timeout")), 5000));
              analysis = await Promise.race([analyzePromise, timeoutPromise]);
          } catch(e) {
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

// 🕵️ MÉLYFÚRÓ FÜGGVÉNY - MEMÓRIA BIZTOS (CHEERIO MENTES) VERZIÓ!
async function getDeepDetails(jobUrl, preLoc) {
  let resHtml = null;
  const maxRetries = 1; 

  let finalJobUrl = jobUrl;
  if (!finalJobUrl.includes('locale=')) finalJobUrl += (finalJobUrl.includes('?') ? '&' : '?') + 'locale=hu_HU';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
          resHtml = await unbreakableFetchText(finalJobUrl, 10000);
          break;
      } catch (e) {
          if (attempt === maxRetries) return null; 
          process.stdout.write(`⏳ `);
          await new Promise(r => setTimeout(r, 2000));
      }
  }

  if (!resHtml) return null;
  
  try {
    let details = { location: preLoc || "Magyarország", employment_type: "", experience_level: "", subsidiary: "", department: "", datePosted: new Date().toISOString(), salary: "", reqId: "", rawText: "" };
    let schemaDescription = "";

    // 🔥 1. JSON-LD KINYERÉS REGEX-SZEL (Cheerio helyett)
    const jsonLdMatches = [...resHtml.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const match of jsonLdMatches) {
        try {
            const data = JSON.parse(match[1].replace(/[\u0000-\u0019]+/g,""));
            const items = Array.isArray(data) ? data : (data["@graph"] || [data]);
            items.forEach(item => {
                if (item['@type'] === 'JobPosting') {
                    if (item.datePosted) details.datePosted = item.datePosted;
                    if (item.employmentType) details.employment_type = Array.isArray(item.employmentType) ? item.employmentType.join(", ") : item.employmentType;
                    if (item.jobLocation) {
                        const locs = Array.isArray(item.jobLocation) ? item.jobLocation : [item.jobLocation];
                        const locParts = [];
                        locs.forEach(l => {
                            if (l.address && l.address.addressLocality) locParts.push(l.address.addressLocality);
                        });
                        if (locParts.length > 0) details.location = locParts.join(", ");
                    }
                    if (item.description) schemaDescription = item.description; 
                }
            });
        } catch(e) {}
    }

    details.location = details.location.replace(/\bHU\b|Hungary|Magyarország|\b\d{4}\b/gi, '').replace(/,\s*,/g, ',').replace(/(^,)|(,$)/g, '').trim() || "Magyarország";

    if (/(croatia|slovenia|romania|italy|slovakia|czech|poland|serbia|hrvatska|zagreb|split|osijek|rijeka|ljubljana|koper|maribor|cluj|bucharest)/i.test(details.location)) {
        return null; 
    }

    // 🔥 2. SZÖVEG TISZTÍTÁS ÉS HTML ELTÁVOLÍTÁS REGEX-SZEL (Ettől 150x kevesebb RAM-ot használ!)
    let cleanText = resHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
                           .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
                           .replace(/<[^>]*>?/gm, ' ')
                           .replace(/\s+/g, ' ')
                           .trim();
                           
    // Processzor védelem: Max 8000 karakter!
    cleanText = cleanText.substring(0, 8000);

    if (!details.employment_type) {
        const empMatch = cleanText.match(/(?:foglalkoztatás típusa|foglalkoztatás jellege|munkaidő)[:\s]+([a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ\s-]{3,30})(?:\s|$)/i);
        if (empMatch) details.employment_type = empMatch[1].trim();
    }
    if (!details.experience_level) {
        const expMatch = cleanText.match(/tapasztalati szint[:\s]+([a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ\s-]{3,30})(?:\s|$)/i);
        if (expMatch) details.experience_level = expMatch[1].trim();
    }

    if (cleanText.length < 30 && schemaDescription) {
        cleanText = schemaDescription.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().substring(0, 8000);
    }

    details.rawText = cleanText;
    return details;
  } catch (e) {
    return null; 
  }
}