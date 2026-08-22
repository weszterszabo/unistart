const cheerio = require("cheerio");
// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [${companyName}] Phantom-JSBQ letöltése indul...`);
  const allJobs = [];
  
  // 🌍 Dinamikus API URL építése a Firebase-ből kapott baseUrl alapján
  // Pl: https://spar.karrierportal.hu/jsbq
  const apiUrl = `${baseUrl.replace(/\/$/, '')}/jsbq`;
  
  // 🛡️ Stealth Headers: Valódi XMLHttpRequest álcázása dinamikus Origin és Referer értékekkel
  const HEADERS = {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": baseUrl,
    "Referer": `${baseUrl.replace(/\/$/, '')}/allasok`
  };

  let page = 1;
  let hasMore = true;
  
  // 🛑 VÉDŐVONAL A DUPLIKÁCIÓK ÉS A VÉGTELEN CIKLUS ELLEN
  const seenUrls = new Set(); 

  try {
    // 🔁 GOLYÓÁLLÓ LAPOZÁS
    while (hasMore) {
      console.log(`   ⬇️ [${companyName}] Lapozás: ${page}. oldal lekérése...`);
      
      const requestBody = new URLSearchParams();
      requestBody.append("page", page.toString());
      requestBody.append("rowNum", "100"); // 100 állás egyszerre!

      // 🛑 Időtúllépés kezelés (10 másodperc), ha a szerver beragadna
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(apiUrl, {
        method: "POST",
        signal: controller.signal,
        headers: HEADERS,
        body: requestBody
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`   ❌ [${companyName}] HTTP Hiba a letöltés során (Status: ${response.status})`);
        break;
      }

      const json = await response.json();
      const rowsList = json.rows || [];

      // Ha üres oldalt kaptunk, végeztünk!
      if (rowsList.length === 0) {
        break; 
      }

      let newJobsOnThisPage = 0;

      for (const jobItem of rowsList) {
        const htmlRow = jobItem.row || "";
        if (!htmlRow) continue;

        // 🕵️ Töltsük be a nyers HTML snippetet a Cheerio virtuális DOM-jába!
        const $ = cheerio.load(htmlRow);

        // 1. Cím és Link kinyerése (Törhetetlen CSS szelektorral)
        const titleElement = $('.job_list_title');
        let title = titleElement.text().replace(/\s+/g, ' ').trim() || "Névtelen pozíció";
        
        let jobUrl = titleElement.attr('href') || jobItem.url || "";
        
        // Dinamikus relatív link kiegészítés a Firebase baseUrl alapján
        if (jobUrl && !jobUrl.startsWith("http")) {
            jobUrl = baseUrl.replace(/\/$/, '') + (jobUrl.startsWith("/") ? "" : "/") + jobUrl;
        }

        // 🛑 DUPLIKÁCIÓ ELLENŐRZÉS
        if (!jobUrl || seenUrls.has(jobUrl)) continue;
        
        seenUrls.add(jobUrl);
        newJobsOnThisPage++; 

        // 2. Helyszín és Dátum kinyerése
        let location = $('.job_list_place').contents().not('span').text().replace(/\s+/g, ' ').trim() || "Magyarország";
        let deadline = $('.job_list_application_deadline').contents().not('span').text().replace(/\s+/g, ' ').trim() || new Date().toISOString();
        
        // Dátum formázása
        if (deadline.includes(".")) {
            const parts = deadline.split(".").map(p => p.trim()).filter(Boolean);
            if (parts.length === 3) deadline = `${parts[0]}-${parts[1]}-${parts[2]}`;
        }

        // 🧠 3. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
        const rawDescription = $.text().replace(/\s+/g, ' ').trim();
        const analysis = analyzer.analyzeJob(title, rawDescription);

        // 🛡️ 4. JUNIOR KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT
        if (analysis !== null) {
            
            const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
            const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
            const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
            let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
            if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

            allJobs.push({
              title: title, 
              url: jobUrl, 
              apply_url: jobUrl, 
              location: location,
              date_posted: deadline,
              
              experience_level: jobNature, 
              subsidiary: companyName, // 🌟 Dinamikusan megkapja a cégnevet (pl. SPAR, MVM, Erste)
              employment_type: "Teljes munkaidő",
              
              faculty: faculty,
              work_style: workStyle,
              tags: tags
            });
        }
      }
      
      // 🏎️ OKOS EARLY-EXIT ÉS THROTTLING
      if (newJobsOnThisPage === 0) {
          console.log(`   ⏹️ [${companyName}] Nincs több ÚJ állás az oldalon, vége a lapozásnak.`);
          hasMore = false;
      } else if (rowsList.length < 100) {
          console.log(`   ⏹️ [${companyName}] Elértük a lista végét (${rowsList.length} állás).`);
          hasMore = false;
      } else {
          page++;
          // 🛑 Anti-Bot Jitter: Véletlenszerű várakozás 300ms és 700ms között
          await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
      }
    }

  } catch (err) {
    console.error(`   ❌ [${companyName}] Hálózat hiba vagy időtúllépés a ${page}. oldalon:`, err.message);
  }

  console.log(`   ✔️  [${companyName}] Siker: A szűrőn fennmaradt ${allJobs.length} db PÁLYAKEZDŐ/JUNIOR/GYAKORNOK állás!`);
  return allJobs;
};