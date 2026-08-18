const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [K&H Bank] JSON API letöltése indul (Mindenevő adatszűrővel)...`);
  const allJobs = [];
  let page = 1;
  let hasMore = true;
  const seenUrls = new Set(); 

  const apiUrl = "https://karrier.kh.hu/jsbq";

  while (hasMore) {
    console.log(`   ⬇️ [K&H Bank] Lapozás: ${page}. oldal...`);
    
    const bodyParams = new URLSearchParams();
    bodyParams.append("init", "1");
    bodyParams.append("ds", "q");
    bodyParams.append("ajax", "1");
    bodyParams.append("isCart", "0");
    // Lapozás paraméter
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
      
      if (!json.rows || json.rows.length === 0) {
        hasMore = false;
        break;
      }

      let newJobsOnPage = 0;

      json.rows.forEach(jobRow => {
        
        // 1. MINDEN HTML KÓD ÖSSZEGYŰJTÉSE (Bármilyen néven is jön)
        let htmlSnippet = "";
        for (const key in jobRow) {
            if (typeof jobRow[key] === 'string' && jobRow[key].includes('<')) {
                htmlSnippet += jobRow[key] + " ";
            }
        }

        // 2. LINK KINYERÉSE
        let jobUrl = jobRow.url || "";
        if (jobUrl && !jobUrl.startsWith("http")) jobUrl = "https://karrier.kh.hu" + jobUrl;

        // 3. CÍM KINYERÉSE (3 lépcsős védelem)
        let titleMatch = htmlSnippet.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) || 
                         htmlSnippet.match(/class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\//i);
        
        let title = "Névtelen pozíció";
        
        if (titleMatch && titleMatch[1]) {
            // Ha megtalálta a HTML-ben
            title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
        } else if (jobRow.title || jobRow.name) {
            // Ha nyersen benne van a JSON-ben
            title = jobRow.title || jobRow.name;
        } else if (jobUrl) {
            // Védőháló: Kinyerjük az URL-ből (pl. /allas/junior-elemzo-123 -> Junior elemzo)
            const slug = jobUrl.split('/').filter(Boolean).pop();
            if (slug) {
                title = slug.replace(/-\d+$/, '').replace(/-/g, ' '); // Számok és kötőjelek levágása
                title = title.charAt(0).toUpperCase() + title.slice(1); // Kezdőbetű nagybetűsítése
            }
        }

        // 4. HELYSZÍN KINYERÉSE
        let locMatch = htmlSnippet.match(/itemprop="address"[^>]*>([\s\S]*?)<\/span>/i) || 
                       htmlSnippet.match(/data-cy="address"[^>]*>([\s\S]*?)<\//i);
        let location = jobRow.city || "Magyarország";
        if (locMatch && locMatch[1]) {
            location = locMatch[1].replace(/<[^>]+>/g, "").trim();
        }

        // 5. TAPASZTALATI SZINT ÉS SZAKTERÜLET
        let expMatch = htmlSnippet.match(/data-cy="experiences"[^>]*>([\s\S]*?)<\/div>/i);
        let experience = expMatch ? expMatch[1].replace(/<[^>]+>/g, "").trim() : "";

        let deptMatch = htmlSnippet.match(/data-cy="area"[^>]*>([\s\S]*?)<\/div>/i);
        let department = deptMatch ? deptMatch[1].replace(/<[^>]+>/g, "").trim() : "";

        // MENTÉS
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

      if (newJobsOnPage === 0) {
        console.log(`   ⏹️ [K&H Bank] Csak ismétlődő állások érkeztek az API-ból! Vége a lapozásnak.`);
        hasMore = false;
        break;
      }

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