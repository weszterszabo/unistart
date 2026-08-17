const HEADERS = {
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
  "Referer": "https://karrier.erstebank.hu/allasok"
};

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Erste] Titkos JSBQ API letöltése indul...`);
  const allJobs = [];
  const seenUrls = new Set(); // VÉDELEM A VÉGTELEN CIKLUS ELLEN!
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    console.log(`   ⬇️ [Erste] Oldal ${page} lekérése...`);
    try {
      // Megfelelő payload formátum: az 'extra' mezőben JSON formában utazik a lapozás és a limit (100)
      const extraParam = JSON.stringify({ page: page, rowNum: "100" }); 
      const bodyData = `q=ds&ajax=1&extra=${encodeURIComponent(extraParam)}`;
      
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: HEADERS,
        body: bodyData
      });
      
      const data = await response.json();
      const rows = data.rows || [];
      
      if (rows.length === 0) {
        console.log(`   ⏹️ [Erste] Nincs több állás a listában.`);
        hasMore = false;
        break;
      }

      let newJobsThisPage = 0;

      rows.forEach(item => {
        const eco = item.ecommerceData || {};
        const jobUrl = item.url ? `https://karrier.erstebank.hu${item.url}` : "";
        
        if (jobUrl && !seenUrls.has(jobUrl)) {
          seenUrls.add(jobUrl);
          newJobsThisPage++;
          allJobs.push({
            title: eco.item_name || "Névtelen pozíció",
            url: jobUrl,
            apply_url: jobUrl,
            location: eco.location_id || "Magyarország",
            date_posted: new Date().toISOString(), 
            employment_type: eco.item_category3 || "", 
            experience_level: eco.item_category4 || "", 
            subsidiary: eco.item_category || "" 
          });
        }
      });

      // BIZTONSÁGI FÉK: Ha ezen az oldalon nem volt ÚJ állás (mert a szerver ismétel), azonnal álljunk meg!
      if (newJobsThisPage === 0) {
         console.log(`   ⏹️ [Erste] Csak ismétlődő állások érkeztek, vége a lapozásnak!`);
         hasMore = false;
      } else {
         page++;
         await new Promise(r => setTimeout(r, 400));
      }

    } catch (err) {
      console.error(`   ❌ [Erste] Hálózat vagy JSON hiba:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [Erste] Siker: ${allJobs.length} db egyedi állás feldolgozva.`);
  return allJobs;
};