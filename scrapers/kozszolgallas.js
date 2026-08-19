const https = require('https');
// 🧠 1. BEHÚZZUK A KÖZPONTI AGYAT
const analyzer = require("../analyzer");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Közszolgállás] Állások letöltése indul...`);
  const allJobs = [];

  try {
    const postData = JSON.stringify({});

    // A beépített HTTPS modullal küldjük a kérést, így csak erre az egyre vonatkozik az SSL feloldás
    const jsonStr = await new Promise((resolve, reject) => {
        const options = {
            hostname: 'kozszolgallas.ksz.gov.hu',
            path: '/JobAd/GetJobAdCountFilteredByCities',
            method: 'POST',
            rejectUnauthorized: false, // <-- CSAK LOKÁLISAN KAPCSOLJUK KI A VÉDELMET!
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', e => reject(e));
        req.write(postData);
        req.end();
    });

    const json = JSON.parse(jsonStr);
    
    if (!json.Success || !json.Data || json.Data.length === 0) {
      console.log(`   ⏹️ [Közszolgállás] Nincs adat vagy üres válasz érkezett.`);
      return [];
    }

    json.Data.forEach(job => {
      if (!job.Speciality || !job.Id) return;

      const title = job.Speciality.trim();
      const department = job.CreatorOrganizationName ? job.CreatorOrganizationName.trim() : "Közszolgálat";
      const workType = job.WorkTypeName ? job.WorkTypeName.trim() : "Teljes munkaidő";
      
      let location = "Magyarország";
      if (job.CityName && job.CityGroup) {
          location = `${job.CityName.trim()} (${job.CityGroup.trim()})`;
      } else if (job.CityName) {
          location = job.CityName.trim();
      }

      const jobUrl = `https://kozszolgallas.ksz.gov.hu/JobAd/Info/${job.Id}`;
      
      // ZSENIÁLIS TRÜKK: Átalakítjuk a számot olyan szöveggé (pl. "5 év tapasztalat"), 
      // amit az Agy negatív szótára azonnal felismer és blokkol!
      let expLevel = (job.Experience !== null && job.Experience !== undefined) ? 
                     (job.Experience === 0 ? "0 év tapasztalat" : `${job.Experience} év tapasztalat`) : "";

      // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
      const rawDescription = `${department} ${workType} ${expLevel}`;
      const analysis = analyzer.analyzeJob(title, rawDescription);

      // 🧠 3. KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT (Pályakezdő/Gyakornok)
      if (analysis !== null) {
          allJobs.push({
            title: title, 
            url: jobUrl, 
            apply_url: jobUrl, 
            location: location,
            date_posted: job.SubmissionDeadline || new Date().toISOString(),
            
            // ÚJ CÍMKÉZÉS AZ AGY ALAPJÁN!
            experience_level: analysis.job_nature, 
            subsidiary: department,
            employment_type: workType,

            // 🌟 A SZUPERERŐK:
            faculty: analysis.faculty,
            work_style: analysis.work_style,
            tags: analysis.tags
          });
      }
    });

  } catch (err) {
    console.error(`   ❌ [Közszolgállás] Hiba:`, err.message);
  }

  console.log(`   ✔️  [Közszolgállás] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};