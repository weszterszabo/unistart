const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [MVM Csoport] Állások letöltése indul...`);
  const allJobs = [];
  const apiUrl = "https://mvm.karrierportal.hu/jsbq";
  
  let page = 1;
  let hasMore = true;

  try {
    // 🔁 GOLYÓÁLLÓ LAPOZÁS: Addig megyünk, amíg van új állás az oldalon
    while (hasMore) {
      console.log(`   ⬇️ [MVM Csoport] Lapozás: ${page}. oldal lekérése...`);
      
      const requestBody = new URLSearchParams();
      requestBody.append("page", page.toString());
      // Kérünk 100-at, hátha engedi. Ha mégis csak 9-et ad, a ciklus ezt is tökéletesen lekezeli!
      requestBody.append("rowNum", "100");

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
          "X-Requested-With": "XMLHttpRequest"
        },
        body: requestBody
      });

      if (!response.ok) {
        console.error(`   ❌ [MVM Csoport] Hiba a letöltés során (HTTP ${response.status})`);
        break;
      }

      const json = await response.json();
      const rowsList = json.rows || [];

      // Ha üres oldalt kaptunk, végeztünk!
      if (rowsList.length === 0) {
        break; 
      }

      let newJobsOnThisPage = 0;

      rowsList.forEach(jobItem => {
        const htmlRow = jobItem.row || "";
        if (!htmlRow) return;

        // Cím és Link
        const titleLinkMatch = htmlRow.match(/class="[^"]*job_list_title[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        let jobUrl = jobItem.url || "";
        let title = "Névtelen pozíció";
        
        if (titleLinkMatch) {
            if (!jobUrl) jobUrl = titleLinkMatch[1];
            title = titleLinkMatch[2].replace(/<[^>]+>/g, "").trim();
        }
        
        if (jobUrl && !jobUrl.startsWith("http")) jobUrl = "https://mvm.karrierportal.hu" + (jobUrl.startsWith("/") ? "" : "/") + jobUrl;

        // Helyszín
        const cityMatch = htmlRow.match(/class="[^"]*job_list_place[^"]*"[^>]*>.*?<\/span>([\s\S]*?)<\/div>/i);
        let location = cityMatch ? cityMatch[1].replace(/<[^>]+>/g, "").trim() : "Magyarország";

        // Dátum
        const dateMatch = htmlRow.match(/class="[^"]*job_list_application_deadline[^"]*"[^>]*>.*?<\/span>([\s\S]*?)<\/div>/i);
        let deadline = dateMatch ? dateMatch[1].replace(/<[^>]+>/g, "").trim() : new Date().toISOString();
        if (deadline.includes(".")) {
            const parts = deadline.split(".").map(p => p.trim()).filter(Boolean);
            if (parts.length === 3) deadline = `${parts[0]}-${parts[1]}-${parts[2]}`;
        }

        if (title && jobUrl) {
            newJobsOnThisPage++;
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

      // Pagináció (Lapozás) ellenőrzése
      const totalJobs = json.total || 0;
      
      // Ha már begyűjtöttük az összeset, vagy ezen az oldalon nem volt egyetlen új állás sem, megállunk.
      if (allJobs.length >= totalJobs || newJobsOnThisPage === 0) {
          hasMore = false;
      } else {
          page++;
          // Alszunk 300 milliszekundumot a lapozások között, hogy ne tiltson le a szerver a spammelésért
          await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

  } catch (err) {
    console.error(`   ❌ [MVM Csoport] Hálózat hiba:`, err.message);
  }

  console.log(`   ✔️  [MVM Csoport] Siker: ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};