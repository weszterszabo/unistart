const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [K&H Bank] JSON API letöltése indul (Payload varázslat)...`);
  const allJobs = [];
  let page = 1;
  let hasMore = true;
  const seenUrls = new Set(); 

  const apiUrl = "https://karrier.kh.hu/jsbq";

  while (hasMore) {
    console.log(`   ⬇️ [K&H Bank] Lapozás: ${page}. oldal...`);
    
    // A te Payloadod alapján felépített TÖKÉLETES kérés!
    const bodyParams = new URLSearchParams();
    bodyParams.append("init", "1");
    bodyParams.append("ds", "q");
    bodyParams.append("ajax", "1");
    bodyParams.append("isCart", "0");
    // Itt a nagy trükk: a K&H a 'routeQuery' paraméterbe várja a lapozást!
    bodyParams.append("routeQuery", `page=${page}`); 

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
      
      // Ha nincs több sor a válaszban, elértük a legutolsó oldalt
      if (!json.rows || json.rows.length === 0) {
        hasMore = false;
        break;
      }

      let newJobsOnPage = 0;

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
        if (jobUrl && !jobUrl.startsWith("http")) jobUrl = "https://karrier.kh.hu" + jobUrl;

        // Csak akkor mentjük, ha tényleg új állás!
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

      // Végtelen ciklus védelem (most már reméljük nem fog beindulni, mert lapozunk rendesen!)
      if (newJobsOnPage === 0) {
        console.log(`   ⏹️ [K&H Bank] Csak ismétlődő állások érkeztek az API-ból! Vége a lapozásnak.`);
        hasMore = false;
        break;
      }

      // Ellenőrizzük a JSON alapján, hogy van-e még lap
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

  console.log(`   ✔️  [K&H Bank] Siker: ${allJobs.length} db egyedi állás feldolgozva.`);
  return allJobs;
};