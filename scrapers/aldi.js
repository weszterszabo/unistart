const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [ALDI] REST API letöltése indul...`);
  const allJobs = [];
  let page = 1; // Az Aldi API általában 1-től indul
  let hasMore = true;
  const seenUrls = new Set(); // Végtelen ciklus védelem!

  while (hasMore) {
    console.log(`   ⬇️ [ALDI] Lapozás: ${page}. oldal...`);
    const apiUrl = `https://karrier.aldi.hu/rest/jobs/search?page=${page}&size=100`;

    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
      });

      if (!response.ok) {
        console.error(`   ❌ [ALDI] Hiba a letöltés során (HTTP ${response.status})`);
        break;
      }

      const json = await response.json();
      
      // A TE JSON MINTÁD ALAPJÁN a lista a "jobs" kulcsban van!
      const jobsList = json.jobs || [];

      if (jobsList.length === 0) {
        hasMore = false;
        break;
      }

      let newJobsCount = 0;

      jobsList.forEach(job => {
        const title = job.title || "Névtelen pozíció";
        
        let jobUrl = job.url || "";
        if (!jobUrl && job.job_id) jobUrl = `job/${job.job_id}`;
        if (jobUrl && !jobUrl.startsWith("http")) jobUrl = "https://karrier.aldi.hu/" + jobUrl;

        // Csak az új állásokat dolgozzuk fel!
        if (!seenUrls.has(jobUrl)) {
            seenUrls.add(jobUrl);
            newJobsCount++;

            // A te mintád alapján a város a "city" mezőben van
            let location = job.city || "Magyarország";

            const department = job.area_of_activity_title || "";
            const careerLevel = job.career_level_title || "";

            allJobs.push({
              title: title,
              url: jobUrl,
              apply_url: jobUrl,
              location: location,
              date_posted: new Date().toISOString(), // Az API nem adott normális dátumot, így a mai napot kapja
              experience_level: careerLevel, 
              subsidiary: department,
              employment_type: job.shift || "Teljes munkaidő"
            });
        }
      });

      // Ha nem találtunk ÚJ állást az oldalon, leállítjuk a lapozást!
      if (newJobsCount === 0) {
        console.log(`   ⏹️ [ALDI] Csak ismétlődő állások jöttek, vége a lapozásnak!`);
        hasMore = false;
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