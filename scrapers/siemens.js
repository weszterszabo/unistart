exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Siemens] Állások letöltése indul...`);
  const allJobs = [];
  let offset = 0; 
  let hasMore = true;
  const seenUrls = new Set();

  while (hasMore) {
    const targetUrl = `https://jobs.siemens.com/en_US/externaljobs/SearchJobs/?keyword=Hungary&listFilterMode=1&jobRecordsPerPage=25&offset=${offset}`;
    
    try {
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36",
          "Accept": "application/json, text/html, */*",
          "X-Requested-With": "XMLHttpRequest" // Ez sokszor szükséges!
        }
      });
      
      if (!response.ok) break;

      let responseText = await response.text();
      let html = responseText;

      try {
         const jsonObj = JSON.parse(responseText);
         if (jsonObj.html) html = jsonObj.html;
         else if (jsonObj.list) html = jsonObj.list;
      } catch (e) {}

      let newJobsCount = 0;

      // BRUTÁLIS MINDENT BELE REGEX: Megfog dupla és szimpla idézőjeles linkeket is!
      const linkRegex = /<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
      let match;

      while ((match = linkRegex.exec(html)) !== null) {
        let link = match[1];
        if (!link.startsWith("http")) link = "https://jobs.siemens.com" + (link.startsWith("/") ? "" : "/") + link;
        
        let title = match[2].replace(/<[^>]+>/g, "").trim();

        // Kiszűrjük azokat a linkeket, amik valóban állások
        if (link.toLowerCase().includes("job") || link.toLowerCase().includes("career")) {
            if (title && !seenUrls.has(link) && !title.includes("<img") && title.length > 3 && !title.toLowerCase().includes("save")) {
                seenUrls.add(link);
                newJobsCount++;
                allJobs.push({
                    title: title, url: link, apply_url: link, location: "Magyarország", 
                    date_posted: new Date().toISOString(), experience_level: "",
                    subsidiary: "Siemens", employment_type: "Teljes munkaidő"
                });
            }
        }
      }

      if (newJobsCount === 0) {
        hasMore = false;
      } else {
        offset += 25; 
        await new Promise(r => setTimeout(r, 400));
      }

    } catch (err) {
      console.error(`   ❌ [Siemens] Hálózat hiba:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [Siemens] Siker: ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};