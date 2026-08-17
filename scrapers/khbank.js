const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [K&H Bank] JSON API letöltése indul...`);
  const allJobs = [];
  let page = 1;
  let hasMore = true;

  // A K&H (nNexum) rendszer JSON API végpontja
  const apiUrl = "https://karrier.kh.hu/jobs/get";

  while (hasMore) {
    console.log(`   ⬇️ [K&H Bank] Lapozás: ${page}. oldal...`);
    
    // A POST kérés adatai (form-data), amivel a K&H API-t hívjuk
    const bodyParams = new URLSearchParams();
    bodyParams.append("page", page.toString());
    bodyParams.append("rowNum", "100"); // Egyszerre 100 állást kérünk

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        },
        body: bodyParams
      });

      if (!response.ok) {
        console.error(`   ❌ [K&H Bank] Hiba a letöltés során (HTTP ${response.status})`);
        break;
      }

      const json = await response.json();
      
      // Ha nincs "rows" a JSON-ben, vagy üres, akkor végeztünk
      if (!json.rows || json.rows.length === 0) {
        hasMore = false;
        break;
      }

      // Végigmegyünk a letöltött állásokon
      json.rows.forEach(jobRow => {
        // Maga a pozíció neve a "highlightedRow" HTML-be van beágyazva
        const htmlSnippet = jobRow.highlightedRow || "";
        
        const titleMatch = htmlSnippet.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
        const title = titleMatch ? titleMatch[1].trim() : "Névtelen pozíció";

        const locMatch = htmlSnippet.match(/<span itemprop="address"[^>]*>([\s\S]*?)<\/span>/i);
        const location = locMatch ? locMatch[1].trim() : "Magyarország";

        const expMatch = htmlSnippet.match(/<div[^>]*data-cy="experiences"[^>]*>([\s\S]*?)<\/div>/i);
        const experience = expMatch ? expMatch[1].trim() : "";

        const deptMatch = htmlSnippet.match(/<div[^>]*data-cy="area"[^>]*>([\s\S]*?)<\/div>/i);
        const department = deptMatch ? deptMatch[1].trim() : "";

        let jobUrl = jobRow.url || "";
        if (jobUrl && !jobUrl.startsWith("http")) {
            jobUrl = "https://karrier.kh.hu" + jobUrl;
        }

        allJobs.push({
          title: title,
          url: jobUrl,
          apply_url: jobUrl,
          location: location,
          date_posted: new Date().toISOString(),
          experience_level: experience, 
          subsidiary: department,
          employment_type: ""
        });
      });

      // Ellenőrizzük, kell-e még lapoznunk
      const totalPages = parseInt(json.total) || 1;
      if (page >= totalPages) {
        hasMore = false;
      } else {
        page++;
        await new Promise(r => setTimeout(r, 400)); // Pici várakozás a következő oldal előtt
      }

    } catch (err) {
      console.error(`   ❌ [K&H Bank] Hálózat hiba:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [K&H Bank] Siker: ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};