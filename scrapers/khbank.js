const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [K&H Bank] JSON API letöltése indul...`);
  const allJobs = [];
  let page = 1;
  let hasMore = true;
  
  // Ebbe a memóriába mentjük a már látott állások linkjeit (védelem a végtelen ciklus ellen)
  const seenUrls = new Set(); 

  const apiUrl = "https://karrier.kh.hu/jsbq";

  while (hasMore) {
    console.log(`   ⬇️ [K&H Bank] Lapozás: ${page}. oldal...`);
    
    const bodyParams = new URLSearchParams();
    bodyParams.append("page", page.toString());
    bodyParams.append("rowNum", "100"); 

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Referer": "https://karrier.kh.hu/allasok"
        },
        body: bodyParams
      });

      if (!response.ok) {
        console.error(`   ❌ [K&H Bank] Hiba a letöltés során (HTTP ${response.status})`);
        break;
      }

      const json = await response.json();
      
      if (!json.rows || json.rows.length === 0) {
        hasMore = false;
        break;
      }

      let newJobsOnPage = 0; // Számoljuk, hány ÚJ állást találtunk ezen az oldalon

      json.rows.forEach(jobRow => {
        const htmlSnippet = jobRow.highlightedRow || "";
        
        const titleMatch = htmlSnippet.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Névtelen pozíció";

        const locMatch = htmlSnippet.match(/<span itemprop="address"[^>]*>([\s\S]*?)<\/span>/i);
        const location = locMatch ? locMatch[1].replace(/<[^>]+>/g, "").trim() : "Magyarország";

        const expMatch = htmlSnippet.match(/<div[^>]*data-cy="experiences"[^>]*>([\s\S]*?)<\/div>/i);
        const experience = expMatch ? expMatch[1].replace(/<[^>]+>/g, "").trim() : "";

        const deptMatch = htmlSnippet.match(/<div[^>]*data-cy="area"[^>]*>([\s\S]*?)<\/div>/i);
        const department = deptMatch ? deptMatch[1].replace(/<[^>]+>/g, "").trim() : "";

        let jobUrl = jobRow.url || "";
        if (jobUrl && !jobUrl.startsWith("http")) {
            jobUrl = "https://karrier.kh.hu" + jobUrl;
        }

        // CSAK AKKOR MENTJÜK EL, HA MÉG NEM LÁTTUK EZT AZ ÁLLÁST!
        if (!seenUrls.has(jobUrl)) {
            seenUrls.add(jobUrl);
            newJobsOnPage++;
            
            allJobs.push({
              title: title,
              url: jobUrl,
              apply_url: jobUrl,
              location: location,
              date_posted: new Date().toISOString(),
              experience_level: experience, 
              subsidiary: department,
              employment_type: "Teljes munkaidő"
            });
        }
      });

      // BIZTONSÁGI VÉDŐHÁLÓ: Ha a szerver nem adott EGYETLEN új állást sem, azonnal kilépünk!
      if (newJobsOnPage === 0) {
        console.log(`   ⏹️ [K&H Bank] Nem találtunk új állást a(z) ${page}. oldalon, leállítjuk a lapozást!`);
        hasMore = false;
        break;
      }

      // Ellenőrizzük, kell-e még lapoznunk (ha az API elküldte a maximumot)
      const totalPages = parseInt(json.total) || 1;
      if (page >= totalPages) {
        hasMore = false;
      } else {
        page++;
        await new Promise(r => setTimeout(r, 400));
      }

    } catch (err) {
      console.error(`   ❌ [K&H Bank] Hálózat hiba:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [K&H Bank] Siker: ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};