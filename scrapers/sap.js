const cheerio = require("cheerio");
// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ Stealth Headers: SAP SuccessFactors WAF elleni védelem
const HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Upgrade-Insecure-Requests": "1"
};

// ⚡ SEGÉDFÜGGVÉNY: Párhuzamos végrehajtás blokkokban (Concurrency Limit)
async function processInBatches(items, batchSize, asyncFn) {
  let results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(asyncFn));
    results.push(...batchResults);
    // 🛑 Anti-Bot Jitter a blokkok között (400-800ms)
    await new Promise(r => setTimeout(r, 400 + Math.random() * 400));
  }
  return results;
}

// 🌍 OMNI-SEARCH AUTO-DISCOVERY: Megkeresi a helyes SAP végpontot
async function discoverSearchUrl(baseUrl) {
    const base = baseUrl.trim().replace(/\/$/, '');
    // Különböző SAP CSB konfigurációk (A Tesco és a standard is benne van)
    const pathsToTry = [
        "", // 1. Ha a user eleve a pontos linket adta meg
        "/search/", // 2. Standard SAP (Richter, VW)
        "/hu_HU/careers/SearchJobs", // 3. Tesco Magyar
        "/en_GB/careersmarketplace/SearchJobs", // 4. Tesco Nemzetközi
        "/search-jobs", // 5. Alternatív SAP
        "/jobs/" // 6. Régi SAP
    ];

    for (let path of pathsToTry) {
        if (path !== "" && base.includes(path)) continue; // Ne duplázzuk
        
        let testUrl = base + path;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            // Csak egy könnyű GET kérést küldünk a teszteléshez
            const res = await fetch(testUrl, { headers: HEADERS, signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (res.ok) {
                // Biztosra megyünk: Ha 200 OK, akkor ez lesz a jó URL!
                return testUrl;
            }
        } catch (e) {
            continue;
        }
    }
    return base; // Fallback, ha semmi sem sikerült
}

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [SAP] Phantom-DeepScrape letöltése indul...`);
  const allJobs = [];
  const seenUrls = new Set();
  let startrow = 0;
  const step = 25; 
  let hasMore = true;
  let page = 1;

  // 🌍 OMNI-SEARCH AUTO-DISCOVERY
  console.log(`   🕵️ [SAP] Keresővégpont automatikus felderítése...`);
  const searchBaseUrl = await discoverSearchUrl(baseUrl);
  console.log(`   🎯 [SAP] Megtalált végpont: ${searchBaseUrl}`);

  while (hasMore) {
    let currentUrl;
    try {
        const urlObj = new URL(searchBaseUrl);
        // 🚀 Garantáljuk, hogy a legújabb állások jöjjenek előre!
        if (!urlObj.searchParams.has('sortColumn')) urlObj.searchParams.append('sortColumn', 'referencedate');
        if (!urlObj.searchParams.has('sortDirection')) urlObj.searchParams.append('sortDirection', 'desc');
        
        // 🇭🇺 Erőszakos lokalizáció
        if (!urlObj.searchParams.has('locale')) urlObj.searchParams.append('locale', 'hu_HU');
        if (!urlObj.searchParams.has('lang')) urlObj.searchParams.append('lang', 'hu-HU');
        if (!urlObj.searchParams.has('language')) urlObj.searchParams.append('language', 'hu_HU');
        
        // Dinamikus lapozás beállítása
        urlObj.searchParams.set('startrow', startrow.toString());
        currentUrl = urlObj.toString();
    } catch (e) {
        console.error(`   ❌ [SAP] Érvénytelen alap URL lett megadva: ${searchBaseUrl}`);
        break;
    }
    
    console.log(`   ⬇️ [SAP] Oldal ${page} (Állások ${startrow}-től) letöltése...`);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(currentUrl, { headers: HEADERS, signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`   ❌ [SAP] HTTP Hiba a lista lekérésekor (Status: ${response.status})`);
        break;
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      
      const pageLinks = [];
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        // 🧹 Multinacionális Címtisztító
        let text = $(el).text().trim().replace(/\s+/g, ' ');
        text = text.replace(/\s*\([m|f|d|w|x|n|\/]+\)\s*/gi, ' ').trim();

        // 🚨 Itt is felkészítettem a kódodat a Tesco-féle JobDetail hivatkozásokra!
        if (href && (href.includes('/job/') || href.includes('/position/') || href.includes('/JobDetail/')) && text.length > 5) {
          // 🧹 Kém-paraméter vágó
          let cleanHref = href.startsWith('http') ? href : new URL(href, currentUrl).href;
          cleanHref = cleanHref.split('?')[0];

          pageLinks.push({ title: text, url: cleanHref });
        }
      });

      // Duplikációk szűrése az adott oldalon belül
      const uniqueOnPage = pageLinks.filter((v, i, a) => a.findIndex(t => (t.url === v.url)) === i);
      const newJobsToProcess = uniqueOnPage.filter(job => !seenUrls.has(job.url));
      
      if (newJobsToProcess.length === 0) {
        console.log(`   ⏹️ [SAP] Nincs több ÚJ állás az oldalon, elértük a végét.`);
        hasMore = false;
        break;
      }

      newJobsToProcess.forEach(job => seenUrls.add(job.url));

      // 🏎️ PÁRHUZAMOS MÉLYFÚRÁS (Max 5 aloldal egyszerre)
      console.log(`   ⚡ [SAP] ${newJobsToProcess.length} db aloldal feldolgozása párhuzamosan...`);
      
      const processedJobs = await processInBatches(newJobsToProcess, 5, async (job) => {
          const details = await getDeepDetails(job.url);
          if (!details) {
              process.stdout.write(`❌ `);
              return null;
          }
          process.stdout.write(`✔️ `);

          // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
          const rawDescription = `${details.employment_type} ${details.experience_level} ${details.subsidiary} ${details.department} ${details.salary} ${details.reqId} ${details.rawText}`;
          const analysis = analyzer.analyzeJob(job.title, rawDescription);

          // 🛡️ 3. JUNIOR KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT
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
                
                // 🌟 A SZUPERERŐK:
                faculty: faculty,
                work_style: workStyle,
                tags: tags
              };
          }
          return null;
      });

      console.log(""); // Sortörés a checkmarkok után

      // Kiszűrjük a null értékeket
      const validJuniorJobs = processedJobs.filter(j => j !== null);
      allJobs.push(...validJuniorJobs);

      // 🏎️ OKOS EARLY-EXIT
      if (uniqueOnPage.length < step) {
        hasMore = false;
        console.log(`   ⏹️ [SAP] Elértük az utolsó oldalt (${uniqueOnPage.length} db állás volt a listában).`);
      } else {
        startrow += step;
        page++;
      }

    } catch (err) {
      console.error(`   ❌ [SAP] Végzetes lapozási hiba:`, err.message);
      hasMore = false;
    }
  }
  
  console.log(`   ✔️  [SAP] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};

