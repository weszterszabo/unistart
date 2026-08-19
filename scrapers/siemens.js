// 🧠 1. BEHÚZZUK A KÖZPONTI AGYAT
const analyzer = require("../analyzer");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Siemens] API letöltése indul...`);
  const allJobs = [];
  
  let start = 0;
  const num = 100;
  let hasMore = true;

  // 🛡️ OKOS HOST-KERESŐ: Hozzáadtuk a közvetlen 'eightfold.ai' backend szervert is!
  const hosts = ["jobs.siemens.com", "careers.siemens.com", "siemens.eightfold.ai"];
  let activeHost = hosts[0];
  let hostIndex = 0;

  while (hasMore) {
    const apiUrl = `https://${activeHost}/api/apply/v2/jobs?domain=siemens.com&start=${start}&num=${num}`;
    
    try {
      // Teljes értékű Chrome böngészőnek álcázzuk magunkat
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Referer": `https://${activeHost}/`,
          "Origin": `https://${activeHost}`
        }
      });

      if (!response.ok) {
        // Ha bármilyen HTTP hibát kapunk (404, 403 Tiltva, stb.), ugrunk a következő szerverre!
        if (hostIndex < hosts.length - 1) {
            console.log(`   ⚠️ [Siemens] HTTP ${response.status} a ${activeHost} címen. Próbálkozás a következővel...`);
            hostIndex++;
            activeHost = hosts[hostIndex];
            continue; 
        } else {
            console.error(`   ❌ [Siemens] Hiba (HTTP ${response.status}) az összes elérhető szerveren.`);
            break;
        }
      }

      const json = await response.json();
      const positions = json.positions || [];

      if (positions.length === 0) {
        hasMore = false;
        break;
      }

      // Végignézzük az ezen az oldalon kapott állásokat
      positions.forEach(job => {
        let isHungarian = false;
        let finalLocation = "Magyarország";

        const mainLoc = (job.location || "").toLowerCase();
        if (mainLoc.includes("hungar") || mainLoc.includes("budapest") || mainLoc.includes("magyar")) {
            isHungarian = true;
            finalLocation = job.location;
        }

        if (!isHungarian && Array.isArray(job.locations)) {
            for (const loc of job.locations) {
                const locStr = (loc || "").toLowerCase();
                if (locStr.includes("hungar") || locStr.includes("budapest") || locStr.includes("magyar")) {
                    isHungarian = true;
                    finalLocation = loc; 
                    break;
                }
            }
        }

        if (isHungarian) {
            let title = job.name || "Névtelen pozíció";
            // A jelentkezési linknél mindig a hivatalos domaint adjuk meg a diákoknak
            let jobUrl = job.url || `https://jobs.siemens.com/careers/job/${job.id}`;
            let department = job.department || "Siemens";
            
            const rawDescription = `${department}`;
            const analysis = analyzer.analyzeJob(title, rawDescription);

            if (analysis !== null) {
                allJobs.push({
                  title: title,
                  url: jobUrl,
                  apply_url: jobUrl,
                  location: finalLocation,
                  date_posted: new Date().toISOString(), 
                  
                  experience_level: analysis.job_nature,
                  subsidiary: department,
                  employment_type: "Teljes munkaidő",

                  faculty: analysis.faculty,
                  work_style: analysis.work_style,
                  tags: analysis.tags
                });
            }
        }
      });

      if (positions.length < num) {
          hasMore = false;
      } else {
          start += num;
          await new Promise(r => setTimeout(r, 200)); 
      }

    } catch (err) {
      // 🛡️ HA HÁLÓZATI HIBA VAN (fetch failed), itt kapjuk el, és váltunk a következő szerverre!
      if (hostIndex < hosts.length - 1) {
          console.log(`   ⚠️ [Siemens] Hálózati blokkolás a ${activeHost} címen. Ugrás a következőre...`);
          hostIndex++;
          activeHost = hosts[hostIndex];
          continue;
      } else {
          console.error(`   ❌ [Siemens] Végzetes hálózat hiba:`, err.message, err.cause || "");
          hasMore = false;
      }
    }
  }

  console.log(`   ✔️  [Siemens] Siker: A szűrőn fennmaradt ${allJobs.length} db PÁLYAKEZDŐ/JUNIOR állás!`);
  return allJobs;
};