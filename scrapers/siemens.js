const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Siemens] Állások letöltése indul...`);
  const allJobs = [];
  let offset = 0; 
  let hasMore = true;
  const seenUrls = new Set();

  while (hasMore) {
    console.log(`   ⬇️ [Siemens] Lapozás: offset=${offset}...`);
    
    const targetUrl = `https://jobs.siemens.com/en_US/externaljobs/SearchJobs/?keyword=Hungary&listFilterMode=1&jobRecordsPerPage=25&offset=${offset}`;
    
    try {
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Accept": "application/json, text/html, */*" 
        }
      });
      
      if (!response.ok) {
        console.error(`   ❌ [Siemens] Hiba az oldal letöltésekor (HTTP ${response.status})`);
        break;
      }

      let responseText = await response.text();
      let html = responseText;

      // 🕵️‍♂️ Védőháló: Hátha JSON formátumban küldi a HTML-t (Az Avature gyakran csinál ilyet)
      try {
         const jsonObj = JSON.parse(responseText);
         if (jsonObj.html) html = jsonObj.html;
         else if (jsonObj.list) html = jsonObj.list;
         else if (jsonObj.results) html = JSON.stringify(jsonObj.results);
      } catch (e) {
         // Ha nem tudta JSON-ként értelmezni, akkor szerencsére nyers HTML-t kaptunk
      }

      // 🔍 NYOMOZÓ: Kiírjuk az első pár karaktert, hogy lássuk, egyáltalán mit adott vissza a szerver!
      if (offset === 0) {
          console.log(`   🔍 [SIEMENS NYOMOZÓ] Válasz eleje:`, responseText.substring(0, 250).replace(/\n/g, ' '));
      }

      let newJobsCount = 0;

      // 🎯 Szuperszéles kereső: Keresünk minden linket, amiben a /job/ vagy /JobDescription/ szerepel!
      const linkRegex = /<a[^>]+href="([^"]*\/job\/[^"]+|[^"]*\/JobDescription\/[^"]+|[^"]*\/careers\/job\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;

      while ((match = linkRegex.exec(html)) !== null) {
        let link = match[1];
        if (!link.startsWith("http")) {
            link = "https://jobs.siemens.com" + (link.startsWith("/") ? "" : "/") + link;
        }
        
        let title = match[2].replace(/<[^>]+>/g, "").trim();

        if (title && !seenUrls.has(link) && !title.includes("<img") && title.length > 3) {
            seenUrls.add(link);
            newJobsCount++;
            allJobs.push({
                title: title,
                url: link,
                apply_url: link,
                location: "Magyarország", 
                date_posted: new Date().toISOString(),
                experience_level: "",
                subsidiary: "Siemens",
                employment_type: "Teljes munkaidő"
            });
        }
      }

      if (newJobsCount === 0) {
        console.log(`   ⏹️ [Siemens] Nincs több új állás ezen az oldalon, befejezzük a lapozást.`);
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