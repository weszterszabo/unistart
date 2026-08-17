const HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://jobs.bosch.com/"
};

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [SmartRecruiters] Okos JSON API lapozó indítása...`);
  const allJobs = [];
  
  // Kiszedjük a linkből a meglévő limit/offset/pagesize adatokat, hogy mi irányítsuk a lapozást
  let cleanUrl = baseUrl.replace(/(&|\?)limit=\d+/g, '').replace(/(&|\?)offset=\d+/g, '').replace(/(&|\?)pagesize=\d+/g, '');
  const sep = cleanUrl.includes('?') ? '&' : '?';

  let offset = 0;
  const limit = 100; // A SmartRecruiters szerver "Hard Limit"-je
  let hasMore = true;
  let page = 1;

  while (hasMore) {
    const currentUrl = `${cleanUrl}${sep}limit=${limit}&offset=${offset}`;
    console.log(`   ⬇️ [SmartRecruiters] Oldal ${page} letöltése (${offset} - ${offset + limit})...`);

    try {
      const response = await fetch(currentUrl, { headers: HEADERS });
      const rawText = await response.text();
      
      let data;
      try {
          data = JSON.parse(rawText);
      } catch (parseError) {
          console.error(`   ❌ [SmartRecruiters] Érvénytelen JSON válasz.`);
          hasMore = false;
          break;
      }
      
      let jobArray = [];
      const candidateKeys = ['content', 'documents', 'elements', 'hits', 'results', 'items', 'data', 'jobs'];
      
      for (const key of candidateKeys) {
        if (data && typeof data === 'object' && Array.isArray(data[key]) && data[key].length > 0) { 
            jobArray = data[key]; 
            break; 
        }
      }
      if (jobArray.length === 0 && Array.isArray(data)) jobArray = data;

      if (jobArray.length === 0) {
        console.log(`   ⏹️ [SmartRecruiters] Nincs több állás ezen az oldalon.`);
        hasMore = false;
        break;
      }

      jobArray.forEach(item => {
        const title = item.name || item.title || item.jobTitle || item.headline || "Névtelen pozíció";
        let jobUrl = item.url || item.smartRecruitersUrl || item.link || item.applyUrl || "";
        
        if (!jobUrl && item.id) jobUrl = `https://jobs.smartrecruiters.com/BoschGroup/${item.id}`;

        let loc = "";
        if (typeof item.location === 'string') loc = item.location;
        else if (item.location && typeof item.location === 'object') {
          loc = item.location.city || item.location.name || item.location.addressLocality || item.location.region || "";
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

      // Ha kevesebb állás jött vissza, mint a maximum 100, akkor biztosan elértük a lista végét!
      if (jobArray.length < limit) {
        console.log(`   ⏹️ [SmartRecruiters] Elértük a lista végét (${jobArray.length} db jött az utolsó oldalon).`);
        hasMore = false;
      } else {
        // Ha pont 100 jött, akkor van még következő oldal!
        offset += limit;
        page++;
        await new Promise(r => setTimeout(r, 400)); // Pici várakozás, hogy ne tiltsanak le
      }

    } catch (err) {
      console.error(`   ❌ [SmartRecruiters] Hálózat vagy JSON hiba:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [SmartRecruiters] Siker: Összesen ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};