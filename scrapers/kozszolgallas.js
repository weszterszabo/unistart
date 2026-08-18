const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Közszolgállás] Állások letöltése indul...`);
  const allJobs = [];

  // Ez a végpont adja vissza a teljes magyarországi közszolgálati listát a legtisztább JSON formátumban
  const apiUrl = "https://kozszolgallas.ksz.gov.hu/JobAd/GetJobAdCountFilteredByCities";

  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    if (!response.ok) {
      console.error(`   ❌ [Közszolgállás] Hiba a letöltés során (HTTP ${response.status})`);
      return [];
    }

    const json = await response.json();
    
    if (!json.Success || !json.Data || json.Data.length === 0) {
      console.log(`   ⏹️ [Közszolgállás] Jelenleg nincs egyetlen nyitott pozíció sem az adatbázisban.`);
      return [];
    }

    const jobsData = json.Data;

    jobsData.forEach(job => {
      // Szűrünk: ha nincs meg a munkakör vagy az ID, eldobjuk
      if (!job.Speciality || !job.Id) return;

      const title = job.Speciality.trim();
      const department = job.CreatorOrganizationName ? job.CreatorOrganizationName.trim() : "Közszolgálat";
      
      // Összerakjuk a várost (CityName) és a megyét (CityGroup) egy szép formátumba
      let location = "Magyarország";
      if (job.CityName && job.CityGroup) {
          location = `${job.CityName.trim()} (${job.CityGroup.trim()})`;
      } else if (job.CityName) {
          location = job.CityName.trim();
      }

      // A határidőt kapjuk meg "SubmissionDeadline" néven, ez egy remek plusz infó
      let datePosted = new Date().toISOString();
      if (job.SubmissionDeadline) {
          // Bár ez a lejárati dátum, berakjuk, mert a posztolás idejét ez az API pont nem adja vissza, 
          // a Firestore-ban viszont később esetleg tudunk rá szűrni
          datePosted = job.SubmissionDeadline;
      }

      // Az állás megtekintési URL-je. Az Id alapján generáljuk.
      const jobUrl = `https://kozszolgallas.ksz.gov.hu/JobAd/Info/${job.Id}`;

      // Tapasztalat (Experience: 0, 1, 2... stb.)
      let expLevel = "";
      if (job.Experience !== null && job.Experience !== undefined) {
         expLevel = job.Experience === 0 ? "Pályakezdő (0 év)" : `${job.Experience} év szakmai tapasztalat`;
      }

      allJobs.push({
        title: title,
        url: jobUrl,
        apply_url: jobUrl,
        location: location,
        date_posted: datePosted,
        experience_level: expLevel, 
        subsidiary: department, // Ide tesszük a kiíró intézmény nevét (pl. Óvoda, Kórház)
        employment_type: job.WorkTypeName ? job.WorkTypeName.trim() : "Teljes munkaidő"
      });
    });

  } catch (err) {
    console.error(`   ❌ [Közszolgállás] Hálózat hiba:`, err.message);
  }

  console.log(`   ✔️  [Közszolgállás] Siker: ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};