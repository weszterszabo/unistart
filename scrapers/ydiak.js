const cheerio = require("cheerio");
// 🧠 BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ Stealth Headers a blokkolás elkerülésére
const HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Cache-Control": "max-age=0",
  "Upgrade-Insecure-Requests": "1"
};

// HTML tisztító segédfüggvény
const stripHtml = (html) => {
    if (!html) return "";
    return html.toString().replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
};

exports.scrape = async function(companyName = "Y Diákszövetkezet", baseUrl = "https://ydiak.hu/aktualis-diakmunkaink", knownUrls = []) {
  const allJobs = [];
  const seenUrls = new Set();
  
  let pageCount = 1;
  let hasNextPage = true;
  const MAX_PAGES = 15;

  console.log(`   🌐 [YDIAK SCRAPER] Indulás: ${companyName}`);

  while (hasNextPage && pageCount <= MAX_PAGES) {
    // A Laravel/Livewire a ?page= paraméterrel kezeli a lapozást
    const currentUrl = pageCount === 1 ? baseUrl : `${baseUrl}?page=${pageCount}`;
    console.log(`   ⬇️ [YDIAK] ${pageCount}. oldal letapogatása: ${currentUrl}`);
    
    try {
      const response = await fetch(currentUrl, { headers: HEADERS });
      
      if (!response.ok) {
        throw new Error(`HTTP Hiba: ${response.status} - ${currentUrl}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      
      let jobsFoundOnPage = 0;

      // 🔍 Végigmegyünk az <article> álláskártyákon a beküldött HTML alapján
      $('article').each((i, el) => {
        // 1. URL kinyerése a jelentkezés gombból
        const jobUrl = $(el).find('a.btn-yellow').attr('href');
        
        if (jobUrl && !seenUrls.has(jobUrl) && !knownUrls.includes(jobUrl)) {
            seenUrls.add(jobUrl);

            // 2. Cím kinyerése
            const title = $(el).find('h4').text().trim() || "Névtelen pozíció";
            
            // 3. Lokáció és Bér kinyerése (a kártya alján lévő ikonok melletti szöveg)
            const details = [];
            $(el).find('.mb-6.mt-auto p').each((j, p) => {
                details.push($(p).text().trim());
            });
            const location = details[0] || "Magyarország"; // Az első <p> a lokáció (Budapest XI.)
            const salary = details[1] || ""; // A második <p> a bér (Bruttó 2 200 Ft/óra)

            // 4. Kategória/Címke kinyerése a kártya tetejéről
            const domTags = [];
            const tagText = $(el).find('span.bg-white').first().text().trim();
            if (tagText) domTags.push(tagText);

            // 5. Rövid leírás kinyerése
            const shortDesc = $(el).find('p.line-clamp-5').text().trim();

            // 6. Szöveg előkészítése a NLP elemzéshez
            const rawDescription = stripHtml(`
                Fizetés: ${salary}
                Lokáció: ${location}
                Címkék: ${domTags.join(', ')}
                Részletek: ${shortDesc} 
            `);

            // 🧠 7. KÖZPONTI NLP AGY HÍVÁSA
            const analysis = analyzer.analyzeJob(title, rawDescription);

            // 🛡️ KAPUŐR
            if (analysis !== null) {
                jobsFoundOnPage++;

                const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
                const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
                const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
                
                // Összefésüljük a weboldal kategóriáját az NLP címkéivel
                let finalTags = analysis.airtable_ready?.required_tags || analysis.tags || domTags;
                if (!Array.isArray(finalTags) && analysis.tags?.required) finalTags = analysis.tags.required;

                allJobs.push({
                    title: title.replace(/\s+/g, ' ').trim(),
                    url: jobUrl,
                    apply_url: jobUrl,
                    location: location.replace(/\s+/g, ' ').trim(),
                    date_posted: new Date().toISOString(),
                    experience_level: jobNature,
                    subsidiary: companyName,
                    employment_type: "Diákmunka",
                    faculty: faculty,
                    work_style: workStyle,
                    tags: finalTags
                });
            }
        }
      });

      // 🚦 8. CIKLUS KONTROLL
      // Ha már az aktuális oldalon egyetlen új állást sem talált, akkor elfogytak az oldalak
      if (jobsFoundOnPage === 0) {
        hasNextPage = false;
        console.log(`   ⏹️ [YDIAK] Nincs több állás. Lapozás befejezve.`);
      } else {
        pageCount++;
        // Késleltetés a túlterhelés elkerülése végett
        await new Promise(r => setTimeout(r, 800 + Math.random() * 500));
      }

    } catch (err) {
      console.error(`   ❌ [YDIAK] Hiba az oldal olvasásakor:`, err.message);
      if (pageCount === 1) throw err;
      hasNextPage = false;
    }
  }

  console.log(`   ✔️  [YDIAK] Kész! ${allJobs.length} db valid állás mentve.`);
  return allJobs;
};