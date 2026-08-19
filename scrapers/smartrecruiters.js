// 🧠 1. BEHÚZZUK A KÖZPONTI AGYAT
const analyzer = require("../analyzer");

const HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://jobs.bosch.com/"
};

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [SmartRecruiters] Okos JSON API lapozó indítása...`);
  const allJobs = [];
  
  // Kiszedjük a linkből a meglévő limit/offset/pagesize adatokat, hogy mi irányítsuk a lapozást
  let cleanUrl = baseUrl.replace(/(&|\?)limit=\d+/g, '').replace(/(&|\?)offset=\d+/g, '').replace(/(&|\?)pagesize=\d+/g, '');
  const sep = cleanUrl.includes('?') ? '&' : '?';

  let offset = 0;
  const limit = 100; // A SmartRecruiters szerver "Hard Limit"-je
  let hasMore = true;
  let page = 1;

  while (hasMore) {
    const currentUrl = `${cleanUrl}${sep}limit=${limit}&offset=${offset}`;
    console.log(`   ⬇️ [SmartRecruiters] Oldal ${page} letöltése (${offset} - ${offset + limit})...`);

    try {
      const response = await fetch(currentUrl, { headers: HEADERS });
      const rawText = await response.text();
      
      let data;
      try {
          data = JSON.parse(rawText);
      } catch (parseError) {
          console.error(`   ❌ [SmartRecruiters] Érvénytelen JSON válasz.`);
          hasMore = false;
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
        console.log(`   ⏹️ [SmartRecruiters] Nincs több állás ezen az oldalon.`);
        hasMore = false;
        break;
      }

      jobArray.forEach(item => {
        const title = item.name || item.title || item.jobTitle || item.headline || "Névtelen pozíció";
        let jobUrl = item.url || item.smartRecruitersUrl || item.link || item.applyUrl || "";
        
        if (!jobUrl && item.id) jobUrl = `https://jobs.smartrecruiters.com/BoschGroup/${item.id}`;

        let loc = "";
        if (typeof item.location === 'string') loc = item.location;
        else if (item.location && typeof item.location === 'object') {
          loc = item.location.city || item.location.name || item.location.addressLocality || item.location.region || "";
        }
        loc = loc || item.city || "Magyarország";

        // Kinyerjük az elérhető adatokat a leíráshoz
        const type = item.typeOfEmployment?.label || item.employment_type || item.contractType?.label || "Teljes munkaidő";
        const experience = item.experienceLevel?.label || item.experience_level || item.seniority?.label || "";
        const department = item.company?.name || item.brand?.label || "Bosch";

        if (title && jobUrl) {
            
            // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
            const rawDescription = `${department} ${experience} ${type}`;
            const analysis = analyzer.analyzeJob(title, rawDescription);

            // 🧠 3. KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT
            if (analysis !== null) {
                allJobs.push({
                  title: title,
                  url: jobUrl,
                  apply_url: jobUrl,
                  location: loc,
                  date_posted: item.releasedDate || item.postedDate || item.createdAt || new Date().toISOString(),
                  
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
        }
      });

      // Itt a PAGINÁCIÓ (lapozás) a letöltött `jobArray` alapján történik, tehát nem a szűrt állások számát nézi! Így golyóálló.
      if (jobArray.length < limit) {
        console.log(`   ⏹️ [SmartRecruiters] Elértük a lista végét (${jobArray.length} db jött az utolsó oldalon).`);
        hasMore = false;
      } else {
        offset += limit;
        page++;
        await new Promise(r => setTimeout(r, 400));
      }

    } catch (err) {
      console.error(`   ❌ [SmartRecruiters] Hálózat vagy JSON hiba:`, err.message);
      hasMore = false;
    }
  }

  // SZŰRŐ: Duplikált linkek eltávolítása (ha a lapozásnál megcsúszott volna az API)
  const uniqueJobs = allJobs.filter((job, index, self) => 
    index === self.findIndex((t) => (t.url === job.url))
  );

  console.log(`   ✔️  [SmartRecruiters] Siker: A szűrőn fennmaradt ${uniqueJobs.length} db EGYEDI DIÁK/JUNIOR állás!`);
  return uniqueJobs;
};