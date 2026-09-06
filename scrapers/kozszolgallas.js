const https = require('https');
// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🔥 TISZTÍTOTT AGENT (Nincs hibás DNS felülírás, csak sima Keep-Alive)
const secureAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 10,
    rejectUnauthorized: false // Állami lejárt SSL ignorálása
});

// 🛡️ BIZTONSÁGOS ÉS ÖNGYÓGYÍTÓ HTTPS KÉRÉS
async function fetchGovApiWithRetry(postData, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await new Promise((resolve, reject) => {
                const options = {
                    hostname: 'kozszolgallas.ksz.gov.hu',
                    path: '/JobAd/GetJobAdCountFilteredByCities',
                    method: 'POST',
                    agent: secureAgent,
                    family: 4, // <-- A MÁGIA ITT VAN: Natívan letiltja az IPv6-ot, ez megoldja az ECONNRESET-et!
                    timeout: 20000, // 20 másodperc türelmi idő
                    headers: {
                        'Content-Type': 'application/json; charset=UTF-8',
                        'Accept': 'application/json, text/javascript, */*; q=0.01',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                        'X-Requested-With': 'XMLHttpRequest',
                        'Origin': 'https://kozszolgallas.ksz.gov.hu',
                        'Referer': 'https://kozszolgallas.ksz.gov.hu/',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };

                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
                });

                req.on('error', e => reject(e));
                req.on('timeout', () => { 
                    req.destroy(); 
                    reject(new Error('Közszolgállás Szerver Timeout (20s)')); 
                });
                
                req.write(postData);
                req.end();
            });
        } catch (err) {
            if (attempt === maxRetries) throw err;
            console.log(`      ⚠️ [Közszolgállás] Hálózat hiba, újrapróbálkozás (${attempt}/3) [${err.message}]...`);
            await new Promise(r => setTimeout(r, 2000 * attempt)); 
        }
    }
}

// ------------------------------------------------------------------
// 🚀 FŐ SCRAPER EXPORT
// ------------------------------------------------------------------
exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  console.log(`   ⬇️ [Közszolgállás] IPv4 Páncélos letöltés indul...`);
  const allJobs = [];
  const seenUrls = new Set();

  try {
    const postData = JSON.stringify({});

    const response = await fetchGovApiWithRetry(postData);
    
    // Tűzfal hibaoldal detektálása
    const contentType = response.headers['content-type'] || "";
    if (contentType.includes("text/html") || response.data.includes("<html")) {
        throw new Error("WAF / Tűzfal HTML blokkolás érzékelve! A szerver nem engedte be a kérést.");
    }

    const json = JSON.parse(response.data);
    
    if (!json.Success || !json.Data || json.Data.length === 0) {
      console.log(`   ⏹️ [Közszolgállás] Nincs adat vagy üres válasz érkezett.`);
      return [];
    }

    console.log(`      ✅ Sikeres JSON válasz! ${json.Data.length} db állás elemzése indul...`);

    for (const job of json.Data) {
      if (!job.Speciality || !job.Id) continue;

      const jobUrl = `https://kozszolgallas.ksz.gov.hu/JobAd/Info/${job.Id}`;
      
      if (seenUrls.has(jobUrl)) continue;
      seenUrls.add(jobUrl);

      const title = job.Speciality.trim();
      const department = job.CreatorOrganizationName ? job.CreatorOrganizationName.trim() : "Közigazgatás";
      const workType = job.WorkTypeName ? job.WorkTypeName.trim() : "Teljes munkaidő";
      
      let location = "Magyarország";
      if (job.CityName && job.CityGroup && job.CityName !== job.CityGroup) {
          location = `${job.CityName.trim()} (${job.CityGroup.trim()})`;
      } else if (job.CityName) {
          location = job.CityName.trim();
      }

      let expLevel = "";
      if (job.Experience !== null && job.Experience !== undefined) {
          expLevel = job.Experience === 0 ? "0 év tapasztalat" : `${job.Experience} év tapasztalat`;
      }

      const rawDescription = `${department} ${workType} ${expLevel} ${job.JobCategoryName || ""} ${job.EmploymentTypeName || ""}`;
      
      // Küldés a V84-es OMNI-MASTER Agyba
      const analysis = analyzer.analyzeJob(title, rawDescription, companyName);

      // SZELLEMI KAPUŐR (health_score > 0)
      if (analysis !== null && analysis.health_score > 0) {
          
          const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
          const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
          const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
          let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
          if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

          let postedDate = new Date().toISOString();
          if (job.PublishDate) postedDate = new Date(job.PublishDate).toISOString();

          allJobs.push({
            title: title, 
            url: jobUrl, 
            apply_url: jobUrl, 
            location: location,
            date_posted: postedDate,
            experience_level: jobNature, 
            subsidiary: department,
            employment_type: workType,
            faculty: faculty,
            work_style: workStyle,
            tags: tags
          });
      }
    }

  } catch (err) {
    console.error(`   ❌ [Közszolgállás] Végzetes Hiba:`, err.message);
    throw err; 
  }

  console.log(`   ✔️  [Közszolgállás] Siker: A szűrőn fennmaradt ${allJobs.length} db szellemi/junior állás!`);
  return allJobs;
};