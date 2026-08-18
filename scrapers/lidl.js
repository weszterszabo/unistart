const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [LIDL] REST API letöltése indul...`);
  const allJobs = [];
  
  let page = 1; 
  let hasMore = true;

  while (hasMore) {
    console.log(`   ⬇️ [LIDL] Lapozás: ${page}. oldal...`);
    
    // Itt van a varázslat: összeállítjuk a Lidl saját API nyelvén a paramétert
    const queryObj = {
        page: page,
        resultsPerPage: 100, // Nem vacakolunk 10-esével, egyből 100-at kérünk!
        sortField: "",
        sortOrder: "asc"
    };
    
    // Ezt átkódoljuk olyan formátumra, amit az URL megért (%7B%22page%22...)
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
      
      // Az eredmények (Lidl API általában a "results" kulcs alatt küldi)
      const jobsList = json.results || json.data || json.items || [];

      if (jobsList.length === 0) {
        hasMore = false;
        break;
      }

      jobsList.forEach(job => {
        // Cím
        const title = job.title || job.jobTitle || "Névtelen pozíció";
        
        // Link összerakása
        let jobUrl = job.url || job.jobUrl || "";
        if (!jobUrl && job.id) jobUrl = `/jobs/${job.id}`; // Fallback, ha csak ID jönne
        
        if (jobUrl && !jobUrl.startsWith("http")) {
            // Biztosítjuk, hogy ne legyen dupla perjel
            jobUrl = "https://jobs.lidl.hu" + (jobUrl.startsWith("/") ? "" : "/") + jobUrl;
        }

        // Helyszín (a Lidl általában pontos várost ad meg)
        let location = "Magyarország";
        if (job.city) location = job.city;
        else if (job.location) {
            if (typeof job.location === 'string') location = job.location;
            else if (job.location.city) location = job.location.city;
        }

        // Tapasztalat, részleg, munkaidő
        const experience = job.entryLevel || job.experienceLevel || "";
        const department = job.department || job.jobCategory || "";
        const type = job.employmentType || job.workingHours || "Teljes munkaidő";
        const datePosted = job.datePosted || job.creationDate || new Date().toISOString();

        allJobs.push({
          title: title,
          url: jobUrl,
          apply_url: jobUrl,
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