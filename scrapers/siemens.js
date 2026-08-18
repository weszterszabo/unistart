exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Siemens] API letöltése indul (Globális lista szűrése)...`);
  const allJobs = [];
  
  let start = 0;
  const num = 100;
  let hasMore = true;

  while (hasMore) {
    // Az API-t egyszerűen a teljes lista visszaadására kérjük
    const apiUrl = `https://jobs.siemens.com/api/apply/v2/jobs?domain=siemens.com&start=${start}&num=${num}`;
    
    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
      });

      if (!response.ok) {
        console.error(`   ❌ [Siemens] Hiba (HTTP ${response.status})`);
        break;
      }

      const json = await response.json();
      const positions = json.positions || [];

      if (positions.length === 0) {
        hasMore = false;
        break;
      }

      positions.forEach(job => {
        let isHungarian = false;
        let finalLocation = "Magyarország";

        // 1. Vizsgáljuk a fő lokációt (location)
        const mainLoc = (job.location || "").toLowerCase();
        if (mainLoc.includes("hungar") || mainLoc.includes("budapest") || mainLoc.includes("magyar")) {
            isHungarian = true;
            finalLocation = job.location;
        }

        // 2. Vizsgáljuk a többes lokációkat (locations tömb), mert gyakran itt van elrejtve Magyarország
        if (!isHungarian && Array.isArray(job.locations)) {
            for (const loc of job.locations) {
                const locStr = (loc || "").toLowerCase();
                if (locStr.includes("hungar") || locStr.includes("budapest") || locStr.includes("magyar")) {
                    isHungarian = true;
                    finalLocation = loc; // Azt a helyszínt mentjük, ami egyezett
                    break;
                }
            }
        }

        // 3. Vizsgáljuk a címkék (tags) tömbjét is, biztos ami biztos
        if (!isHungarian && Array.isArray(job.tags)) {
           const tagsStr = job.tags.join(" ").toLowerCase();
           if (tagsStr.includes("hungar") || tagsStr.includes("budapest")) {
               isHungarian = true;
           }
        }

        // CSAK akkor mentjük, ha a vasbeton szűrőnk szerint Magyarországi
        if (isHungarian) {
            let title = job.name || "Névtelen pozíció";
            let jobUrl = job.url || `https://jobs.siemens.com/careers/job/${job.id}`;
            
            allJobs.push({
              title: title,
              url: jobUrl,
              apply_url: jobUrl,
              location: finalLocation,
              date_posted: new Date().toISOString(), 
              experience_level: "",
              subsidiary: job.department || "Siemens",
              employment_type: "Teljes munkaidő"
            });
        }
      });

      if (positions.length < num) {
          hasMore = false;
      } else {
          start += num;
          // Fontos a pihenő a globális lista letöltésénél!
          await new Promise(r => setTimeout(r, 100)); 
      }

    } catch (err) {
      console.error(`   ❌ [Siemens] Hálózat hiba:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [Siemens] Siker: ${allJobs.length} db MAGYAR állás feldolgozva.`);
  return allJobs;
};