// 🕵️ MÉLYFÚRÓ FÜGGVÉNY
async function getDeepDetails(jobUrl) {
  let res = null;
  const maxRetries = 1;

  let finalJobUrl = jobUrl;
  if (!finalJobUrl.includes('locale=')) {
      finalJobUrl += (finalJobUrl.includes('?') ? '&' : '?') + 'locale=hu_HU';
  }
  if (!finalJobUrl.includes('lang=')) {
      finalJobUrl += '&lang=hu-HU';
  }
  if (!finalJobUrl.includes('language=')) {
      finalJobUrl += '&language=hu_HU';
  }

  // 🛡️ AUTO-RETRY LOGIKA
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000); 

          res = await fetch(finalJobUrl, { headers: HEADERS, signal: controller.signal });
          clearTimeout(timeoutId);

          if (res.ok) break; 
      } catch (e) {
          if (attempt === maxRetries) return null; 
          await new Promise(r => setTimeout(r, 800 + Math.random() * 500));
      }
  }

  if (!res || !res.ok) return null;
  
  try {
    const html = await res.text();
    const $ = cheerio.load(html);
    let details = { location: "", employment_type: "", experience_level: "", subsidiary: "", department: "", datePosted: "", salary: "", reqId: "", rawText: "" };

    let schemaDescription = "";

    // 1. STRATÉGIA: Schema.org JSON
    $('script[type="application/ld+json"]').each((i, el) => {
        try {
            const data = JSON.parse($(el).html().replace(/[\u0000-\u0019]+/g,""));
            const items = Array.isArray(data) ? data : (data["@graph"] || [data]);
            items.forEach(item => {
                if (item['@type'] === 'JobPosting') {
                    if (item.datePosted) details.datePosted = item.datePosted;
                    if (item.employmentType) details.employment_type = Array.isArray(item.employmentType) ? item.employmentType.join(", ") : item.employmentType;
                    if (item.jobLocation && item.jobLocation.address && item.jobLocation.address.addressLocality) {
                        details.location = item.jobLocation.address.addressLocality;
                    }
                    if (item.baseSalary) {
                        details.salary = JSON.stringify(item.baseSalary);
                    }
                    if (item.description) {
                        schemaDescription = item.description; 
                    }
                }
            });
        } catch(e) {}
    });

    // 1.5. STRATÉGIA: Rejtett Microdata és Meta
    if (!details.datePosted) {
        const metaDate = $('meta[itemprop="datePosted"]').attr('content');
        if (metaDate) details.datePosted = metaDate;
    }
    
    // ⏳ Biztonságos dátum normalizálás
    if (details.datePosted) {
        try {
            const parsedDate = new Date(details.datePosted);
            if (!isNaN(parsedDate.getTime())) {
                details.datePosted = parsedDate.toISOString();
            } else {
                details.datePosted = new Date().toISOString(); 
            }
        } catch (e) {
            details.datePosted = new Date().toISOString();
        }
    }

    // 2. STRATÉGIA: Fallback a DOM elemekre
    if (!details.location) {
        let locFound = $('.jobGeoLocation, .job-location, .location, span[itemprop="jobLocation"], span[itemprop="addressLocality"]').first().text().trim();
        if (locFound && locFound.length < 80) {
            locFound = locFound.replace(/\n/g, ' ').replace(/\s+/g, ' ');
            locFound = locFound.replace(/\bHU\b/gi, '').replace(/\bHungary\b/gi, '').replace(/\bMagyarország\b/gi, '').replace(/\b\d{4}\b/g, '');
            details.location = locFound.replace(/,\s*,/g, ',').replace(/(^,)|(,$)/g, '').trim();
            if (details.location === "") details.location = "Magyarország";
        }
    }

    // 🚀 EXTRA 1: Department
    let depFound = $('.jobDepartment, .department, .category, .jobFacility, span[itemprop="occupationalCategory"]').first().text().trim();
    if (depFound && depFound.length < 80) {
        details.department = depFound;
    }

    // 🚀 EXTRA 2: Bér-Radar
    if (!details.salary) {
        let salaryFound = $('span[itemprop="baseSalary"], .jobSalary').first().text().trim();
        if (salaryFound && salaryFound.length < 50) details.salary = salaryFound;
    }
    
    // 🚀 EXTRA 3: Job Requisition ID
    let reqIdFound = $('.jobReqId, .job-id, span[itemprop="value"]').first().text().trim();
    if (reqIdFound && reqIdFound.length < 30) {
        details.reqId = `Ref ID: ${reqIdFound}`;
    }

    // 🚀 EXTRA 4: Omni-Field Radar
    let customFieldsText = "";
    for (let i = 1; i <= 5; i++) {
        let cf = $(`span.customField${i}, .customField${i}`).first().text().replace(/\s+/g, ' ').trim();
        if (cf && cf.length < 100) {
            customFieldsText += ` | HR kód ${i}: ${cf}`;
        }
    }

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
    
    if (!details.employment_type) {
        let shiftFound = $('.jobShift').first().text().trim();
        if (shiftFound && shiftFound.length < 50) details.employment_type = shiftFound;
    }

    // 🧠 3. ZAJTALANÍTÁS ÉS ANTI-MASHING
    $('br, p, div, li, h1, h2, h3, h4').append(' '); 
    $('script, style, nav, footer, header, svg, button, iframe, noscript').remove();
    
    // 🧠 4. OG Meta Description
    let metaDesc = $('meta[property="og:description"], meta[name="description"]').attr('content') || "";
    
    details.rawText = $('body').text().replace(/\s+/g, ' ').trim();

    // 🛡️ ZERO-DOM FALLBACK
    if (details.rawText.length < 30) {
        let fallbackHtml = schemaDescription || metaDesc;
        if (fallbackHtml) {
            details.rawText = cheerio.load(fallbackHtml).text().replace(/\s+/g, ' ').trim();
        }
    }

    // Context összeállítás
    let extraContext = "";
    if (details.department) extraContext += `Részleg/Kategória: ${details.department}`;
    if (details.salary && typeof details.salary === 'string') extraContext += ` | Fizetés: ${details.salary}`;
    if (customFieldsText) extraContext += customFieldsText;
    if (metaDesc && !details.rawText.includes(metaDesc.substring(0, 20))) {
        extraContext += ` | Összefoglaló: ${metaDesc}`;
    }

    if (extraContext !== "") {
        details.rawText = `${extraContext} | ` + details.rawText;
    }

    return details;
  } catch (e) {
    return null; 
  }
}