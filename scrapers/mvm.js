const crypto = require("crypto");
// 🧠 1. BEHÚZZUK A KÖZPONTI AGYAT
const analyzer = require("../analyzer");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [MVM Csoport] Állások letöltése indul...`);
  const allJobs = [];
  const apiUrl = "https://mvm.karrierportal.hu/jsbq";
  
  let page = 1;
  let hasMore = true;
  
  // 🛑 EZ A VÉDŐVONAL A VÉGTELEN CIKLUS ELLEN!
  const seenUrls = new Set(); 

  try {
    // 🔁 GOLYÓÁLLÓ LAPOZÁS: Addig megyünk, amíg van új állás az oldalon
    while (hasMore) {
      console.log(`   ⬇️ [MVM Csoport] Lapozás: ${page}. oldal lekérése...`);
      
      const requestBody = new URLSearchParams();
      requestBody.append("page", page.toString());
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

        // 🛑 DUPLIKÁCIÓ ELLENŐRZÉS: Csak az új állásokkal foglalkozunk!
        if (title && jobUrl && !seenUrls.has(jobUrl)) {
            seenUrls.add(jobUrl);
            newJobsOnThisPage++; // Ezt csak akkor növeljük, ha tényleg új a link!

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

            // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
            const rawDescription = htmlRow.replace(/<[^>]+>/g, " ");
            const analysis = analyzer.analyzeJob(title, rawDescription);

            // 🧠 3. KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT
            if (analysis !== null) {
                allJobs.push({
                  title: title, 
                  url: jobUrl, 
                  apply_url: jobUrl, 
                  location: location,
                  date_posted: deadline, 
                  
                  // ÚJ CÍMKÉZÉS AZ AGY ALAPJÁN!
                  experience_level: analysis.job_nature, 
                  subsidiary: "MVM Csoport", 
                  employment_type: "Teljes munkaidő",
                  
                  // 🌟 A SZUPERERŐK:
                  faculty: analysis.faculty,
                  work_style: analysis.work_style,
                  tags: analysis.tags
                });
            }
        }
      });
      
      // MVM trükk: Ha nem volt egyetlen ÚJ link sem az oldalon, megállítjuk a lapozást!
      if (newJobsOnThisPage === 0) {
          console.log(`   ⏹️ [MVM Csoport] Nincs több ÚJ állás, vége a lapozásnak.`);
          hasMore = false;
      } else {
          page++;
          await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

  } catch (err) {
    console.error(`   ❌ [MVM Csoport] Hálózat hiba:`, err.message);
  }

  // Frissített konzol üzenet, ami jobban tükrözi a valóságot
  console.log(`   ✔️  [MVM Csoport] Siker: A szűrőn fennmaradt ${allJobs.length} db PÁLYAKEZDŐ/JUNIOR/GYAKORNOK állás!`);
  return allJobs;
};