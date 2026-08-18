exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Siemens] API letöltése indul (Eightfold motor)...`);
  const allJobs = [];
  
  let start = 0;
  const num = 100;
  let hasMore = true;

  while (hasMore) {
    // 🎯 A Siemens Titkos Eightfold API-ja, kifejezetten "Hungary" szűréssel!
    const apiUrl = `https://jobs.siemens.com/api/apply/v2/jobs?domain=siemens.com&start=${start}&num=${num}&location=Hungary`;
    
    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
        }
      });

      if (!response.ok) {
        console.error(`   ❌ [Siemens] Hiba (HTTP ${response.status}) - API nem elérhető.`);
        break;
      }

      const json = await response.json();
      const positions = json.positions || [];

      // Ha már nem küld vissza állást, akkor végeztünk
      if (positions.length === 0) {
        hasMore = false;
        break;
      }

      positions.forEach(job => {
        let title = job.name || "Névtelen pozíció";
        let jobUrl = job.url || `https://jobs.siemens.com/careers/job/${job.id}`;
        let location = job.location || "Magyarország";
        
        // 🛡️ Védőháló: Csak akkor mentjük, ha a lokáció tényleg magyar!
        const locLower = location.toLowerCase();
        if (locLower.includes("hungar") || locLower.includes("budapest") || locLower.includes("magyar")) {
            allJobs.push({
              title: title,
              url: jobUrl,
              apply_url: jobUrl,
              location: location,
              date_posted: new Date().toISOString(), // Az Eightfold API alapesetben nem adja ki a posztolás dátumát
              experience_level: "",
              subsidiary: job.department || "Siemens",
              employment_type: "Teljes munkaidő"
            });
        }
      });

      // Ha kevesebb állást kaptunk vissza, mint amennyit kértünk, akkor nincs több oldal
      if (positions.length < num) {
          hasMore = false;
      } else {
          start += num;
          // Pici pihenő a lapozások között
          await new Promise(r => setTimeout(r, 300));
      }

    } catch (err) {
      console.error(`   ❌ [Siemens] Hálózat hiba:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [Siemens] Siker: ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};