const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [ALDI] REST API letöltése indul...`);
  const allJobs = [];
  
  // Általában a REST API-k a 0. oldaltól kezdenek
  let page = 0; 
  let hasMore = true;

  while (hasMore) {
    console.log(`   ⬇️ [ALDI] Lapozás: ${page}. oldal...`);
    
    // A linkhez hozzáfűzzük a lapozást (oldal és 100 állás/oldal)
    const apiUrl = `https://karrier.aldi.hu/rest/jobs/search?page=${page}&size=100`;

    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        }
      });

      if (!response.ok) {
        console.error(`   ❌ [ALDI] Hiba a letöltés során (HTTP ${response.status})`);
        break;
      }

      const json = await response.json();
      
      // Az állások listája a JSON-ben (különböző rendszerek máshogy hívják a tömböt)
      const jobsList = json.content || json.results || json.jobs || (Array.isArray(json) ? json : []);

      if (!jobsList || jobsList.length === 0) {
        hasMore = false;
        break;
      }

      jobsList.forEach(job => {
        // Cím kinyerése
        const title = job.title || job.name || "Névtelen pozíció";
        
        // Link összerakása (ha nincs megadva teljes URL, generálunk egyet az ID alapján)
        let jobUrl = job.url || job.applyUrl || "";
        if (!jobUrl && job.id) {
            jobUrl = `https://karrier.aldi.hu/jobs/${job.id}`;
        }
        if (jobUrl && !jobUrl.startsWith("http")) {
            jobUrl = "https://karrier.aldi.hu" + jobUrl;
        }

        // Helyszín (néha sima szöveg, néha objektum)
        let location = "Magyarország";
        if (job.location) {
            if (typeof job.location === 'string') location = job.location;
            else if (job.location.city) location = job.location.city;
            else if (job.location.name) location = job.location.name;
        } else if (job.city) {
            location = job.city;
        }

        // Kategória/Részleg
        const department = job.department || job.category || "";

        allJobs.push({
          title: title,
          url: jobUrl,
          apply_url: jobUrl,
          location: location,
          date_posted: job.datePosted || job.createdDate || new Date().toISOString(),
          experience_level: job.experienceLevel || "", 
          subsidiary: department,
          employment_type: job.employmentType || "Teljes munkaidő"
        });
      });

      // Ellenőrizzük, kell-e még lapoznunk
      if (json.totalPages !== undefined && page >= (json.totalPages - 1)) {
          hasMore = false; // Elértük az utolsó oldalt
      } else if (jobsList.length < 100) {
          hasMore = false; // Kevesebb állás jött, mint a limit, tehát vége
      } else {
          page++;
          await new Promise(r => setTimeout(r, 400));
      }

    } catch (err) {
      console.error(`   ❌ [ALDI] Hálózat hiba:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [ALDI] Siker: ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};