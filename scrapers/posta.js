const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Magyar Posta] API letöltése indul...`);
  const allJobs = [];

  const apiUrl = "https://karrier.posta.hu/jsbq";

  try {
    // 10000-et kérünk egyszerre, hogy egyetlen kéréssel lejöjjön az összes posta állás
    const requestBody = new URLSearchParams();
    requestBody.append("page", "1");
    requestBody.append("rowNum", "10000");

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: requestBody
    });

    if (!response.ok) {
      console.error(`   ❌ [Magyar Posta] Hiba a letöltés során (HTTP ${response.status})`);
      return [];
    }

    const json = await response.json();
    const rowsList = json.rows || [];

    if (rowsList.length === 0) {
      console.log(`   ⏹️ [Magyar Posta] Jelenleg nincs egyetlen nyitott pozíció sem.`);
      return [];
    }

    rowsList.forEach(jobItem => {
      // A Posta API egy "row" nevű kulcsban adja a teljes HTML kódot az adott állás kártyájáról!
      const htmlRow = jobItem.row || "";
      if (!htmlRow) return;

      // 1. Link és Cím kinyerése Regex segítségével a HTML-ből
      // <a class="jobList__item__title" href="/allas/valami" >Állás neve</a>
      const titleLinkMatch = htmlRow.match(/class="[^"]*jobList__item__title[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      let jobUrl = jobItem.url || "";
      let title = "Névtelen pozíció";
      
      if (titleLinkMatch) {
          if (!jobUrl) jobUrl = titleLinkMatch[1];
          title = titleLinkMatch[2].replace(/<[^>]+>/g, "").trim();
      }
      
      if (jobUrl && !jobUrl.startsWith("http")) {
          jobUrl = "https://karrier.posta.hu" + (jobUrl.startsWith("/") ? "" : "/") + jobUrl;
      }

      // 2. Város kinyerése
      // <div class="iconInfo--address job_list_city">Budapest</div>
      const cityMatch = htmlRow.match(/class="[^"]*job_list_city[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      let location = cityMatch ? cityMatch[1].replace(/<[^>]+>/g, "").trim() : "Magyarország";
      // Sokszor benne van a pontos utca is, azt levágjuk (pl. "1114 Budapest, Fehérvári út 9." -> "Budapest")
      if (location.includes(",")) location = location.split(",")[0].replace(/\d{4}/, "").trim();

      // 3. Részleg/Kategória kinyerése
      // <div class="iconInfo--area job_list_specialities">Logisztika</div>
      const catMatch = htmlRow.match(/class="[^"]*job_list_specialities[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const department = catMatch ? catMatch[1].replace(/<[^>]+>/g, "").trim() : "Posta";

      // 4. Tapasztalat kinyerése
      const expMatch = htmlRow.match(/class="[^"]*job_list_experiences[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const experience = expMatch ? expMatch[1].replace(/<[^>]+>/g, "").trim() : "";

      // 5. Műszak/Munkaidő
      const scheduleMatch = htmlRow.match(/class="[^"]*iconInfo--schedule[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const employmentType = scheduleMatch ? scheduleMatch[1].replace(/<[^>]+>/g, "").trim() : "Teljes munkaidő";

      // Csak az érvényeseket mentjük
      if (title && jobUrl) {
          allJobs.push({
            title: title,
            url: jobUrl,
            apply_url: jobUrl,
            location: location,
            date_posted: new Date().toISOString(),
            experience_level: experience, 
            subsidiary: department,
            employment_type: employmentType
          });
      }
    });

  } catch (err) {
    console.error(`   ❌ [Magyar Posta] Hálózat hiba:`, err.message);
  }

  console.log(`   ✔️  [Magyar Posta] Siker: ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};