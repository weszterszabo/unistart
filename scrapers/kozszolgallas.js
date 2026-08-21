const https = require('https');
// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ BIZTONSÁGOS ÉS ÖNGYÓGYÍTÓ HTTPS KÉRÉS (Timeout + Exponenciális Újrapróbálkozás)
async function fetchGovApiWithRetry(postData, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await new Promise((resolve, reject) => {
                const options = {
                    hostname: 'kozszolgallas.ksz.gov.hu',
                    path: '/JobAd/GetJobAdCountFilteredByCities',
                    method: 'POST',
                    rejectUnauthorized: false, // <-- LOKÁLIS SSL BYPASS
                    timeout: 10000, // 🛑 10 másodperc után bontja a kapcsolatot, nem fagy ki a script!
                    headers: {
                        'Content-Type': 'application/json; charset=UTF-8',
                        'Accept': 'application/json, text/javascript, */*; q=0.01',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };

                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(data));
                });

                req.on('error', e => reject(e));
                req.on('timeout', () => { 
                    req.destroy(); 
                    reject(new Error('Közszolgállás Szerver Timeout (10s)')); 
                });
                
                req.write(postData);
                req.end();
            });
        } catch (err) {
            if (attempt === maxRetries) throw err;
            console.log(`      ⚠️ [Közszolgállás] Szerver hiba, újrapróbálkozás (${attempt}/3)...`);
            await new Promise(r => setTimeout(r, 1500 * attempt)); // Exponenciális csúsztatás
        }
    }
}

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Közszolgállás] Phantom-Gov letöltés indul...`);
  const allJobs = [];
  const seenUrls = new Set();

  try {
    const postData = JSON.stringify({});

    // A megbízható hálózati funkció hívása
    const jsonStr = await fetchGovApiWithRetry(postData);
    const json = JSON.parse(jsonStr);
    
    if (!json.Success || !json.Data || json.Data.length === 0) {
      console.log(`   ⏹️ [Közszolgállás] Nincs adat vagy üres válasz érkezett.`);
      return [];
    }

    json.Data.forEach(job => {
      if (!job.Speciality || !job.Id) return;

      const jobUrl = `https://kozszolgallas.ksz.gov.hu/JobAd/Info/${job.Id}`;
      
      // Duplikáció védelem
      if (seenUrls.has(jobUrl)) return;
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

      // 🧠 2. ZSENIÁLIS TRÜKK: Számból szöveges NLP csapda
      let expLevel = "";
      if (job.Experience !== null && job.Experience !== undefined) {
          expLevel = job.Experience === 0 ? "0 év tapasztalat" : `${job.Experience} év tapasztalat`;
      }

      // 🕵️ MÉLY-KONTEXTUS AZ NLP-NEK
      const rawDescription = `${department} ${workType} ${expLevel} ${job.JobCategoryName || ""} ${job.EmploymentTypeName || ""}`;
      const analysis = analyzer.analyzeJob(title, rawDescription);

      // 🛡️ 3. JUNIOR KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT (Pályakezdő/Gyakornok)
      if (analysis !== null) {
          
          // V17 / V16 Kompatibilis kinyerés
          const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
          const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
          const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
          let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
          if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

          // Dátum kezelés: Ha van publikálási dátum jó, de ha csak határidő (SubmissionDeadline) van,
          // akkor is berakjuk egy érvényes ISO stringként, hogy a Firebase ne omlanak össze.
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

            // 🌟 A SZUPERERŐK:
            faculty: faculty,
            work_style: workStyle,
            tags: tags
          });
      }
    });

  } catch (err) {
    console.error(`   ❌ [Közszolgállás] Végzetes Hiba:`, err.message);
  }

  console.log(`   ✔️  [Közszolgállás] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};