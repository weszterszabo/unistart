const crypto = require("crypto");
// 🧠 1. BEHÚZZUK A KÖZPONTI AGYAT
const analyzer = require("../analyzer");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Telekom] REST API letöltése indul...`);
  const allJobs = [];
  
  const apiUrl = "https://www.telekom.hu/karrier/api/jobs?keyword=&areas=";

  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      console.error(`   ❌ [Telekom] Hiba a letöltés során (HTTP ${response.status})`);
      return [];
    }

    const json = await response.json();
    
    // A te mintád alapján a tiszta lista a 'jobList' kulcs alatt van!
    const jobsList = json.jobList || [];

    if (jobsList.length === 0) {
      console.log(`   ⏹️ [Telekom] Jelenleg nincs egyetlen nyitott pozíció sem.`);
      return [];
    }

    jobsList.forEach(job => {
      const title = job.title || "Névtelen pozíció";
      
      // Link összerakása a Telekom egyedi ID-ja alapján
      let jobUrl = "";
      if (job.id) {
          jobUrl = `https://www.telekom.hu/karrier/allasok/${job.id}`;
      } else {
          jobUrl = "https://www.telekom.hu/karrier/allasok";
      }

      // Helyszín (pl. Budapest, Eger, stb.)
      let location = job.location || "Magyarország";

      // Labels (címkék) tömbjéből csinálunk egy szép vesszővel elválasztott listát
      let department = "";
      if (job.labels && Array.isArray(job.labels)) {
          department = job.labels.join(", ");
      }

      // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
      // A részleget odaadjuk "leírásként", ez segít a kategorizálásban
      const rawDescription = `${department}`;
      const analysis = analyzer.analyzeJob(title, rawDescription);

      // 🧠 3. KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT (Pályakezdő vagy Gyakornok)
      if (analysis !== null) {
          allJobs.push({
            title: title,
            url: jobUrl,
            apply_url: jobUrl,
            location: location,
            date_posted: new Date().toISOString(), // A mai napot mentjük, mert az API nem ad dátumot
            
            // ÚJ CÍMKÉZÉS AZ AGY ALAPJÁN!
            experience_level: analysis.job_nature, 
            subsidiary: department || "Magyar Telekom",
            employment_type: "Teljes munkaidő",
            
            // 🌟 A SZUPERERŐK:
            faculty: analysis.faculty,
            work_style: analysis.work_style,
            tags: analysis.tags
          });
      }
    });

  } catch (err) {
    console.error(`   ❌ [Telekom] Hálózat hiba:`, err.message);
  }

  console.log(`   ✔️  [Telekom] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};