// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ Stealth Headers: Valódi böngésző álcázása
const HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Referer": "https://jobs.smartrecruiters.com/",
  "Origin": "https://jobs.smartrecruiters.com"
};

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [SmartRecruiters] Phantom-API letöltése indul...`);
  const allJobs = [];
  const seenUrls = new Set(); // 🛑 VÉDELEM A DUPLIKÁCIÓK ÉS VÉGTELEN CIKLUS ELLEN ON-THE-FLY
  
  // URL tisztítás és lapozó paraméterek előkészítése
  let cleanUrl = baseUrl.replace(/(&|\?)limit=\d+/g, '').replace(/(&|\?)offset=\d+/g, '').replace(/(&|\?)pagesize=\d+/g, '');
  const sep = cleanUrl.includes('?') ? '&' : '?';

  let offset = 0;
  const limit = 100; // SmartRecruiters max limit
  let hasMore = true;
  let page = 1;

  while (hasMore) {
    const currentUrl = `${cleanUrl}${sep}limit=${limit}&offset=${offset}`;
    console.log(`   ⬇️ [SmartRecruiters] Oldal ${page} letöltése (Offset: ${offset})...`);

    try {
      // 🛑 Időtúllépés kezelés (10 másodperc), ha az API beragadna
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(currentUrl, { headers: HEADERS, signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`   ❌ [SmartRecruiters] HTTP Hiba a letöltés során (Status: ${response.status})`);
        break;
      }

      const rawText = await response.text();
      let data;
      try {
          data = JSON.parse(rawText);
      } catch (parseError) {
          console.error(`   ❌ [SmartRecruiters] Érvénytelen JSON válasz kapott az API-tól.`);
          break;
      }
      
      let jobArray = [];
      const candidateKeys = ['content', 'documents', 'elements', 'hits', 'results', 'items', 'data', 'jobs'];
      
      for (const key of candidateKeys) {
        if (data && typeof data === 'object' && Array.isArray(data[key]) && data[key].length > 0) { 
            jobArray = data[key]; 
            break; 
        }
      }
      if (jobArray.length === 0 && Array.isArray(data)) jobArray = data;

      if (jobArray.length === 0) {
        console.log(`   ⏹️ [SmartRecruiters] Nincs több állás az oldalon.`);
        hasMore = false;
        break;
      }

      let newJobsOnThisPage = 0;

      for (const item of jobArray) {
        const title = item.name || item.title || item.jobTitle || item.headline || "Névtelen pozíció";
        
        let jobUrl = item.url || item.smartRecruitersUrl || item.link || item.applyUrl || "";
        if (!jobUrl && item.id) jobUrl = `https://jobs.smartrecruiters.com/BoschGroup/${item.id}`;

        // 🛑 DUPLIKÁCIÓ ELLENŐRZÉS ON-THE-FLY
        if (!jobUrl || seenUrls.has(jobUrl)) continue;
        
        seenUrls.add(jobUrl);
        newJobsOnThisPage++;

        // 📍 INTELLIGENS HELYSZÍN LÁNCOLÁS
        let locParts = [];
        if (item.location && typeof item.location === 'object') {
            if (item.location.city || item.location.addressLocality) locParts.push(item.location.city || item.location.addressLocality);
            if (item.location.region && item.location.region !== locParts[0]) locParts.push(item.location.region);
        } else if (typeof item.location === 'string') {
            locParts.push(item.location);
        } else if (item.city) {
            locParts.push(item.city);
        }
        const location = locParts.length > 0 ? locParts.join(", ") : "Magyarország";

        // 🕵️ MÉLY-ADATBÁNYÁSZAT (Kibővített JSON Extrakció)
        const type = item.typeOfEmployment?.label || item.employment_type || item.contractType?.label || "Teljes munkaidő";
        const experience = item.experienceLevel?.label || item.experience_level || item.seniority?.label || "";
        const department = item.company?.name || item.brand?.label || item.department?.label || companyName;
        const jobFunction = item.jobFunction?.label || item.function?.label || "";
        const industry = item.industry?.label || "";

        // Tiszta, gazdag kontextus az NLP-nek
        const rawDescription = [department, experience, type, jobFunction, industry].filter(Boolean).join(" ");
        
        // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
        const analysis = analyzer.analyzeJob(title, rawDescription);

        // 🛡️ 3. JUNIOR KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT
        if (analysis !== null) {
            
            // V17 / V16 Kompatibilis adatkinyerés
            const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
            const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
            const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
            let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
            if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

            allJobs.push({
              title: title.replace(/\s+/g, ' ').trim(),
              url: jobUrl,
              apply_url: jobUrl,
              location: location,
              date_posted: item.releasedDate || item.postedDate || item.createdAt || new Date().toISOString(),
              
              experience_level: jobNature,
              subsidiary: department,
              employment_type: type,
              
              // 🌟 A SZUPERERŐK:
              faculty: faculty,
              work_style: workStyle,
              tags: tags
            });
        }
      }

      // 🏎️ 4. OKOS EARLY-EXIT ÉS THROTTLING
      if (jobArray.length < limit) {
        console.log(`   ⏹️ [SmartRecruiters] Elértük az API végét (${jobArray.length} állás jött az utolsó oldalon).`);
        hasMore = false;
      } else if (newJobsOnThisPage === 0) {
        console.log(`   ⏹️ [SmartRecruiters] Csak ismétlődő állások jöttek, leállítjuk a lapozást!`);
        hasMore = false;
      } else {
        offset += limit;
        page++;
        // 🛑 Anti-Bot Jitter (Véletlenszerű várakozás 400-800ms között)
        await new Promise(r => setTimeout(r, 400 + Math.random() * 400));
      }

    } catch (err) {
      console.error(`   ❌ [SmartRecruiters] Hálózat hiba vagy időtúllépés a ${page}. oldalon:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [SmartRecruiters] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs; // Itt már nem kell a .filter(), mert a seenUrls Set garantálja az egyediséget!
};