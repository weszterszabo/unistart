// EZZEL A SORRAL KIKAPCSOLJUK AZ SSL/TLS BLOKKOLÁST EBBEN A FÁJLBAN!
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Közszolgállás] Állások letöltése indul...`);
  const allJobs = [];

  // A szűrési végpont, ami visszaadja a nyitott pozíciókat
  const apiUrl = "https://kozszolgallas.ksz.gov.hu/JobAd/GetJobAdCountFilteredByCities";

  try {
    // Visszatértünk a fetch-hez, mert ő tudja kicsomagolni a GZIP választ!
    const response = await fetch(apiUrl, {
      method: "POST", // POST kérést indítunk
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
        "X-Requested-With": "XMLHttpRequest"
      },
      // Üres JSON objektumot küldünk, azaz: "Kérem az összes állást, szűrés nélkül!"
      body: JSON.stringify({})
    });

    if (!response.ok) {
      console.error(`   ❌ [Közszolgállás] HTTP hiba: ${response.status}`);
      return [];
    }

    const json = await response.json();
    
    if (!json.Success || !json.Data || json.Data.length === 0) {
      console.log(`   ⏹️ [Közszolgállás] Nincs adat vagy üres válasz érkezett.`);
      return [];
    }

    // Végigmegyünk az összes álláson
    json.Data.forEach(job => {
      // Ha hiányzik az azonosító vagy a név, kihagyjuk
      if (!job.Speciality || !job.Id) return;

      const title = job.Speciality.trim();
      const department = job.CreatorOrganizationName ? job.CreatorOrganizationName.trim() : "Közszolgálat";
      
      let location = "Magyarország";
      if (job.CityName && job.CityGroup) {
          location = `${job.CityName.trim()} (${job.CityGroup.trim()})`;
      } else if (job.CityName) {
          location = job.CityName.trim();
      }

      const jobUrl = `https://kozszolgallas.ksz.gov.hu/JobAd/Info/${job.Id}`;
      let expLevel = (job.Experience !== null && job.Experience !== undefined) ? 
                     (job.Experience === 0 ? "Pályakezdő" : `${job.Experience} év tapasztalat`) : "";

      allJobs.push({
        title: title, 
        url: jobUrl, 
        apply_url: jobUrl, 
        location: location,
        date_posted: job.SubmissionDeadline || new Date().toISOString(),
        experience_level: expLevel, 
        subsidiary: department,
        employment_type: job.WorkTypeName ? job.WorkTypeName.trim() : "Teljes munkaidő"
      });
    });

  } catch (err) {
    console.error(`   ❌ [Közszolgállás] Hálózat hiba:`, err.message);
  }

  console.log(`   ✔️  [Közszolgállás] Siker: ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};