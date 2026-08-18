const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [K&H Bank] JSON API letöltése indul...`);
  const allJobs = [];
  let page = 1;
  let hasMore = true;
  
  // A végtelen ciklus elleni védelem (memória)
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

      // BIZTONSÁGI VÉDŐHÁLÓ a végtelen ciklus ellen
      if (newJobsOnPage === 0) {
        console.log(`   ⏹️ [K&H Bank] Csak ismétlődő állások érkeztek az API-ból! Vége az API lapozásnak.`);
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

  // ========================================================================
  // VÉDŐHÁLÓ: Ha gyanúsan kevés állás jött (pl. az API beragadt 20-nál)
  // ========================================================================
  if (allJobs.length <= 30) {
      console.log(`   ⚠️ [K&H Bank] GYANÚS! Csak ${allJobs.length} állás jött le. Megpróbáljuk a HTML-t is kinyerni a további oldalakról...`);
      
      // Megnézzük a 2., 3., 4., 5. oldalt nyersen a weboldalon
      for (let backupPage = 2; backupPage <= 5; backupPage++) {
          try {
              const res = await fetch(`https://karrier.kh.hu/allasok?page=${backupPage}`);
              const html = await res.text();
              
              const linkRegex = /<a[^>]+href="(\/allas\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
              let match;
              let foundNew = 0;

              while ((match = linkRegex.exec(html)) !== null) {
                  let link = "https://karrier.kh.hu" + match[1];
                  let title = match[2].replace(/<[^>]+>/g, "").trim();

                  if (title && !seenUrls.has(link) && !title.includes("<img")) {
                      seenUrls.add(link);
                      foundNew++;
                      allJobs.push({
                          title: title,
                          url: link,
                          apply_url: link,
                          location: "Magyarország", 
                          date_posted: new Date().toISOString(),
                          experience_level: "", 
                          subsidiary: "",
                          employment_type: ""
                      });
                  }
              }
              if (foundNew === 0) {
                  console.log(`   ⏹️ [K&H Bank HTML] A ${backupPage}. oldalon már nincs új állás.`);
                  break; 
              } else {
                  console.log(`   ✔️  [K&H Bank HTML] Találtunk +${foundNew} új állást a(z) ${backupPage}. oldalon!`);
              }
          } catch (e) { 
              break; 
          }
      }
  }

  console.log(`   ✔️  [K&H Bank] Siker: ${allJobs.length} db egyedi állás feldolgozva.`);
  return allJobs;
};