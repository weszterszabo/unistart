// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ Stealth Headers: Valódi böngésző szimulálása
const HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Referer": "https://jobs.lidl.hu/kereses-es-jelentkezes/allasok"
};

// 🛡️ GOLYÓÁLLÓ FETCH (Tarpit és TLS fagyás ellen erőszakos kiszakítás a TARTALOM letöltésére is!)
async function fetchJsonSafe(url, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    options.signal = controller.signal;
    
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            controller.abort(); 
            reject(new Error(`Hálózati időtúllépés (${timeoutMs}ms)`)); 
        }, timeoutMs);
    });

    try {
        // A teljes hálózati folyamatot (fejléc + body letöltés + json parse) egybevonjuk!
        const networkTask = fetch(url, options).then(async (res) => {
            if (!res.ok) throw new Error(`HTTP hiba! Státusz: ${res.status}`);
            
            const contentType = res.headers.get("content-type") || "";
            if (contentType.includes("text/html")) {
                throw new Error("WAF (Cloudflare) HTML blokkolás érzékelve a JSON végponton!");
            }
            
            return await res.json(); // Ez is a race-ben van, így ez sem fagyhat ki!
        });

        // Aki hamarabb végez (a letöltés ÉS a feldolgozás VAGY a 12 mp-es hiba), az nyer!
        const jsonData = await Promise.race([networkTask, timeoutPromise]);
        clearTimeout(timeoutId);
        return jsonData;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

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
      // 🚀 ERŐSZAKOS JSON FETCH HÍVÁSA
      // Itt már maga a letöltött, tiszta JSON jön vissza. Ha be is fagy a Lidl, 12mp múlva hibára fut.
      const json = await fetchJsonSafe(apiUrl, { method: "GET", headers: HEADERS }, 12000);

      const jobsList = json.jobs || [];

      if (jobsList.length === 0) {
        hasMore = false;
        break;
      }

      let newJobsCount = 0;

      for (const job of jobsList) {
        const title = job.title || "Névtelen pozíció";
        
        let jobUrl = job.jobDetailUrl || job.url || "";
        if (!jobUrl && job.id) jobUrl = `/jobs/${job.id}`; 
        if (jobUrl && !jobUrl.startsWith("http")) jobUrl = "https://jobs.lidl.hu" + (jobUrl.startsWith("/") ? "" : "/") + jobUrl;

        if (!jobUrl || seenUrls.has(jobUrl)) continue;
        seenUrls.add(jobUrl);
        newJobsCount++;

        const experience = job.entryLevel || ""; 
        const department = job.employmentArea || job.jobCategory || "";
        const type = job.contractType || job.workingHours || "Teljes munkaidő";
        
        const rawDescription = [
            experience, department, type,
            job.description, job.profile, job.tasks, job.requirements, job.benefits
        ].filter(Boolean).join(" ").replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();

        const analysis = analyzer.analyzeJob(title, rawDescription);

        if (analysis !== null) {
            const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
            const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
            const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
            let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
            if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

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
              faculty: faculty,
              work_style: workStyle,
              tags: tags
            });
        }
      }

      if (jobsList.length < PAGE_SIZE) {
        console.log(`   ⏹️ [LIDL] Utolsó oldal (${jobsList.length} db), vége a lapozásnak!`);
        hasMore = false;
      } else if (newJobsCount === 0) {
        console.log(`   ⏹️ [LIDL] Csak ismétlődő állások érkeztek, leállunk!`);
        hasMore = false;
      } else {
        page++;
        await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
      }

    } catch (err) {
      console.error(`   ❌ [LIDL] Hálózat hiba vagy időtúllépés a ${page}. oldalon:`, err.message);
      
      // Ha az 1. oldalon fagy be a rendszer, mentsük az eddigi adatokat
      if (page === 1) {
        throw err;
      }
      
      hasMore = false;
    }
  }

  console.log(`   ✔️  [LIDL] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};