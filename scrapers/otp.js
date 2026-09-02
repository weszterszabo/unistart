// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ Stealth Headers: Valódi böngésző szimulálása
const HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Referer": "https://jobs.lidl.hu/kereses-es-jelentkezes/allasok"
};

// 🔥 JAVÍTÁS: Hozzáadva a knownUrls = [] paraméter
exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  console.log(`   ⬇️ [LIDL] Phantom-API letöltése indul...`);
  const allJobs = [];
  const seenUrls = new Set(); // 🛑 VÉDELEM A DUPLIKÁCIÓK ELLEN
  
  let page = 1; 
  let hasMore = true;
  const PAGE_SIZE = 100;

  while (hasMore) {
    console.log(`   ⬇️ [LIDL] Lapozás: ${page}. oldal...`);
    
    const queryObj = { page: page, resultsPerPage: PAGE_SIZE, sortField: "", sortOrder: "asc" };
    const encodedQuery = encodeURIComponent(JSON.stringify(queryObj));
    const apiUrl = `https://jobs.lidl.hu/api/v1/search?general=${encodedQuery}`;

    try {
      // Időtúllépés kezelés (10 másodperc)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(apiUrl, {
        method: "GET",
        signal: controller.signal,
        headers: HEADERS
      });

      // 🔥 JAVÍTÁS: break helyett throw, hogy a catch lekezelje!
      if (!response.ok) {
        clearTimeout(timeoutId); // Hibánál memóriát takarítunk
        throw new Error(`HTTP hiba! Státusz: ${response.status}`);
      }

      // 🔥 WAF / CLOUDFLARE VÉDELEM: Megnézzük, hogy tényleg JSON-t kaptunk-e!
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
          clearTimeout(timeoutId); // Hibánál memóriát takarítunk
          throw new Error("WAF (Cloudflare/F5) HTML blokkolás érzékelve a JSON végponton!");
      }

      const json = await response.json();
      
      // 🔥 KÁTRÁNYGÖDÖR (TARPIT) VÉDELEM JAVÍTÁSA: 
      // Csak a sikeres body (JSON) letöltés után töröljük a timeoutot!
      clearTimeout(timeoutId);

      const jobsList = json.jobs || [];

      if (jobsList.length === 0) {
        hasMore = false;
        break;
      }

      let newJobsCount = 0;

      for (const job of jobsList) {
        const title = job.title || "Névtelen pozíció";
        
        // Link normalizálása
        let jobUrl = job.jobDetailUrl || job.url || "";
        if (!jobUrl && job.id) jobUrl = `/jobs/${job.id}`; 
        if (jobUrl && !jobUrl.startsWith("http")) jobUrl = "https://jobs.lidl.hu" + (jobUrl.startsWith("/") ? "" : "/") + jobUrl;

        // 🛑 KAPUŐR A DUPLIKÁCIÓK ELLEN
        if (!jobUrl || seenUrls.has(jobUrl)) continue;
        seenUrls.add(jobUrl);
        newJobsCount++;

        // 🕵️ MÉLY-ADATBÁNYÁSZAT (Deep Extract)
        const experience = job.entryLevel || ""; 
        const department = job.employmentArea || job.jobCategory || "";
        const type = job.contractType || job.workingHours || "Teljes munkaidő";
        
        // Összefűzzük és megtisztítjuk a HTML tagektől az összes releváns JSON mezőt
        const rawDescription = [
            experience, department, type,
            job.description, job.profile, job.tasks, job.requirements, job.benefits
        ].filter(Boolean).join(" ").replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();

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

            // 📍 INTELLIGENS HELYSZÍN: Irányítószám hozzáadása, ha létezik
            let location = "Magyarország";
            if (job.location && (job.location.city || job.location.name)) {
                location = job.location.city || job.location.name;
                if (job.location.zipCode && !location.includes(job.location.zipCode)) {
                    location = `${job.location.zipCode} ${location}`;
                }
            } else if (job.city) {
                location = job.city;
            }

            allJobs.push({
              title: title.replace(/\s+/g, ' ').trim(),
              url: jobUrl,
              apply_url: jobUrl,
              location: location.replace(/\s+/g, ' ').trim(),
              date_posted: job.onlineFrom || job.modifiedTime || new Date().toISOString(),
              
              experience_level: jobNature, 
              subsidiary: department || "Lidl Magyarország",
              employment_type: type,
              
              // 🌟 A SZUPERERŐK:
              faculty: faculty,
              work_style: workStyle,
              tags: tags
            });
        }
      }

      // 🏎️ 4. OKOS EARLY-EXIT ÉS THROTTLING
      if (jobsList.length < PAGE_SIZE) {
        console.log(`   ⏹️ [LIDL] Utolsó oldal (${jobsList.length} db), vége a lapozásnak!`);
        hasMore = false;
      } else if (newJobsCount === 0) {
        console.log(`   ⏹️ [LIDL] Csak ismétlődő állások érkeztek, leállunk!`);
        hasMore = false;
      } else {
        page++;
        // 🛑 Anti-Bot Jitter: Véletlenszerű várakozás 600ms és 1000ms között
        await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
      }

    } catch (err) {
      console.error(`   ❌ [LIDL] Hálózat hiba vagy időtúllépés a ${page}. oldalon:`, err.message);
      
      // 🔥 KRITIKUS JAVÍTÁS:
      // Ha a legelső oldalon (page === 1) hibára fut (blokkolás, hálózat, stb.),
      // továbbdobjuk a hibát az orchestratornak, hogy mentse meg a korábbi Lidl állásokat!
      if (page === 1) {
        throw err;
      }

      hasMore = false;
    }
  }

  console.log(`   ✔️  [LIDL] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};