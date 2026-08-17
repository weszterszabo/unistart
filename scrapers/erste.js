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
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    console.log(`   ⬇️ [Erste] Oldal ${page} lekérése...`);
    try {
      // Ez az a "titkos jelszó" (payload), amit a böngésződ is küld az Erste szerverének
      const bodyData = `q=ds&ajax=1&page=${page}`;
      
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: HEADERS,
        body: bodyData
      });
      
      const data = await response.json();
      const rows = data.rows || [];
      
      if (rows.length === 0) {
        console.log(`   ⏹️ [Erste] Elértük a lista végét.`);
        hasMore = false;
        break;
      }

      rows.forEach(item => {
        const eco = item.ecommerceData || {};
        const jobUrl = item.url ? `https://karrier.erstebank.hu${item.url}` : "";
        
        if (jobUrl) {
          allJobs.push({
            title: eco.item_name || "Névtelen pozíció",
            url: jobUrl,
            apply_url: jobUrl,
            location: eco.location_id || "Magyarország",
            date_posted: new Date().toISOString(), // A rejtett API nem ad dátumot, így a mai napot kapja
            employment_type: eco.item_category3 || "", // Pl: Teljes munkaidő
            experience_level: eco.item_category4 || "", // Pl: Gyakornok / pályakezdő
            subsidiary: eco.item_category || "" // Pl: Fiókhálózat
          });
        }
      });

      // A JSON-ben a 'rowNum' mutatja, mennyi a max állás egy oldalon (általában 30)
      const maxRows = parseInt(data.rowNum) || 30;
      if (rows.length < maxRows) {
         console.log(`   ⏹️ [Erste] Nincs több teli oldal.`);
         hasMore = false;
      } else {
         page++;
         await new Promise(r => setTimeout(r, 400)); // Várunk egy picit a lapozás előtt
      }

    } catch (err) {
      console.error(`   ❌ [Erste] Hálózat vagy JSON hiba:`, err.message);
      hasMore = false;
    }
  }

  // Szűrő: Duplikációk kiszűrése biztonsági okokból
  const uniqueJobs = allJobs.filter((job, index, self) => 
    index === self.findIndex((t) => (t.url === job.url))
  );

  console.log(`   ✔️  [Erste] Siker: ${uniqueJobs.length} db egyedi állás feldolgozva.`);
  return uniqueJobs;
};