// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ Stealth Headers: Valódi böngésző álcázása
const HEADERS = {
  "Accept": "application/json,application/xml",
  "Content-Type": "application/json",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Origin": "https://myworkdayjobs.com"
};

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Workday] Phantom-API letöltése indul...`);
  const allJobs = [];
  const seenUrls = new Set(); // 🛑 VÉDELEM A DUPLIKÁCIÓK ELLEN

  // A Workday sima URL-ből kikövetkeztetjük a rejtett API hívást!
  let apiUrl = baseUrl;
  try {
    const urlObj = new URL(baseUrl);
    const tenant = urlObj.hostname.split('.')[0]; 
    let catalog = urlObj.pathname.replace(/^\/|\/$/g, '').split('/')[0];
    if (!catalog) catalog = "External";
    
    apiUrl = `https://${urlObj.hostname}/wday/cxs/${tenant}/${catalog}/jobs`;
    // Beállítjuk a helyes Referert a WAF megtévesztésére
    HEADERS["Referer"] = baseUrl;
  } catch (e) {
    console.log("   ⚠️ [Workday] Nem sikerült kinyerni az API url-t, próbálkozás fallbackkel...");
    apiUrl = baseUrl.endsWith('/') ? baseUrl + 'jobs' : baseUrl + '/jobs';
  }

  let offset = 0;
  const limit = 20; // Workday API alapértelmezett, stabil korlátja
  let hasMore = true;
  let page = 1;

  while (hasMore) {
    console.log(`   ⬇️ [Workday] Oldal ${page} letöltése (${offset} - ${offset + limit})...`);
    
    try {
      // 🛑 Időtúllépés kezelés (10 másodperc), ha az API beragadna
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: HEADERS,
        signal: controller.signal,
        body: JSON.stringify({ offset: offset, limit: limit })
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`   ❌ [Workday] HTTP Hiba a letöltés során (Status: ${response.status})`);
        break;
      }
      
      const data = await response.json();
      const jobs = data.jobPostings || [];
      
      if (jobs.length === 0) {
        console.log("   ⏹️ [Workday] Nincs több állás a listán.");
        hasMore = false;
        break;
      }

      let newJobsCount = 0;

      for (const job of jobs) {
        const title = job.title || "Névtelen pozíció";
        
        let jobUrl = job.externalPath ? `https://${new URL(baseUrl).hostname}${job.externalPath}` : "";
        if (!jobUrl) jobUrl = baseUrl;

        // 🛑 DUPLIKÁCIÓ ELLENŐRZÉS ON-THE-FLY
        if (seenUrls.has(jobUrl)) continue;
        seenUrls.add(jobUrl);
        newJobsCount++;

        const timeType = job.timeType || "Teljes munkaidő";
        const location = job.locationsText || "Magyarország";

        // 🕵️ MÉLY-ADATBÁNYÁSZAT (Kibővített JSON Extrakció)
        // Sok Workday verzió visszaadja a kategóriát vagy a részleget is
        const jobCategory = job.jobFamilyGroup || job.jobCategory || "";
        const workerSubType = job.workerSubType || "";
        const postedOn = job.postedOn || ""; // Workday gyakran stringet ad, pl: "Posted 2 Days Ago"

        // Összefűzzük a tiszta kontextust az NLP számára
        const rawDescription = [jobCategory, workerSubType, timeType, postedOn]
            .filter(Boolean)
            .join(" ")
            .trim();

        // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
        const analysis = analyzer.analyzeJob(title, rawDescription);

        // 🛡️ 3. JUNIOR KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT (Pályakezdő vagy Gyakornok)
        if (analysis !== null) {
            
            // V17 / V16 Kompatibilis adatkinyerés
            const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
            const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
            const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
            let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
            if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

            // Workday dátum normalizálás (Ha "Posted 2 days ago" a szöveg, a mai napot mentjük)
            let finalDate = new Date().toISOString();
            if (postedOn && !postedOn.includes("Ago") && !postedOn.includes("Today") && !isNaN(Date.parse(postedOn))) {
                finalDate = new Date(postedOn).toISOString();
            }

            allJobs.push({
              title: title.replace(/\s+/g, ' ').trim(),
              url: jobUrl,
              apply_url: jobUrl,
              location: location,
              date_posted: finalDate,
              
              experience_level: jobNature, 
              subsidiary: jobCategory || companyName, // Részleg híján használjuk a Család/Kategóriát, vagy a Cégnév fallback-et
              employment_type: timeType,
              
              // 🌟 A SZUPERERŐK:
              faculty: faculty,
              work_style: workStyle,
              tags: tags
            });
        }
      }

      // 🏎️ 4. OKOS EARLY-EXIT ÉS THROTTLING
      if (jobs.length < limit) {
        console.log(`   ⏹️ [Workday] Elértük a lista végét (${jobs.length} állás érkezett az utolsó oldalon).`);
        hasMore = false;
      } else if (newJobsCount === 0) {
        console.log(`   ⏹️ [Workday] Csak ismétlődő állások érkeztek, leállítjuk a lapozást!`);
        hasMore = false;
      } else {
        offset += limit;
        page++;
        // 🛑 Anti-Bot Jitter: Véletlenszerű várakozás 300ms és 700ms között
        await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
      }

    } catch (err) {
      console.error(`   ❌ [Workday] Hálózat hiba vagy időtúllépés a ${page}. oldalon:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [Workday] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};