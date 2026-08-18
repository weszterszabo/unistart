const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [LIDL] REST API letöltése indul...`);
  const allJobs = [];
  
  let page = 1; 
  let hasMore = true;

  while (hasMore) {
    console.log(`   ⬇️ [LIDL] Lapozás: ${page}. oldal...`);
    
    // A Lidl API query JSON stringként küldve az URL-ben
    const queryObj = {
        page: page,
        resultsPerPage: 100,
        sortField: "",
        sortOrder: "asc"
    };
    
    const encodedQuery = encodeURIComponent(JSON.stringify(queryObj));
    const apiUrl = `https://jobs.lidl.hu/api/v1/search?general=${encodedQuery}`;

    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        }
      });

      if (!response.ok) {
        console.error(`   ❌ [LIDL] Hiba a letöltés során (HTTP ${response.status})`);
        break;
      }

      const json = await response.json();
      
      // A nyomozásod alapján az állások a 'jobs' kulcs alatt vannak a Lidl-nél!
      const jobsList = json.jobs || [];

      if (!jobsList || jobsList.length === 0) {
        hasMore = false;
        break;
      }

      jobsList.forEach(job => {
        // Cím kinyerése
        const title = job.title || "Névtelen pozíció";
        
        // Link összerakása (A nyomozás alapján a 'jobDetailUrl' a legtökéletesebb!)
        let jobUrl = job.jobDetailUrl || job.url || "";
        if (!jobUrl && job.id) jobUrl = `/jobs/${job.id}`; 
        
        if (jobUrl && !jobUrl.startsWith("http")) {
            jobUrl = "https://jobs.lidl.hu" + (jobUrl.startsWith("/") ? "" : "/") + jobUrl;
        }

        // Helyszín kinyerése (A location objektumból)
        let location = "Magyarország";
        if (job.location && typeof job.location === 'object') {
            location = job.location.city || job.location.name || location;
        } else if (job.city) {
            location = job.city;
        }

        // Tapasztalat, részleg, munkaidő
        const experience = job.entryLevel || "";
        const department = job.employmentArea || job.jobCategory || "";
        const type = job.contractType || job.workingHours || "Teljes munkaidő";
        const datePosted = job.onlineFrom || job.modifiedTime || new Date().toISOString();

        allJobs.push({
          title: title,
          url: jobUrl,
          apply_url: jobUrl, // Vagy használhatnád a job.recruitingUrlEasyApply mezőt is, ha egyenesen a formhoz akarod vinni
          location: location,
          date_posted: datePosted,
          experience_level: experience, 
          subsidiary: department,
          employment_type: type
        });
      });

      // Ellenőrizzük a lapozást: ha kevesebb mint 100 jött, elértük az utolsó oldalt
      if (jobsList.length < 100) {
          hasMore = false; 
      } else {
          page++;
          await new Promise(r => setTimeout(r, 400));
      }

    } catch (err) {
      console.error(`   ❌ [LIDL] Hálózat hiba:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [LIDL] Siker: ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};