const HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"
};

exports.scrape = async function(companyName, baseUrl) {
  // Okos trükk: Ha van pagesize/limit a linkben, maximalizáljuk, hogy ne kelljen lapozni!
  let smartUrl = baseUrl;
  if (smartUrl.includes('pagesize=')) {
      smartUrl = smartUrl.replace(/pagesize=\d+/, 'pagesize=500');
  } else if (smartUrl.includes('?')) {
      smartUrl += '&limit=500';
  } else {
      smartUrl += '?limit=500';
  }

  console.log(`   ⬇️ [SmartRecruiters] Okos JSON API letöltése (Maximalizált limit)...`);
  
  try {
    const response = await fetch(smartUrl, { headers: HEADERS });
    const rawText = await response.text();
    const data = JSON.parse(rawText);
    
    let jobArray = [];
    // Minden elképzelhető kulcs végignézése, amiben állások lehetnek
    const candidateKeys = ['documents', 'content', 'elements', 'hits', 'results', 'items', 'data', 'jobs'];
    
    for (const key of candidateKeys) {
      if (Array.isArray(data[key]) && data[key].length > 0) { jobArray = data[key]; break; }
    }
    if (jobArray.length === 0 && Array.isArray(data)) jobArray = data;

    const allJobs = [];
    jobArray.forEach(item => {
      const title = item.name || item.title || item.jobTitle || item.headline || "Névtelen pozíció";
      let jobUrl = item.url || item.smartRecruitersUrl || item.link || item.applyUrl || "";
      
      if (!jobUrl && item.id) jobUrl = `https://jobs.smartrecruiters.com/BoschGroup/${item.id}`;

      // Helyszín okos kinyerése JSON-ből
      let loc = "";
      if (typeof item.location === 'string') loc = item.location;
      else if (item.location && typeof item.location === 'object') {
        loc = item.location.city || item.location.name || item.location.addressLocality || "";
      }
      loc = loc || item.city || "Magyarország";

      if (title && jobUrl) {
        allJobs.push({
          title: title,
          url: jobUrl,
          apply_url: jobUrl,
          location: loc,
          date_posted: item.releasedDate || item.postedDate || item.createdAt || new Date().toISOString(),
          employment_type: item.typeOfEmployment?.label || item.employment_type || item.contractType?.label || "",
          experience_level: item.experienceLevel?.label || item.experience_level || item.seniority?.label || "",
          subsidiary: item.company?.name || item.brand?.label || ""
        });
      }
    });

    console.log(`   ✔️  [SmartRecruiters] Siker: ${allJobs.length} db állás feldolgozva.`);
    return allJobs;
  } catch (err) {
    console.error(`   ❌ [SmartRecruiters] Hiba a JSON feldolgozásakor:`, err.message);
    return [];
  }
};