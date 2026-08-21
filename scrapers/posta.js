const cheerio = require("cheerio");
// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ Stealth Headers: Valódi XMLHttpRequest szimulálása
const HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
  "Origin": "https://karrier.posta.hu",
  "Referer": "https://karrier.posta.hu/allasok"
};

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Magyar Posta] Phantom-JSBQ API letöltése indul...`);
  const allJobs = [];
  const seenUrls = new Set(); // 🛑 VÉDELEM A DUPLIKÁCIÓK ELLEN

  const apiUrl = "https://karrier.posta.hu/jsbq";

  try {
    // 10000-et kérünk egyszerre, hogy egyetlen kéréssel lejöjjön az összes posta állás
    const requestBody = new URLSearchParams();
    requestBody.append("page", "1");
    requestBody.append("rowNum", "10000");

    // 🛑 Időtúllépés kezelés (15 másodperc, mert a nagy payload legenerálása lassabb lehet)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(apiUrl, {
      method: "POST",
      signal: controller.signal,
      headers: HEADERS,
      body: requestBody
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`   ❌ [Magyar Posta] HTTP Hiba a letöltés során (Status: ${response.status})`);
      return [];
    }

    const json = await response.json();
    const rowsList = json.rows || [];

    if (rowsList.length === 0) {
      console.log(`   ⏹️ [Magyar Posta] Jelenleg nincs egyetlen nyitott pozíció sem.`);
      return [];
    }

    for (const jobItem of rowsList) {
      const htmlRow = jobItem.row || "";
      if (!htmlRow) continue;

      // 🕵️ Töltsük be a nyers HTML snippetet a Cheerio virtuális DOM-jába!
      const $ = cheerio.load(htmlRow);

      // 1. Cím és Link kinyerése (Törhetetlen CSS szelektorral)
      const titleElement = $('.jobList__item__title').first();
      let title = titleElement.text().replace(/\s+/g, ' ').trim() || "Névtelen pozíció";
      
      let jobUrl = titleElement.attr('href') || jobItem.url || "";
      if (jobUrl && !jobUrl.startsWith("http")) {
          jobUrl = "https://karrier.posta.hu" + (jobUrl.startsWith("/") ? "" : "/") + jobUrl;
      }

      // 🛑 DUPLIKÁCIÓ ELLENŐRZÉS
      if (!jobUrl || seenUrls.has(jobUrl)) continue;
      seenUrls.add(jobUrl);

      // 2. Város kinyerése és letisztítása
      let location = $('.job_list_city').text().replace(/\s+/g, ' ').trim() || "Magyarország";
      // Irányítószám és utca levágása (ugyanaz a remek üzleti logika, amit te írtál)
      if (location.includes(",")) {
          location = location.split(",")[0].replace(/\d{4}/g, "").trim();
      }

      // 3. Egyéb mezők kinyerése
      const department = $('.job_list_specialities').text().replace(/\s+/g, ' ').trim() || "Posta";
      const experience = $('.job_list_experiences').text().replace(/\s+/g, ' ').trim() || "";
      const employmentType = $('.iconInfo--schedule').text().replace(/\s+/g, ' ').trim() || "Teljes munkaidő";

      // 🧠 4. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
      // A Cheerio $.text() leszed minden HTML taget az egész kártyáról, tiszta szöveget kapunk!
      const cleanDescription = $.text().replace(/\s+/g, ' ').trim();
      
      // Ráerősítünk a tapasztalatra és kategóriára, hogy az NLP biztosan kapjon kapaszkodót
      const rawContext = `${department} ${experience} ${employmentType} ${cleanDescription}`;
      const analysis = analyzer.analyzeJob(title, rawContext);

      // 🛡️ 5. JUNIOR KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT
      if (analysis !== null) {
          
          // V17 / V16 Kompatibilis adatkinyerés
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
            date_posted: new Date().toISOString(), // JSBQ-ban nincs dátum, a jelenlegi időpont marad
            
            experience_level: jobNature, 
            subsidiary: department,
            employment_type: employmentType,

            // 🌟 A SZUPERERŐK:
            faculty: faculty,
            work_style: workStyle,
            tags: tags
          });
      }
    }

  } catch (err) {
    console.error(`   ❌ [Magyar Posta] Hálózat hiba vagy időtúllépés:`, err.message);
  }

  console.log(`   ✔️  [Magyar Posta] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};