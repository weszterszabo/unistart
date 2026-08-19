// 🧠 1. BEHÚZZUK A KÖZPONTI AGYAT
const analyzer = require("../analyzer");

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
      // Megfelelő payload formátum
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
        
        // Csak az ÚJ állásokkal foglalkozunk (akkor is, ha később a szűrő kidobja)
        if (jobUrl && !seenUrls.has(jobUrl)) {
          seenUrls.add(jobUrl);
          newJobsThisPage++; // A lapozás biztosításához
          
          const title = eco.item_name || "Névtelen pozíció";
          const department = eco.item_category || "";
          const experience = eco.item_category4 || "";
          const type = eco.item_category3 || "";

          // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
          // A rendelkezésre álló adatokat összefűzzük "leírás" gyanánt
          const rawDescription = `${department} ${experience} ${type}`;
          const analysis = analyzer.analyzeJob(title, rawDescription);

          // 🧠 3. KAPUŐR: CSAK AKKOR MENTJÜK, HA NEM NULL (Azaz ha pályakezdő/gyakornok)
          if (analysis !== null) {
              allJobs.push({
                title: title,
                url: jobUrl,
                apply_url: jobUrl,
                location: eco.location_id || "Magyarország",
                date_posted: new Date().toISOString(), 
                
                // ÚJ CÍMKÉZÉS AZ AGY ALAPJÁN!
                experience_level: analysis.job_nature, // "Gyakornok" vagy "Pályakezdő"
                subsidiary: department, 
                employment_type: type || "Teljes munkaidő",
                
                // 🌟 A SZUPERERŐK: 
                faculty: analysis.faculty,         // pl: 💼 Gazdasági & Üzleti
                work_style: analysis.work_style,   // pl: 📊 Elemző / Adatvezérelt
                tags: analysis.tags                // pl: ["#Excel"]
              });
          }
        }
      });

      // BIZTONSÁGI FÉK: Ha ezen az oldalon nem volt ÚJ link, álljunk meg!
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

  console.log(`   ✔️  [Erste] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};