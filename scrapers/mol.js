// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ Stealth Headers: Oracle Taleo WAF elleni védelem
const HEADERS = {
  "Content-Type": "application/json",
  "Accept": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Origin": "https://molgroup.taleo.net",
  "Referer": "https://molgroup.taleo.net/careersection/mhu/jobsearch.ftl?lang=hu",
  "tz": "GMT+02:00",
  "tzname": "Europe/Budapest"
};

// 🔥 JAVÍTÁS: Hozzáadva a knownUrls = [] paraméter
exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  console.log(`   ⬇️ [MOL Group] Phantom-Taleo API letöltése indul...`);
  const allJobs = [];
  const seenUrls = new Set(); // 🛑 VÉDELEM A DUPLIKÁCIÓK ELLEN
  
  let page = 1;
  let hasMore = true;
  const apiUrl = "https://molgroup.taleo.net/careersection/rest/jobboard/searchjobs?lang=hu&portal=8205100397";

  while (hasMore) {
    console.log(`   ⬇️ [MOL] Lapozás: ${page}. oldal...`);
    
    const requestBody = {
      "multilineEnabled": false,
      "sortingSelection": { "sortBySelectionParam": "3", "ascendingSortingOrder": "false" },
      "fieldData": {
          "fields": { "KEYWORD": "", "LOCATION": "2205100397" }, // 2205100397 = Magyarország
          "valid": true
      },
      "filterSelectionParam": { "searchFilterSelections": [{ "id": "LOCATION", "selectedValues": [] }] },
      "advancedSearchFiltersSelectionParam": {
          "searchFilterSelections": [
              { "id": "ORGANIZATION", "selectedValues": [] },
              { "id": "LOCATION", "selectedValues": [] },
              { "id": "JOB_FIELD", "selectedValues": [] },
              { "id": "JOB_SCHEDULE", "selectedValues": [] }
          ]
      },
      "pageNo": page
    };

    try {
      // 🛑 Időtúllépés kezelés (10 másodperc), mert az Oracle szerverek hajlamosak beragadni
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(apiUrl, {
        method: "POST",
        signal: controller.signal,
        headers: HEADERS,
        body: JSON.stringify(requestBody)
      });
      clearTimeout(timeoutId);

      // 🔥 JAVÍTÁS: break helyett throw, hogy a catch lekezelje az első oldalas hibát
      if (!response.ok) {
        throw new Error(`HTTP hiba! Státusz: ${response.status}`);
      }

      // 🔥 WAF / CLOUDFLARE / ORACLE VÉDELEM: Megnézzük, hogy tényleg JSON-t kaptunk-e!
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
          throw new Error("WAF / Tűzfal HTML blokkolás érzékelve a JSON végponton!");
      }

      const json = await response.json();
      const jobsList = json.requisitionList || [];

      if (jobsList.length === 0) {
        hasMore = false;
        break;
      }

      let newJobsCount = 0;

      for (const job of jobsList) {
        const columns = job.column || [];
        let title = columns[0] || "Névtelen pozíció";
        
        // Link normalizálás és Duplikáció-szűrés
        let jobIdForUrl = job.contestNo || job.jobId || job.requisitionNo || "";
        let jobUrl = jobIdForUrl ? `https://molgroup.taleo.net/careersection/mhu/jobdetail.ftl?job=${jobIdForUrl}&lang=hu` : "";
        
        if (!jobUrl || seenUrls.has(jobUrl)) continue;
        seenUrls.add(jobUrl);
        newJobsCount++;

        // 📍 INTELLIGENS HELYSZÍN KINYERÉS (Taleo formátum tisztítása)
        let rawLocation = columns[1] || "";
        let location = "Magyarország";
        
        if (rawLocation.includes("Budapest") || rawLocation.includes("Dombóvári")) location = "Budapest";
        else if (rawLocation.includes("Tiszaújváros")) location = "Tiszaújváros";
        else if (rawLocation.includes("Százhalombatta")) location = "Százhalombatta";
        else if (rawLocation.includes("Algyő")) location = "Algyő";
        else if (rawLocation.includes("Siófok")) location = "Siófok";
        else if (rawLocation.includes("Almásfüzitő")) location = "Almásfüzitő";
        else if (rawLocation.includes("Eger")) location = "Eger";
        else if (rawLocation.includes("Győr")) location = "Győr";
        else if (rawLocation.includes("Szeged")) location = "Szeged";
        else if (rawLocation.includes("Nagykanizsa")) location = "Nagykanizsa";
        else {
             // Dinamikus Regex, ha új várost adnak hozzá (pl. "Hungary-Baranya-Pécs")
             const match = rawLocation.match(/Hungary(?:-[^-]+)*-([^"-]+)/i);
             if (match && match[1]) location = match[1].trim();
        }

        const companyLabel = job.company || "MOL Group";
        let department = Array.isArray(job.labels) ? job.labels.join(", ") : "";

        // 🕵️ MÉLY-ADATBÁNYÁSZAT (Deep Extract)
        // A Taleo a columns[2]-be vagy a labels-be tesz extra infókat, mindet odaadjuk az Agynak
        const rawDescription = [
            companyLabel, department, job.organization, ...columns
        ].filter(Boolean).join(" ").replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();

        // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
        const analysis = analyzer.analyzeJob(title, rawDescription);

        // 🛡️ 3. JUNIOR KAPUŐR: Csak akkor mentjük, ha átment
        if (analysis !== null) {
            
            // V17 / V16 Kompatibilis adatkinyerés
            const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
            const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
            const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
            let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
            if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

            // Dátum kinyerés: A Taleo a columns[2]-ben adja vissza sokszor a dátumot (pl. "Okt 24, 2026")
            let postedDate = new Date().toISOString();
            if (columns[2] && isNaN(Date.parse(columns[2])) === false) {
                postedDate = new Date(columns[2]).toISOString();
            }

            allJobs.push({
              title: title.replace(/\s+/g, ' ').trim(),
              url: jobUrl,
              apply_url: jobUrl,
              location: location,
              date_posted: postedDate,
              
              experience_level: jobNature, 
              subsidiary: companyLabel !== "MOL Group" ? companyLabel : (department || "MOL Group"),
              employment_type: "Teljes munkaidő",
              
              // 🌟 A SZUPERERŐK:
              faculty: faculty,
              work_style: workStyle,
              tags: tags
            });
        }
      }

      // 🏎️ 4. OKOS EARLY-EXIT ÉS THROTTLING
      const pagingData = json.pagingData || {};
      const totalCount = pagingData.totalCount || 0;
      const currentPage = pagingData.currentPageNo || page;
      const pageSize = pagingData.pageSize || 25;
      
      // Ha elértük a maximális állásszámot, VAGY ezen az oldalon már nem volt egyetlen új állás sem
      if ((currentPage * pageSize) >= totalCount || newJobsCount === 0) {
          console.log(`   ⏹️ [MOL] Elértük a lista végét. (Összes állás a szerveren: ${totalCount})`);
          hasMore = false;
      } else {
          page++;
          // 🛑 Anti-Bot Jitter: Véletlenszerű várakozás 500ms és 900ms között
          await new Promise(r => setTimeout(r, 500 + Math.random() * 400));
      }

    } catch (err) {
      console.error(`   ❌ [MOL] Hálózat hiba vagy időtúllépés a ${page}. oldalon:`, err.message);
      
      // 🔥 KRITIKUS JAVÍTÁS:
      // Ha az első oldalon megszakad a letöltés (Timeout vagy Oracle WAF hiba), 
      // továbbítjuk a hibát, hogy megmentse az orchestrator a régi adatokat!
      if (page === 1) {
          throw err;
      }

      hasMore = false;
    }
  }

  console.log(`   ✔️  [MOL Group] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};