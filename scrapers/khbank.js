const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [K&H Bank] JSON API letöltése indul...`);
  const allJobs = [];
  let page = 1;
  let hasMore = true;

  // A pontos végpont, amit F12-ben megtaláltál!
  const apiUrl = "https://karrier.kh.hu/jsbq";

  while (hasMore) {
    console.log(`   ⬇️ [K&H Bank] Lapozás: ${page}. oldal...`);
    
    // Paraméterek az API számára (POST kérés adatlapja)
    const bodyParams = new URLSearchParams();
    bodyParams.append("page", page.toString());
    bodyParams.append("rowNum", "100"); // 100 állást kérünk egy oldalon

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
      
      // Ha nincs több adat, befejezzük a lapozást
      if (!json.rows || json.rows.length === 0) {
        hasMore = false;
        break;
      }

      // Végigmegyünk a válaszban lévő állásokon
      json.rows.forEach(jobRow => {
        // A JSON-ben a 'highlightedRow' tartalmazza a HTML kódrészletet
        const htmlSnippet = jobRow.highlightedRow || "";
        
        // Kinyerjük a címet
        const titleMatch = htmlSnippet.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Névtelen pozíció";

        // Kinyerjük a helyszínt
        const locMatch = htmlSnippet.match(/<span itemprop="address"[^>]*>([\s\S]*?)<\/span>/i);
        const location = locMatch ? locMatch[1].replace(/<[^>]+>/g, "").trim() : "Magyarország";

        // Kinyerjük a tapasztalati szintet
        const expMatch = htmlSnippet.match(/<div[^>]*data-cy="experiences"[^>]*>([\s\S]*?)<\/div>/i);
        const experience = expMatch ? expMatch[1].replace(/<[^>]+>/g, "").trim() : "";

        // Kinyerjük a szakterületet
        const deptMatch = htmlSnippet.match(/<div[^>]*data-cy="area"[^>]*>([\s\S]*?)<\/div>/i);
        const department = deptMatch ? deptMatch[1].replace(/<[^>]+>/g, "").trim() : "";

        // A link (url) is benne van a JSON-ben tisztán
        let jobUrl = jobRow.url || "";
        if (jobUrl && !jobUrl.startsWith("http")) {
            jobUrl = "https://karrier.kh.hu" + jobUrl;
        }

        allJobs.push({
          title: title,
          url: jobUrl,
          apply_url: jobUrl,
          location: location,
          date_posted: new Date().toISOString(), // Maiként mentjük, mivel az API nem adja vissza fixen
          experience_level: experience, 
          subsidiary: department,
          employment_type: "Teljes munkaidő"
        });
      });

      // Ellenőrizzük a lapozást (json.total adja meg a maximum oldalszámot)
      const totalPages = parseInt(json.total) || 1;
      if (page >= totalPages) {
        hasMore = false;
      } else {
        page++;
        await new Promise(r => setTimeout(r, 500)); // Védelem a szerver túlterhelése ellen
      }

    } catch (err) {
      console.error(`   ❌ [K&H Bank] Hálózat hiba:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [K&H Bank] Siker: ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};