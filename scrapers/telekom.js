const crypto = require("crypto");

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

      // Labels (címkék) tömbjéből csinálunk egy szép vesszővel elválasztott listát a részleghez (subsidiary)
      let department = "";
      if (job.labels && Array.isArray(job.labels)) {
          department = job.labels.join(", ");
      }

      allJobs.push({
        title: title,
        url: jobUrl,
        apply_url: jobUrl,
        location: location,
        date_posted: new Date().toISOString(), // A mai napot mentjük, mert az API nem ad dátumot
        experience_level: "", 
        subsidiary: department,
        employment_type: "Teljes munkaidő"
      });
    });

  } catch (err) {
    console.error(`   ❌ [Telekom] Hálózat hiba:`, err.message);
  }

  console.log(`   ✔️  [Telekom] Siker: ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};