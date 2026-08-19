const crypto = require("crypto");
// 🧠 1. BEHÚZZUK A KÖZPONTI AGYAT
const analyzer = require("../analyzer");

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
      const cityMatch = htmlRow.match(/class="[^"]*job_list_city[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      let location = cityMatch ? cityMatch[1].replace(/<[^>]+>/g, "").trim() : "Magyarország";
      // Sokszor benne van a pontos utca is, azt levágjuk
      if (location.includes(",")) location = location.split(",")[0].replace(/\d{4}/, "").trim();

      // 3. Részleg/Kategória kinyerése
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
          
          // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
          // Megtisztítjuk a html-t, és hozzácsapjuk a részleget meg a tapasztalatot, hogy az Agy 100%-os biztonsággal döntsön
          const cleanText = htmlRow.replace(/<[^>]+>/g, " ");
          const rawDescription = `${cleanText} ${department} ${experience} ${employmentType}`;
          const analysis = analyzer.analyzeJob(title, rawDescription);

          // 🧠 3. KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT (Nem null)
          if (analysis !== null) {
              allJobs.push({
                title: title,
                url: jobUrl,
                apply_url: jobUrl,
                location: location,
                date_posted: new Date().toISOString(),
                
                // ÚJ CÍMKÉZÉS AZ AGY ALAPJÁN!
                experience_level: analysis.job_nature, 
                subsidiary: department,
                employment_type: employmentType,

                // 🌟 A SZUPERERŐK:
                faculty: analysis.faculty,
                work_style: analysis.work_style,
                tags: analysis.tags
              });
          }
      }
    });

  } catch (err) {
    console.error(`   ❌ [Magyar Posta] Hálózat hiba:`, err.message);
  }

  console.log(`   ✔️  [Magyar Posta] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};