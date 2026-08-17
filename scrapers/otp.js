const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [OTP] SAP Karrieroldal letapogatása indul...`);
  const allJobs = [];
  let startrow = 0;
  let hasMore = true;

  while (hasMore) {
    // Az SAP rendszerek a "startrow" paraméterrel lapoznak (0, 25, 50, stb.)
    const targetUrl = `https://karrier.otpbank.hu/search/?q=&sortColumn=referencedate&sortDirection=desc&startrow=${startrow}`;
    console.log(`   ⬇️ [OTP] Lapozás: startrow=${startrow}`);
    
    try {
      const response = await fetch(targetUrl, {
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" 
        }
      });
      
      const html = await response.text();

      // Keresés az SAP specifikus táblázatsorokra: <tr class="data-row">
      const rowRegex = /<tr class="data-row"[\s\S]*?<\/tr>/g;
      let match;
      let newJobsCount = 0;

      while ((match = rowRegex.exec(html)) !== null) {
        const rowHtml = match[0];

        // 1. Cím és Link kiolvasása
        const aTagMatch = rowHtml.match(/<a[^>]*class="jobTitle-link"[^>]*>([\s\S]*?)<\/a>/);
        if (!aTagMatch) continue;

        const title = aTagMatch[1].replace(/<[^>]+>/g, "").trim(); // Megtisztítjuk a HTML sallangoktól
        const hrefMatch = aTagMatch[0].match(/href="([^"]+)"/);
        if (!hrefMatch) continue;

        let link = hrefMatch[1];
        // Ha relatív a link (pl. /job/...), kiegészítjük a domainnel
        if (!link.startsWith("http")) {
            link = "https://karrier.otpbank.hu" + link;
        }

        // 2. Helyszín kiolvasása
        const locMatch = rowHtml.match(/<span class="jobLocation">([\s\S]*?)<\/span>/);
        const location = locMatch ? locMatch[1].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, ' ') : "Magyarország";

        // 3. Osztály/Terület kiolvasása (Ha van ilyen az OTP oldalán)
        const deptMatch = rowHtml.match(/<span class="jobDepartment">([\s\S]*?)<\/span>/);
        const department = deptMatch ? deptMatch[1].replace(/<[^>]+>/g, "").trim() : "";

        allJobs.push({
          title: title,
          url: link,
          apply_url: link,
          location: location,
          date_posted: new Date().toISOString(), // Mivel a dátum formátuma változó, maiként mentjük
          experience_level: "", 
          subsidiary: department,
          employment_type: ""
        });
        
        newJobsCount++;
      }

      // Ha már nem találtunk új állást a HTML-ben, akkor elértük a végét
      if (newJobsCount === 0) {
        console.log(`   ⏹️ [OTP] Nincs több állás, elértük az utolsó oldalt.`);
        hasMore = false;
      } else {
        startrow += 25; // Az SAP rendszerek 25 állást mutatnak egy oldalon
        await new Promise(r => setTimeout(r, 600)); // Várunk egy picit, hogy ne tiltsanak le
      }

    } catch (err) {
      console.error(`   ❌ [OTP] Hiba a HTML letöltésekor:`, err.message);
      hasMore = false;
    }
  }

  // Duplikációk szűrése a biztonság kedvéért (URL alapján)
  const uniqueJobs = allJobs.filter((job, index, self) => 
    index === self.findIndex((t) => (t.url === job.url))
  );

  console.log(`   ✔️  [OTP] Siker: ${uniqueJobs.length} db egyedi állás feldolgozva.`);
  return uniqueJobs;
};