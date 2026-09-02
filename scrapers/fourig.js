const cheerio = require("cheerio");
// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ Stealth Headers: SAP SuccessFactors WAF (Tűzfal) elleni védelem
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "max-age=0",
  "Connection": "keep-alive"
};

// 🔥 JAVÍTÁS: Hozzáadva a knownUrls paraméter
exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  console.log(`   ⬇️ [4iG / ONE] Phantom-SAP Scraper elindult...`);
  const allJobs = [];
  let startrow = 0;
  let hasMore = true;
  const seenUrls = new Set();
  const PAGE_SIZE = 25; // SAP alapértelmezett lapozási méret

  while (hasMore) {
    const targetUrl = `https://karrier.4iggroup.hu/search/?q=&sortColumn=referencedate&sortDirection=desc&startrow=${startrow}`;
    console.log(`   ⬇️ [4iG / ONE] Oldal letöltése: startrow=${startrow}`);
    
    try {
      const response = await fetch(targetUrl, { headers: HEADERS });
      
      // 🔥 JAVÍTÁS: break helyett throw, hogy az 1. oldalas hibát el tudjuk kapni a catch-ben!
      if (!response.ok) {
        throw new Error(`HTTP Hiba a letöltés során (Status: ${response.status})`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      
      // 🔥 WAF / CLOUDFLARE CAPTCHA ELLENŐRZÉS 🔥
      const pageTitle = $('title').text().toLowerCase();
      if (
          pageTitle.includes("just a moment") || 
          pageTitle.includes("attention required") ||
          pageTitle.includes("cloudflare") ||
          html.includes('id="cf-wrapper"') ||
          html.includes('data-ray')
      ) {
          throw new Error("WAF (Cloudflare/F5) Captcha blokkolás érzékelve az oldalon!");
      }

      let newJobsCount = 0;

      // 1. STRATÉGIA: Professzionális DOM bejárás
      let jobLinks = $('a.jobTitle-link');
      
      // VÉDŐHÁLÓ: Ha a 4iG megváltoztatná az osztály nevét, fallback a '/job/' linkekre
      if (jobLinks.length === 0) {
          jobLinks = $('a[href*="/job/"]');
      }

      jobLinks.each((i, el) => {
        let link = $(el).attr('href');
        if (!link) return;
        
        if (!link.startsWith("http")) link = "https://karrier.4iggroup.hu" + link;
        
        // Duplikáció szűrés
        if (seenUrls.has(link)) return;
        seenUrls.add(link);
        newJobsCount++;

        const title = $(el).text().replace(/\s+/g, ' ').trim();
        
        // 🕵️ MÉLY-ADATBÁNYÁSZAT (Kártya szintű kontextus)
        const parentCard = $(el).closest('tr, li, .searchResultItem, .job-row');
        const rawCardText = parentCard.length > 0 ? parentCard.text() : "";

        // Helyszín tisztítása
        let location = parentCard.find('.jobLocation, .jobFacility').text().replace(/\s+/g, ' ').trim();
        if (!location) location = "Magyarország";
        location = location.replace(/,?\s*HU\b/i, '').replace(/,\s*\d{4}/, '').trim(); 

        const department = parentCard.find('.jobDepartment').text().replace(/\s+/g, ' ').trim();

        // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
        const analysis = analyzer.analyzeJob(title, rawCardText);

        // 🛡️ 3. KAPUŐR: Csak a diák/junior állásokat engedjük át
        if (analysis !== null) {
            
            const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
            const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
            const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
            let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
            if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

            allJobs.push({
              title: title,
              url: link,
              apply_url: link,
              location: location,
              date_posted: parentCard.find('.jobDate').text().trim() || new Date().toISOString(),
              experience_level: jobNature,
              subsidiary: department || "4iG / ONE",
              employment_type: "Teljes munkaidő",
              faculty: faculty,
              work_style: workStyle,
              tags: tags
            });
        }
      });

      // 🏎️ 4. OKOS EARLY-EXIT (Lapozás logika)
      if (newJobsCount === 0 || newJobsCount < (PAGE_SIZE * 0.5)) { 
        console.log(`   ⏹️ [4iG / ONE] Elértük az adatbázis végét (Új állások: ${newJobsCount}).`);
        hasMore = false;
      } else {
        startrow += PAGE_SIZE; 
        // 🛑 Anti-Bot Jitter: Véletlenszerű várakozás 600ms és 1100ms között
        await new Promise(r => setTimeout(r, 600 + Math.random() * 500)); 
      }

    } catch (err) {
      console.error(`   ❌ [4iG / ONE] Végzetes Hiba a(z) ${startrow}. sornál:`, err.message);
      
      // 🔥 KRITIKUS JAVÍTÁS:
      // Ha a legelső oldalon (startrow === 0) hibára fut (blokkolás, hálózat, stb.),
      // továbbdobjuk a hibát, így az orchestrator visszatölti a 4iG régi állásait!
      if (startrow === 0) {
        throw err;
      }
      
      // Későbbi oldalaknál elég megállítani a ciklust
      hasMore = false;
    }
  }

  console.log(`   ✔️  [4iG / ONE] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};