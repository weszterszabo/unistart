// 🧠 1. BEHÚZZUK A KÖZPONTI AGYAT
const analyzer = require("../analyzer");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [LIDL] REST API letöltése indul...`);
  const allJobs = [];
  
  let page = 1; 
  let hasMore = true;

  while (hasMore) {
    console.log(`   ⬇️ [LIDL] Lapozás: ${page}. oldal...`);
    
    const queryObj = { page: page, resultsPerPage: 100, sortField: "", sortOrder: "asc" };
    const encodedQuery = encodeURIComponent(JSON.stringify(queryObj));
    const apiUrl = `https://jobs.lidl.hu/api/v1/search?general=${encodedQuery}`;

    try {
      // Időtúllépés kezelés, hogy ne akadjon be a robot
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(apiUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0"
        }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.log(`   ⚠️ [LIDL] Szerver hiba (HTTP ${response.status}), tovább a következő cégre.`);
        break;
      }

      const json = await response.json();
      const jobsList = json.jobs || [];

      if (!jobsList || jobsList.length === 0) {
        hasMore = false;
        break;
      }

      jobsList.forEach(job => {
        const title = job.title || "Névtelen pozíció";
        
        let jobUrl = job.jobDetailUrl || job.url || "";
        if (!jobUrl && job.id) jobUrl = `/jobs/${job.id}`; 
        if (jobUrl && !jobUrl.startsWith("http")) {
            jobUrl = "https://jobs.lidl.hu" + (jobUrl.startsWith("/") ? "" : "/") + jobUrl;
        }

        const experience = job.entryLevel || ""; 
        const department = job.employmentArea || job.jobCategory || "";
        const type = job.contractType || job.workingHours || "Teljes munkaidő";

        // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
        const rawDescription = `${experience} ${department} ${type}`;
        const analysis = analyzer.analyzeJob(title, rawDescription);

        // 🧠 3. KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT
        if (analysis !== null) {
            allJobs.push({
              title: title,
              url: jobUrl,
              apply_url: jobUrl,
              location: (job.location && (job.location.city || job.location.name)) ? (job.location.city || job.location.name) : (job.city || "Magyarország"),
              date_posted: job.onlineFrom || job.modifiedTime || new Date().toISOString(),
              
              // ÚJ CÍMKÉZÉS AZ AGY ALAPJÁN!
              experience_level: analysis.job_nature, 
              subsidiary: department,
              employment_type: type,
              
              // 🌟 A SZUPERERŐK:
              faculty: analysis.faculty,
              work_style: analysis.work_style,
              tags: analysis.tags
            });
        }
      });

      if (jobsList.length < 100) {
          hasMore = false; 
      } else {
          page++;
          await new Promise(r => setTimeout(r, 800)); // Szünet a szerver kímélésére
      }

    } catch (err) {
      console.log(`   ⚠️ [LIDL] Hálózat hiba vagy időtúllépés: ${err.message}. Tovább a következő cégre.`);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [LIDL] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};