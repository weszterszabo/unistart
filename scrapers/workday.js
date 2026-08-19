// 🧠 1. BEHÚZZUK A KÖZPONTI AGYAT
const analyzer = require("../analyzer");

const HEADERS = {
  "Accept": "application/json,application/xml",
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"
};

exports.scrape = async function(companyName, baseUrl) {
  const allJobs = [];
  
  // A Workday sima URL-ből kikövetkeztetjük a rejtett API hívást!
  // Pl: https://otpbank.wd3.myworkdayjobs.com/OTP_Karrier -> /wday/cxs/otpbank/OTP_Karrier/jobs
  let apiUrl = baseUrl;
  try {
    const urlObj = new URL(baseUrl);
    const tenant = urlObj.hostname.split('.')[0]; 
    let catalog = urlObj.pathname.replace(/^\/|\/$/g, '').split('/')[0];
    if (!catalog) catalog = "External";
    
    apiUrl = `https://${urlObj.hostname}/wday/cxs/${tenant}/${catalog}/jobs`;
  } catch (e) {
    console.log("   ⚠️ [Workday] Nem sikerült kinyerni az API url-t, próbálkozás fallabackkel...");
    apiUrl = baseUrl.endsWith('/') ? baseUrl + 'jobs' : baseUrl + '/jobs';
  }

  let offset = 0;
  const limit = 20;
  let hasMore = true;

  while (hasMore) {
    console.log(`   ⬇️ [Workday] Állások letöltése ${offset} - ${offset + limit} között...`);
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ offset: offset, limit: limit })
      });
      
      const data = await response.json();
      const jobs = data.jobPostings || [];
      
      // Ha üres oldalt kapunk, végeztünk! (Ez biztosítja, hogy a szűrés ellenére is végiglapozzon)
      if (jobs.length === 0) {
        hasMore = false;
        console.log("   ⏹️ [Workday] Nincs több állás a listán.");
        break;
      }

      jobs.forEach(job => {
        const title = job.title || "Névtelen";
        let jobUrl = job.externalPath ? `https://${new URL(baseUrl).hostname}${job.externalPath}` : baseUrl;
        const timeType = job.timeType || "Teljes munkaidő";
        const location = job.locationsText || "Magyarország";

        // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
        const rawDescription = `${timeType}`;
        const analysis = analyzer.analyzeJob(title, rawDescription);

        // 🧠 3. KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT (Gyakornok vagy Pályakezdő)
        if (analysis !== null) {
            allJobs.push({
              title: title,
              url: jobUrl,
              apply_url: jobUrl,
              location: location,
              date_posted: job.postedOn || new Date().toISOString(),
              
              // ÚJ CÍMKÉZÉS AZ AGY ALAPJÁN!
              experience_level: analysis.job_nature, 
              subsidiary: "", // A Workday alap API lista nézetben ritkán ad részleget
              employment_type: timeType,
              
              // 🌟 A SZUPERERŐK:
              faculty: analysis.faculty,
              work_style: analysis.work_style,
              tags: analysis.tags
            });
        }
      });

      offset += limit;
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`   ❌ [Workday] Hiba a letöltés során:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [Workday] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};