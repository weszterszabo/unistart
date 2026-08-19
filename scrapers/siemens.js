// 🧠 1. BEHÚZZUK A KÖZPONTI AGYAT
const analyzer = require("../analyzer");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Siemens] API letöltése indul...`);
  const allJobs = [];
  
  let start = 0;
  const num = 100;
  let hasMore = true;

  while (hasMore) {
    // Az API-tól 100-asával kérjük az állásokat (ez nem fogyaszt Firebase kvótát!)
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

      // Végignézzük az ezen az oldalon kapott állásokat
      positions.forEach(job => {
        let isHungarian = false;
        let finalLocation = "Magyarország";

        // 1. Vizsgáljuk a fő lokációt
        const mainLoc = (job.location || "").toLowerCase();
        if (mainLoc.includes("hungar") || mainLoc.includes("budapest") || mainLoc.includes("magyar")) {
            isHungarian = true;
            finalLocation = job.location;
        }

        // 2. Vizsgáljuk a többes lokációkat (mert a multinacionális cégek ide rejtik el az országokat)
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

        // 1. KAPUŐR: CSAK A MAGYAROKAT VIZSGÁLJUK TOVÁBB!
        if (isHungarian) {
            let title = job.name || "Névtelen pozíció";
            let jobUrl = job.url || `https://jobs.siemens.com/careers/job/${job.id}`;
            let department = job.department || "Siemens";
            
            // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
            // Itt a részleget fűzzük hozzá, hogy jobban tudjon kategorizálni
            const rawDescription = `${department}`;
            const analysis = analyzer.analyzeJob(title, rawDescription);

            // 🧠 3. MÁSODIK KAPUŐR: CSAK AKKOR MENTJÜK, HA PÁLYAKEZDŐ/GYAKORNOK
            if (analysis !== null) {
                allJobs.push({
                  title: title,
                  url: jobUrl,
                  apply_url: jobUrl,
                  location: finalLocation,
                  date_posted: new Date().toISOString(), 
                  
                  // ÚJ CÍMKÉZÉS AZ AGY ALAPJÁN!
                  experience_level: analysis.job_nature,
                  subsidiary: department,
                  employment_type: "Teljes munkaidő",

                  // 🌟 A SZUPERERŐK:
                  faculty: analysis.faculty,
                  work_style: analysis.work_style,
                  tags: analysis.tags
                });
            }
        }
      });

      // Lapozás logika (Itt a letöltött állások számát nézzük, nem a szűrteket, így golyóálló marad!)
      if (positions.length < num) {
          hasMore = false;
      } else {
          start += num;
          // Pici szünet, hogy a Siemens szervere ne tiltson le minket
          await new Promise(r => setTimeout(r, 100)); 
      }

    } catch (err) {
      console.error(`   ❌ [Siemens] Hálózat hiba:`, err.message);
      hasMore = false;
    }
  }

  // Itt már csak az a pár zseniális, diákoknak szóló magyar állás fog kiíródni!
  console.log(`   ✔️  [Siemens] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};