const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Telekom] REST API letöltése indul...`);
  const allJobs = [];
  
  // A Telekom API végpontja, amit megtaláltál
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
    
    // A legtöbb ilyen API közvetlenül egy tömböt ad vissza, vagy egy "jobs", "data" kulcsban van
    const jobsList = Array.isArray(json) ? json : (json.jobs || json.data || json.results || json.content || []);

    if (jobsList.length === 0) {
      console.log(`   ⏹️ [Telekom] Jelenleg nincs egyetlen nyitott pozíció sem, vagy üres a JSON.`);
      return [];
    }

    jobsList.forEach(job => {
      // 1. Cím
      const title = job.title || job.name || job.jobTitle || "Névtelen pozíció";
      
      // 2. Link kinyerése és formázása
      let jobUrl = job.url || job.link || job.applyUrl || "";
      // Ha nincs link, de van ID, megpróbáljuk összerakni (tipikus Telekom struktúra alapján)
      if (!jobUrl && job.id) {
          jobUrl = `https://www.telekom.hu/karrier/allasok/${job.id}`;
      }
      // Relatív URL kiegészítése
      if (jobUrl && !jobUrl.startsWith("http")) {
          jobUrl = "https://www.telekom.hu" + (jobUrl.startsWith("/") ? "" : "/") + jobUrl;
      }

      // 3. Helyszín
      let location = "Magyarország";
      if (job.location) {
          if (typeof job.location === 'string') location = job.location;
          else if (job.location.city) location = job.location.city;
      } else if (job.city) {
          location = job.city;
      }
      
      // Ha a helyszín egy tömb (több város is meg van adva)
      if (Array.isArray(job.location)) {
          location = job.location.join(", ");
      }

      // 4. Egyéb adatok (ha az API biztosítja)
      const experience = job.experienceLevel || job.level || "";
      const department = job.area || job.department || job.category || "";
      const type = job.employmentType || job.workType || "Teljes munkaidő";
      const datePosted = job.date || job.createdAt || job.publishedAt || new Date().toISOString();

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

  } catch (err) {
    console.error(`   ❌ [Telekom] Hálózat hiba:`, err.message);
  }

  console.log(`   ✔️  [Telekom] Siker: ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};