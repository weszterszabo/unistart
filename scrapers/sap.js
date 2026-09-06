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

const secureAgent = new https.Agent({ keepAlive: true, maxSockets: 10, rejectUnauthorized: false });

// ☢️ NUKLEÁRIS FIZIKAI MEGSZAKÍTÓ ÉS EXTRÉM RAM PAJZS
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
            const options = { hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: 'GET', agent: secureAgent, headers: HEADERS };

            req = client.request(options, (res) => {
                if (res.statusCode >= 400) {
                    if (!isDone) { isDone = true; clearTimeout(watchdog); req.destroy(); reject(new Error(`HTTP ${res.statusCode}`)); }
                    return;
                }

                let data = '';
                res.on('data', chunk => {
                    data += chunk;
                    // 🔥 EXTRÉM RAM VÉDELEM: 150 KB-nál könyörtelenül elvágjuk a letöltést!
                    // A VW oldalak alján több MB felesleges JSON van, ezt sosem engedjük a memóriába!
                    if (data.length > 150000) {
                        if (!isDone) { isDone = true; clearTimeout(watchdog); req.destroy(); resolve(data); }
                    }
                });
                res.on('end', () => {
                    if (!isDone) { isDone = true; clearTimeout(watchdog); resolve(data); }
                });
            });

            req.on('error', e => { if (!isDone) { isDone = true; clearTimeout(watchdog); reject(e); } });
            req.end();
        } catch (e) {
            if (!isDone) { isDone = true; clearTimeout(watchdog); reject(e); }
        }
    });
}

// ⚡ SEGÉDFÜGGVÉNY: Párhuzamos végrehajtás + GC
async function processInBatches(items, batchSize, asyncFn) {
  let results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(asyncFn));
    results.push(...batchResults);
    
    // Kényszerített GC minden batch után a memóriaszivárgás ellen!
    if (global.gc) global.gc();
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
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
    } catch (e) { console.warn(`   ⚠️ [SAP] Szonár nem talált egyértelmű formot. Váltás bruteforce-ra...`); }

    const pathsToTry = ["/search/", "/hu_HU/careers/SearchJobs", "/en_GB/careersmarketplace/SearchJobs", "/search-jobs", "/content/Kereses/"];
    for (let path of pathsToTry) {
        let testUrlObj;
        try { testUrlObj = new URL(base.split('?')[0] + path); originalParams.forEach((val, key) => testUrlObj.searchParams.set(key, val)); } catch(e) { continue; }
        let testUrl = testUrlObj.toString();
        try { await unbreakableFetchText(testUrl, 5000); return testUrl; } catch (e) { continue; }
    }

    const defaultUrlObj = new URL(base.split('?')[0] + "/search/");
    originalParams.forEach((val, key) => defaultUrlObj.searchParams.set(key, val));
    return defaultUrlObj.toString();
}

exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  console.log(`   ⬇️ [SAP] Phantom-DeepScrape letöltése indul...`);
  const allJobs = [];
  const seenUrls = new Set(knownUrls);
  
  let startrow = 0; const step = 25; let hasMore = true; let page = 1;
  const searchBaseUrl = await discoverSearchUrl(baseUrl);
  
  while (hasMore) {
    let currentUrl;
    try {
        const urlObj = new URL(searchBaseUrl);
        if (!urlObj.searchParams.has('sortColumn')) urlObj.searchParams.append('sortColumn', 'referencedate');
        if (!urlObj.searchParams.has('sortDirection')) urlObj.searchParams.append('sortDirection', 'desc');
        if (!urlObj.searchParams.has('locale')) urlObj.searchParams.append('locale', 'hu_HU');
        urlObj.searchParams.set('startrow', startrow.toString()); currentUrl = urlObj.toString();
    } catch (e) { throw e; }
    
    console.log(`   ⬇️ [SAP] Oldal ${page} (Állások ${startrow}-től) letöltése...`);
    
    try {
      const html = await unbreakableFetchText(currentUrl, 15000);
      const $ = cheerio.load(html);

      if (html.toLowerCase().includes("just a moment") || html.toLowerCase().includes("cloudflare") || html.includes('id="cf-wrapper"')) {
          throw new Error("WAF (Cloudflare/F5) Captcha blokkolás!");
      }
      
      const pageLinks = [];
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        let text = $(el).text().trim().replace(/\s+/g, ' ').replace(/\s*\([m|f|d|w|x|n|\/]+\)\s*/gi, ' ').trim();
        let preLoc = $(el).closest('tr, li, .job-tile').find('.jobFacility, .jobLocation, .location, span.jobLocation').text().trim();

        if (href && (href.match(/\/(job|position|career|JobDetail|opportunities|jobs)\//i) || href.match(/jobid=/i)) && text.length > 5) {
          if (/\b(m\/ž|za|odnose|mjesto|klijentima|poslovalnici|persoane|serviciu|prihvatom|svetovalec|radno|suradnik)\b/i.test(text)) return;
          if (/(croatia|slovenia|romania|italy|slovakia|serbia|hrvatska)/i.test(preLoc)) return;

          let cleanHref = href.startsWith('http') ? href : new URL(href, currentUrl).href;
          pageLinks.push({ title: text, url: cleanHref.split('?')[0], preLoc: preLoc });
        }
      });

      const uniqueOnPage = pageLinks.filter((v, i, a) => a.findIndex(t => (t.url === v.url)) === i);
      const jobsToProcess = uniqueOnPage.filter(job => !seenUrls.has(job.url));
      
      if (jobsToProcess.length === 0) { console.log(`   ⏹️ [SAP] Nincs több új állás az oldalon.`); hasMore = false; break; }
      jobsToProcess.forEach(job => seenUrls.add(job.url));

      // 🔥 RAM VÉDELEM 2: KIZÁRÓLAG 1 SZÁLON MEGYÜNK, hogy ne duplázzuk a memóriaterhelést!
      console.log(`   ⚡ [SAP] ${jobsToProcess.length} db aloldal feldolgozása lopakodó módban (1 szálon)...`);
      
      const processedJobs = await processInBatches(jobsToProcess, 1, async (job) => {
          const details = await getDeepDetails(job.url, job.preLoc);
          if (!details) { process.stdout.write(`❌ `); return null; }
          process.stdout.write(`✔️ `);

          const rawDescription = `${details.employment_type} ${details.experience_level} ${details.subsidiary} ${details.department} ${details.salary} ${details.reqId} ${details.rawText}`;
          
          let analysis = null;
          try {
              // Egyszerű és biztos hívás. Az analyzer nem fagy le, mert a szöveget már 6000 karakternél levágtuk!
              analysis = analyzer.analyzeJob(job.title, rawDescription, companyName);
          } catch(e) { return null; }

          if (analysis !== null) {
              const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
              const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
              let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
              if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

              return {
                title: job.title, url: job.url, apply_url: job.url,
                location: details.location || "Nincs megadva", date_posted: details.datePosted || new Date().toISOString(),
                experience_level: jobNature, subsidiary: details.subsidiary || companyName,
                employment_type: details.employment_type || "Teljes munkaidő",
                faculty: faculty, work_style: analysis.metadata?.work_style || "", tags: tags
              };
          }
          return null;
      });

      console.log(""); 
      allJobs.push(...processedJobs.filter(j => j !== null));

      if (uniqueOnPage.length < step) { hasMore = false; } else { startrow += step; page++; }

    } catch (err) {
      console.error(`   ❌ [SAP] Hiba:`, err.message);
      if (page === 1) throw err;
      hasMore = false;
    }
  }
  
  console.log(`   ✔️  [SAP] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};

// 🕵️ MÉLYFÚRÓ FÜGGVÉNY - MEMÓRIABIZTOS, CPU-VÉDETT VERZIÓ
async function getDeepDetails(jobUrl, preLoc) {
  let resHtml = null;

  let finalJobUrl = jobUrl;
  if (!finalJobUrl.includes('locale=')) finalJobUrl += (finalJobUrl.includes('?') ? '&' : '?') + 'locale=hu_HU';

  for (let attempt = 0; attempt <= 1; attempt++) {
      try {
          resHtml = await unbreakableFetchText(finalJobUrl, 10000);
          break;
      } catch (e) {
          if (attempt === 1) return null; 
          process.stdout.write(`⏳ `);
          await new Promise(r => setTimeout(r, 1000));
      }
  }

  if (!resHtml) return null;
  
  try {
    let details = { location: preLoc || "Magyarország", employment_type: "", experience_level: "", subsidiary: "", department: "", datePosted: new Date().toISOString(), salary: "", reqId: "", rawText: "" };
    let schemaDescription = "";

    // Mivel a resHtml már garantáltan KISEBB mint 150KB, a Cheerio biztonságosan és memóriaszivárgás nélkül le tud futni!
    const $ = cheerio.load(resHtml);

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
                            if (l.address && l.address.addressLocality) locParts.push(l.address.addressLocality);
                        });
                        if (locParts.length > 0) details.location = locParts.join(", ");
                    }
                    if (item.description) schemaDescription = item.description; 
                }
            });
        } catch(e) {}
    });

    details.location = details.location.replace(/\bHU\b|Hungary|Magyarország|\b\d{4}\b/gi, '').replace(/,\s*,/g, ',').replace(/(^,)|(,$)/g, '').trim() || "Magyarország";
    if (/(croatia|slovenia|romania|italy|slovakia|czech|poland|serbia|hrvatska|zagreb|split|osijek|rijeka|ljubljana|koper|maribor|cluj|bucharest)/i.test(details.location)) return null; 

    // Eltávolítjuk a felesleges tag-eket, hogy csak a tiszta szöveg maradjon
    $('script, style, nav, footer, header, svg, button, iframe, noscript, img').remove();
    let cleanText = $('body').text().replace(/\s+/g, ' ').trim();
                           
    // 🔥 CPU VÉDELEM: A tiszta szöveget KŐKEMÉNYEN levágjuk 6000 karakternél!
    // Így az analyzer.js szinkron Regex-motorja 0.001 másodperc alatt lefut, a fagyás lehetetlen.
    cleanText = cleanText.substring(0, 6000);

    if (!details.employment_type) {
        const empMatch = cleanText.match(/(?:foglalkoztatás típusa|foglalkoztatás jellege|munkaidő)[:\s]+([a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ\s-]{3,30})(?:\s|$)/i);
        if (empMatch) details.employment_type = empMatch[1].trim();
    }
    if (!details.experience_level) {
        const expMatch = cleanText.match(/tapasztalati szint[:\s]+([a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ\s-]{3,30})(?:\s|$)/i);
        if (expMatch) details.experience_level = expMatch[1].trim();
    }

    if (cleanText.length < 30 && schemaDescription) {
        cleanText = cheerio.load(schemaDescription).text().replace(/\s+/g, ' ').trim().substring(0, 6000);
    }

    details.rawText = cleanText;
    return details;
  } catch (e) {
    return null; 
  }
}