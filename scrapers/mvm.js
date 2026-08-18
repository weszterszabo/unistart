const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [MVM Csoport] API letöltése indul...`);
  const allJobs = [];

  const apiUrl = "https://mvm.karrierportal.hu/jsbq";

  try {
    // 10000-et kérünk egyszerre, hogy egyetlen kéréssel lejöjjön az összes MVM állás
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
      console.error(`   ❌ [MVM Csoport] Hiba a letöltés során (HTTP ${response.status})`);
      return [];
    }

    const json = await response.json();
    const rowsList = json.rows || [];

    if (rowsList.length === 0) {
      console.log(`   ⏹️ [MVM Csoport] Jelenleg nincs egyetlen nyitott pozíció sem.`);
      return [];
    }

    rowsList.forEach(jobItem => {
      const htmlRow = jobItem.row || "";
      if (!htmlRow) return;

      // 1. Link és Cím kinyerése Regex segítségével a HTML-ből
      const titleLinkMatch = htmlRow.match(/class="[^"]*job_list_title[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      let jobUrl = jobItem.url || "";
      let title = "Névtelen pozíció";
      
      if (titleLinkMatch) {
          if (!jobUrl) jobUrl = titleLinkMatch[1];
          title = titleLinkMatch[2].replace(/<[^>]+>/g, "").trim();
      }
      
      if (jobUrl && !jobUrl.startsWith("http")) {
          jobUrl = "https://mvm.karrierportal.hu" + (jobUrl.startsWith("/") ? "" : "/") + jobUrl;
      }

      // 2. Város/Helyszín kinyerése
      // <div class="job_list_place"><span class="label">Helyszín:</span>Budapest, Szeged, Paks</div>
      const cityMatch = htmlRow.match(/class="[^"]*job_list_place[^"]*"[^>]*>.*?<\/span>([\s\S]*?)<\/div>/i);
      let location = cityMatch ? cityMatch[1].replace(/<[^>]+>/g, "").trim() : "Magyarország";

      // 3. Határidő/Dátum kinyerése
      // <div class="job_list_application_deadline"><span class="label">Jelentkezési határidő:</span> 2026.09.17.</div>
      const dateMatch = htmlRow.match(/class="[^"]*job_list_application_deadline[^"]*"[^>]*>.*?<\/span>([\s\S]*?)<\/div>/i);
      let deadline = dateMatch ? dateMatch[1].replace(/<[^>]+>/g, "").trim() : new Date().toISOString();
      if (deadline.includes(".")) {
          // Ha magyar formátum (2026.09.17.), akkor átalakítjuk ISO-ra, hogy szép legyen
          const parts = deadline.split(".").map(p => p.trim()).filter(Boolean);
          if (parts.length === 3) deadline = `${parts[0]}-${parts[1]}-${parts[2]}`;
      }

      // Csak az érvényeseket mentjük
      if (title && jobUrl) {
          allJobs.push({
            title: title,
            url: jobUrl,
            apply_url: jobUrl,
            location: location,
            date_posted: deadline, 
            experience_level: "", 
            subsidiary: "MVM Csoport",
            employment_type: "Teljes munkaidő"
          });
      }
    });

  } catch (err) {
    console.error(`   ❌ [MVM Csoport] Hálózat hiba:`, err.message);
  }

  console.log(`   ✔️  [MVM Csoport] Siker: ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};