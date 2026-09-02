// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

const HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Referer": "https://jobs.lidl.hu/kereses-es-jelentkezes/allasok"
};

exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  console.log(`   ⬇️ [LIDL] Phantom-API (One-Shot módszer) letöltése indul...`);
  const allJobs = [];
  const seenUrls = new Set(); 
  
  const queryObj = { page: 1, resultsPerPage: 800, sortField: "", sortOrder: "asc" };
  const encodedQuery = encodeURIComponent(JSON.stringify(queryObj));
  const apiUrl = `https://jobs.lidl.hu/api/v1/search?general=${encodedQuery}`;

  try {
    const response = await fetch(apiUrl, { 
        method: "GET", 
        headers: HEADERS,
        signal: AbortSignal.timeout(15000) 
    });

    if (!response.ok) throw new Error(`HTTP hiba: ${response.status}`);
    
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) throw new Error("WAF (Cloudflare) HTML blokkolás!");

    const json = await response.json();
    const jobsList = json.jobs || [];

    console.log(`   ✅ [LIDL] Szerver válaszolt: ${jobsList.length} db állás érkezett egyetlen kérésből!`);

    for (let i = 0; i < jobsList.length; i++) {
        const job = jobsList[i];
        
        if (i > 0 && i % 25 === 0) {
            console.log(`   ⏳ [LIDL] NLP Elemzés folyamatban... (${i} / ${jobsList.length} állás feldolgozva)`);
        }

        const title = job.title || "Névtelen pozíció";
        
        let jobUrl = job.jobDetailUrl || job.url || "";
        if (!jobUrl && job.id) jobUrl = `/jobs/${job.id}`; 
        if (jobUrl && !jobUrl.startsWith("http")) jobUrl = "https://jobs.lidl.hu" + (jobUrl.startsWith("/") ? "" : "/") + jobUrl;

        if (!jobUrl || seenUrls.has(jobUrl)) continue;
        seenUrls.add(jobUrl);

        const experience = job.entryLevel || ""; 
        const department = job.employmentArea || job.jobCategory || "";
        const type = job.contractType || job.workingHours || "Teljes munkaidő";
        
        let rawDescription = [
            experience, department, type,
            job.description, job.profile, job.tasks, job.requirements, job.benefits
        ].filter(Boolean).join(" ");
        
        rawDescription = rawDescription.substring(0, 4000).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

        // 🛡️ KRITIKUS JAVÍTÁS: NLP Watchdog (5 másodperces szigorú limit az AI API-nak)
        let analysis = null;
        try {
            const analyzeTask = analyzer.analyzeJob(title, rawDescription);
            const timeoutTask = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("API Rate Limit vagy Időtúllépés")), 5000)
            );
            
            // Aki hamarabb végez (az AI válasza vagy az 5 mp-es megszakító), az nyer!
            analysis = await Promise.race([analyzeTask, timeoutTask]);
            
            // Dinamikus fojtás (Throttling), hogy ne bombázzuk szét az AI API-t
            await new Promise(r => setTimeout(r, 200)); 

        } catch (e) {
            console.warn(`   ⚠️ [LIDL] NLP Hiba a '${title.substring(0,25)}...' állásnál: ${e.message}`);
            // Ha Rate Limit-et kaptunk (pl. a 100. állásnál), várunk 3 másodpercet, hogy a külső API megnyugodjon!
            await new Promise(r => setTimeout(r, 3000));
            continue; 
        }

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

  } catch (err) {
    console.error(`   ❌ [LIDL] Hálózat hiba:`, err.message);
    throw err;
  }

  console.log(`   ✔️  [LIDL] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};