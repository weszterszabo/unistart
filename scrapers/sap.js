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

  while (hasMore) {
    const sep = baseUrl.includes('?') ? '&' : '?';
    const currentUrl = `${baseUrl.replace(/(&|\?)startrow=\d+/g, '')}${sep}startrow=${startrow}`;
    
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
        const text = $(el).text().trim().replace(/\s+/g, ' ');
        if (href && (href.includes('/job/') || href.includes('/position/')) && text.length > 5) {
          pageLinks.push({ title: text, url: href.startsWith('http') ? href : new URL(href, currentUrl).href });
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
          const rawDescription = `${details.employment_type} ${details.experience_level} ${details.subsidiary} ${details.rawText}`;
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

// 🕵️ MÉLYFÚRÓ FÜGGVÉNY (Egyedi időtúllépéssel és Schema.org támogatással)
async function getDeepDetails(jobUrl) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // Max 8s egy aloldalra

    const res = await fetch(jobUrl, { headers: HEADERS, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    
    const html = await res.text();
    const $ = cheerio.load(html);
    let details = { location: "", employment_type: "", experience_level: "", subsidiary: "", datePosted: "", rawText: "" };

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
                }
            });
        } catch(e) {}
    });

    // 2. STRATÉGIA: Fallback a DOM elemekre (Ha a JSON-LD nem volt teljes)
    if (!details.location) {
        let locFound = $('.jobGeoLocation, .job-location, .location').first().text().trim();
        if (locFound && locFound.length < 80) details.location = locFound;
    }

    $('span, p, div, li, b, strong').each((i, el) => {
      const txt = $(el).text().replace(/\s+/g, ' ').trim();
      const lower = txt.toLowerCase();

      if (!details.employment_type && (lower.includes('foglalkoztatás típusa') || lower.includes('foglalkoztatás jellege'))) {
        let val = $(el).next().text().trim() || txt.split(':')[1]?.trim() || txt.replace(/foglalkoztatás (típusa|jellege):?/i, '').trim();
        if(val.length < 50) details.employment_type = val;
      }
      if (!details.experience_level && lower.includes('tapasztalati szint')) {
        let val = $(el).next().text().trim() || txt.split(':')[1]?.trim() || txt.replace(/tapasztalati szint:?/i, '').trim();
        if(val.length < 50) details.experience_level = val;
      }
    });
    
    // 🧠 3. ZAJTALANÍTÁS (A tökéletes NLP élményért)
    // Levágjuk a haszontalan részeket, hogy a V17-es Agy ne kapjon menüpontokat meg süti-figyelmeztetéseket
    $('script, style, nav, footer, header, svg, button, iframe, noscript').remove();
    details.rawText = $('body').text().replace(/\s+/g, ' ').trim();

    return details;
  } catch (e) {
    // Csendes hiba, ha egy aloldal timeoutol, visszaadunk null-t, amit a processInBatches kezel
    return null; 
  }
}