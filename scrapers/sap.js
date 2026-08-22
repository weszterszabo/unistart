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

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [SAP] Phantom-DeepScrape letöltése indul...`);
  const allJobs = [];
  const seenUrls = new Set();
  let startrow = 0;
  const step = 25; 
  let hasMore = true;
  let page = 1;

  // 🌍 OKOS URL GENERÁTOR 3.0 (Golyóálló URL kezelés + Dátum rendezés + Magyar nyelv kényszerítése)
  let searchBaseUrl = baseUrl.trim();
  
  // Ha nem tartalmazza a /search/-öt vagy egyéb kereső végpontot (/go/)
  if (!searchBaseUrl.includes('/search') && !searchBaseUrl.includes('/go/')) {
      searchBaseUrl = searchBaseUrl.replace(/\/$/, '') + '/search/';
  }

  while (hasMore) {
    let currentUrl;
    try {
        const urlObj = new URL(searchBaseUrl);
        // 🚀 Garantáljuk, hogy a legújabb állások jöjjenek előre! (Időt és kvótát spórolunk)
        if (!urlObj.searchParams.has('sortColumn')) urlObj.searchParams.append('sortColumn', 'referencedate');
        if (!urlObj.searchParams.has('sortDirection')) urlObj.searchParams.append('sortDirection', 'desc');
        
        // 🇭🇺 Erőszakos lokalizáció: Kényszerítjük a magyar nyelvű adatlapokat!
        if (!urlObj.searchParams.has('locale')) urlObj.searchParams.append('locale', 'hu_HU');
        // Kettős biztosítás régebbi SAP verziók miatt:
        if (!urlObj.searchParams.has('lang')) urlObj.searchParams.append('lang', 'hu-HU');
        // Hármas biztosítás a legkisebb esélyű hiba ellen is:
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
        // 🧹 Multinacionális Címtisztító: Eltávolítjuk a felesleges (m/f/d), (w/m/d), (f/m/x) kódokat a címből
        let text = $(el).text().trim().replace(/\s+/g, ' ');
        text = text.replace(/\s*\([m|f|d|w|x|n|\/]+\)\s*/gi, ' ').trim();

        if (href && (href.includes('/job/') || href.includes('/position/')) && text.length > 5) {
          // 🧹 Kém-paraméter vágó: Eltávolítjuk a ?utm_source= stb. paramétereket az URL-ből a tiszta deduplikációhoz
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

      // 🏎️ PÁRHUZAMOS MÉLYFÚRÁS (Max 5 aloldal egyszerre, hogy ne tiltsanak ki!)
      console.log(`   ⚡ [SAP] ${newJobsToProcess.length} db aloldal feldolgozása párhuzamosan...`);
      
      const processedJobs = await processInBatches(newJobsToProcess, 5, async (job) => {
          const details = await getDeepDetails(job.url);
          if (!details) {
              process.stdout.write(`❌ `);
              return null;
          }
          process.stdout.write(`✔️ `);

          // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
          // A department, salary és reqId extra kapaszkodót ad az Agy NLP-jének!
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

      // Kiszűrjük a null értékeket (amik nem mentek át az NLP-n, vagy hiba volt)
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

// 🕵️ MÉLYFÚRÓ FÜGGVÉNY (Egyedi időtúllépéssel, Auto-Retry-val és Schema.org támogatással)
async function getDeepDetails(jobUrl) {
  let res = null;
  const maxRetries = 1; // Hálózati hiba esetén 1 extra esélyt adunk

  // Továbbörökítjük a lokációt az aloldalakra is, hogy a belső tartalom is magyar legyen!
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

  // 🛡️ AUTO-RETRY LOGIKA: Ha a szerver timeoutol, megpróbáljuk újra!
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000); // Max 8s egy aloldalra

          res = await fetch(finalJobUrl, { headers: HEADERS, signal: controller.signal });
          clearTimeout(timeoutId);

          if (res.ok) break; // Ha sikerült, kilépünk az újrapróbálkozó ciklusból
      } catch (e) {
          if (attempt === maxRetries) return null; // Ha az utolsó esély is elbukott, csendesen null-t adunk
          // Ha hiba volt, várunk egy kicsit (Jitter), mielőtt újra megpróbáljuk
          await new Promise(r => setTimeout(r, 800 + Math.random() * 500));
      }
  }

  if (!res || !res.ok) return null;
  
  try {
    const html = await res.text();
    const $ = cheerio.load(html);
    let details = { location: "", employment_type: "", experience_level: "", subsidiary: "", department: "", datePosted: "", salary: "", reqId: "", rawText: "" };

    let schemaDescription = "";

    // 1. STRATÉGIA: Schema.org JSON keresése (A legtisztább adatforrás!)
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
                        schemaDescription = item.description; // Kimentjük vészhelyzet esetére!
                    }
                }
            });
        } catch(e) {}
    });

    // 1.5. STRATÉGIA: Rejtett Microdata és Meta tagek a DOM-ban
    if (!details.datePosted) {
        const metaDate = $('meta[itemprop="datePosted"]').attr('content');
        if (metaDate) details.datePosted = metaDate;
    }
    
    // ⏳ Biztonságos dátum normalizálás (Megakadályozza, hogy hibás formátum fagyassza ki a mentést)
    if (details.datePosted) {
        try {
            const parsedDate = new Date(details.datePosted);
            if (!isNaN(parsedDate.getTime())) {
                details.datePosted = parsedDate.toISOString();
            } else {
                details.datePosted = new Date().toISOString(); // Fallback, ha szöveget írt a HR-es
            }
        } catch (e) {
            details.datePosted = new Date().toISOString();
        }
    }

    // 2. STRATÉGIA: Fallback a DOM elemekre (Ha a JSON-LD nem volt teljes)
    if (!details.location) {
        let locFound = $('.jobGeoLocation, .job-location, .location, span[itemprop="jobLocation"], span[itemprop="addressLocality"]').first().text().trim();
        // 🧹 Multi-Location Tisztító (levágja a zip kódokat és az országkódokat)
        if (locFound && locFound.length < 80) {
            locFound = locFound.replace(/\n/g, ' ').replace(/\s+/g, ' ');
            // Eltávolítjuk a felesleges "HU", "Hungary", "Magyarország" szavakat és a 4 jegyű irányítószámokat
            locFound = locFound.replace(/\bHU\b/gi, '').replace(/\bHungary\b/gi, '').replace(/\bMagyarország\b/gi, '').replace(/\b\d{4}\b/g, '');
            // Megtisztítjuk az ismétlődő vesszőktől
            details.location = locFound.replace(/,\s*,/g, ',').replace(/(^,)|(,$)/g, '').trim();
            if (details.location === "") details.location = "Magyarország";
        }
    }

    // 🚀 EXTRA 1: Department / Részleg bányász kiterjesztett szelektorokkal
    let depFound = $('.jobDepartment, .department, .category, .jobFacility, span[itemprop="occupationalCategory"]').first().text().trim();
    if (depFound && depFound.length < 80) {
        details.department = depFound;
    }

    // 🚀 EXTRA 2: Bér-Radar (Salary bányász)
    if (!details.salary) {
        let salaryFound = $('span[itemprop="baseSalary"], .jobSalary').first().text().trim();
        if (salaryFound && salaryFound.length < 50) details.salary = salaryFound;
    }
    
    // 🚀 EXTRA 3: Job Requisition ID (Állásazonosító) vadász
    let reqIdFound = $('.jobReqId, .job-id, span[itemprop="value"]').first().text().trim();
    if (reqIdFound && reqIdFound.length < 30) {
        details.reqId = `Ref ID: ${reqIdFound}`;
    }

    // 🚀 EXTRA 4: Omni-Field Radar (SAP CustomFields)
    // Söpörjük végig az összes lehetséges titkos HR adatmezőt!
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
    
    // Még egy extra kör a munkaidő típusának (Full/Part time) kiolvasására SAP specifikus elemekből
    if (!details.employment_type) {
        let shiftFound = $('.jobShift').first().text().trim();
        if (shiftFound && shiftFound.length < 50) details.employment_type = shiftFound;
    }

    // 🧠 3. ZAJTALANÍTÁS ÉS ANTI-MASHING (Szöveg-összetapadás gátló)
    // Extra szóközök beszúrása a HTML tagek köré, hogy ne tapadjanak össze a listaelemek és bekezdések
    $('br, p, div, li, h1, h2, h3, h4').append(' '); 
    
    // Levágjuk a haszontalan részeket, hogy az Agy ne kapjon menüpontokat meg süti-figyelmeztetéseket
    $('script, style, nav, footer, header, svg, button, iframe, noscript').remove();
    
    // 🧠 4. OG Meta Description Bányász (Biztonsági tartalék)
    let metaDesc = $('meta[property="og:description"], meta[name="description"]').attr('content') || "";
    
    // Az egész tiszta DOM szöveg kinyerése
    details.rawText = $('body').text().replace(/\s+/g, ' ').trim();

    // 🛡️ ZERO-DOM FALLBACK (Üres Oldal Túlélő)
    // Ha a weboldalt Javascript generálja és a body üres maradna, megmentjük a helyzetet!
    if (details.rawText.length < 30) {
        // Ha van Schema.org leírás, azt használjuk, ha nincs, akkor a Meta leírást.
        let fallbackHtml = schemaDescription || metaDesc;
        if (fallbackHtml) {
            // A Schema.org description HTML-t tartalmazhat, azt is letisztítjuk
            details.rawText = cheerio.load(fallbackHtml).text().replace(/\s+/g, ' ').trim();
        }
    }

    // Ha találtunk extra metaadatokat, azokat kiemelten hozzáfűzzük a nyers szöveg elejéhez
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
    // Csendes hiba, ha egy aloldal timeoutol, visszaadunk null-t, amit a processInBatches kezel
    return null; 
  }
}