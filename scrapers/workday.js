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
      
      if (jobs.length === 0) {
        hasMore = false;
        console.log("   ⏹️ [Workday] Nincs több állás a listán.");
        break;
      }

      jobs.forEach(job => {
        let jobUrl = job.externalPath ? `https://${new URL(baseUrl).hostname}${job.externalPath}` : baseUrl;
        
        allJobs.push({
          title: job.title || "Névtelen",
          url: jobUrl,
          apply_url: jobUrl,
          location: job.locationsText || "Nincs megadva",
          date_posted: job.postedOn || new Date().toISOString(),
          employment_type: job.timeType || "",
          experience_level: "", 
          subsidiary: ""
        });
      });

      offset += limit;
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`   ❌ [Workday] Hiba a letöltés során:`, err.message);
      hasMore = false;
    }
  }

  return allJobs;
};