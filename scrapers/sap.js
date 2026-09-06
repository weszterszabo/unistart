const cheerio = require("cheerio");
const https = require("https");
const http = require("http");
const analyzer = require("../analyzer");

const HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "Upgrade-Insecure-Requests": "1",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Connection": "close" // 🔥 NINCS KEEP-ALIVE, hogy az OS azonnal dobja a kapcsolatot!
};

// ☢️ NATÍV OS-SZINTŰ LETÖLTŐ (A Node.js legmélyebb rétege)
async function safeFetchHtml(targetUrl, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        let isDone = false;
        let req;
        
        try {
            const urlObj = new URL(targetUrl);
            const client = urlObj.protocol === 'http:' ? http : https;
            const options = { 
                hostname: urlObj.hostname, 
                path: urlObj.pathname + urlObj.search, 
                method: 'GET', 
                headers: HEADERS,
                timeout: timeoutMs // 🔥 Natív Socket Timeout!
            };

            req = client.request(options, (res) => {
                if (res.statusCode >= 400 && res.statusCode < 500) {
                    if (!isDone) { isDone = true; req.destroy(); reject(new Error(`HTTP ${res.statusCode}`)); }
                    return;
                }
                
                // Redirektek követése
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                     let redirUrl = res.headers.location.startsWith('http') ? res.headers.location : urlObj.origin + res.headers.location;
                     if (!isDone) {
                         isDone = true; req.destroy();
                         safeFetchHtml(redirUrl, timeoutMs).then(resolve).catch(reject);
                     }
                     return;
                }

                let data = '';
                res.on('data', chunk => {
                    data += chunk;
                    // 🔥 RAM PAJZS: 150 KB-nál azonnal levágjuk a VW gigantikus szemétkódját!
                    if (data.length > 150000) {
                        if (!isDone) { isDone = true; req.destroy(); resolve(data); }
                    }
                });
                res.on('end', () => {
                    if (!isDone) { isDone = true; resolve(data); }
                });
            });

            req.on('timeout', () => {
                if (!isDone) { isDone = true; req.destroy(); reject(new Error('OS Socket Timeout')); }
            });

            req.on('error', e => { 
                if (!isDone) { isDone = true; reject(e); } 
            });
            
            req.end();
        } catch (e) {
            if (!isDone) { isDone = true; reject(e); }
        }
    });
}

async function discoverSearchUrl(baseUrl) {
    let base = baseUrl.trim().replace(/\/$/, '');
    console.log(`   🕵️ [SAP] Főoldal szonározása a titkos keresővégpontért...`);
    
    let originalParams = new URLSearchParams();
    try { originalParams = new URL(baseUrl).searchParams; } catch(e) {}
    
    try {
        const html = await safeFetchHtml(base, 10000);
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
        try { await safeFetchHtml(testUrl, 5000); return testUrl; } catch (e) { continue; }
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
  
  // 🔥 A MEGOLDÁS: Szigorú limit a tűzfal tiltása (18. kérés) ellen!
  let totalDeepScrapes = 0;
  const MAX_DEEP_SCRAPES = 12; 

  while (hasMore) {
    let currentUrl;
    try {
        const urlObj = new URL(searchBaseUrl);
        urlObj.searchParams.append('sortColumn', 'referencedate');
        urlObj.searchParams.append('sortDirection', 'desc');
        urlObj.searchParams.append('locale', 'hu_HU');
        urlObj.searchParams.set('startrow', startrow.toString()); currentUrl = urlObj.toString();
    } catch (e) { throw e; }
    
    console.log(`   ⬇️ [SAP] Oldal ${page} (Állások ${startrow}-től) letöltése...`);
    
    try {
      const html = await safeFetchHtml(currentUrl, 10000);
      const $ = cheerio.load(html);
      
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
      let jobsToProcess = uniqueOnPage.filter(job => !seenUrls.has(job.url));
      
      if (jobsToProcess.length === 0) { console.log(`   ⏹️ [SAP] Nincs több új állás az oldalon.`); hasMore = false; break; }

      // Vágjuk le a listát, ha túllépnénk a 12-es limitet!
      if (totalDeepScrapes + jobsToProcess.length > MAX_DEEP_SCRAPES) {
          jobsToProcess = jobsToProcess.slice(0, Math.max(0, MAX_DEEP_SCRAPES - totalDeepScrapes));
      }

      if (jobsToProcess.length > 0) {
          console.log(`   ⚡ [SAP] ${jobsToProcess.length} db állás biztonságos (Anti-Ban) feldolgozása egyesével...`);
          
          for (const job of jobsToProcess) {
              totalDeepScrapes++;
              seenUrls.add(job.url);
              
              const details = await getDeepDetails(job.url, job.preLoc);
              if (!details) { process.stdout.write(`❌ `); continue; }
              process.stdout.write(`✔️ `);

              const rawDescription = `${details.employment_type} ${details.experience_level} ${details.subsidiary} ${details.department} ${details.salary} ${details.reqId} ${details.rawText}`;
              
              let analysis = null;
              try { analysis = analyzer.analyzeJob(job.title, rawDescription, companyName); } catch(e) { continue; }

              if (analysis !== null) {
                  const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
                  const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
                  let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
                  if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

                  allJobs.push({
                    title: job.title, url: job.url, apply_url: job.url,
                    location: details.location || "Nincs megadva", date_posted: details.datePosted || new Date().toISOString(),
                    experience_level: jobNature, subsidiary: details.subsidiary || companyName,
                    employment_type: details.employment_type || "Teljes munkaidő",
                    faculty: faculty, work_style: analysis.metadata?.work_style || "", tags: tags
                  });
              }
              
              // Tűzfal pihentetése minden állás után!
              await new Promise(r => setTimeout(r, 1500));
          }
          console.log(""); 
      }

      // 🔥 HA ELÉRTÜK A 12-T, KILÉPÜNK!
      if (totalDeepScrapes >= MAX_DEEP_SCRAPES) {
          console.log(`   🛑 [SAP] Elértük az Anti-Ban limitet (${MAX_DEEP_SCRAPES} állás). A Tűzfal tiltásának elkerülése végett a cég befejezve!`);
          hasMore = false;
          break;
      }

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

async function getDeepDetails(jobUrl, preLoc) {
  let resHtml = null;
  let finalJobUrl = jobUrl;
  if (!finalJobUrl.includes('locale=')) finalJobUrl += (finalJobUrl.includes('?') ? '&' : '?') + 'locale=hu_HU';

  try {
      resHtml = await safeFetchHtml(finalJobUrl, 8000);
  } catch (e) {
      return null; 
  }

  if (!resHtml) return null;
  
  try {
    let details = { location: preLoc || "Magyarország", employment_type: "", experience_level: "", subsidiary: "", department: "", datePosted: new Date().toISOString(), salary: "", reqId: "", rawText: "" };
    let schemaDescription = "";

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
    if (/(croatia|slovenia|romania|italy|slovakia|czech|poland|serbia|hrvatska|zagreb|split|osijek|rijeka|ljubljana|koper|maribor|cluj|bucharest)/i.test(details.location)) return null; 

    let cleanText = resHtml.replace(/<script[^>]*>[\s\S]*?(<\/script>|$)/gi, ' ')
                           .replace(/<style[^>]*>[\s\S]*?(<\/style>|$)/gi, ' ')
                           .replace(/<!--[\s\S]*?(-->|$)/gi, ' ')
                           .replace(/<[^>]+>/g, ' ')
                           .replace(/\s+/g, ' ')
                           .trim();
                           
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
        cleanText = schemaDescription.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().substring(0, 6000);
    }

    details.rawText = cleanText;
    return details;
  } catch (e) {
    return null; 
  }
}