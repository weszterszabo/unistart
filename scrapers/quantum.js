const cheerio = require("cheerio");
// 🧠 BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ Stealth Headers a WAF és Cloudflare blokkolás elkerülésére
const HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Cache-Control": "max-age=0",
  "Upgrade-Insecure-Requests": "1"
};

// HTML tisztító segédfüggvény a mélyelemzéshez
const stripHtml = (html) => {
    if (!html) return "";
    return html.toString().replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
};

// Hozzáadva a knownUrls paraméter kompatibilitás miatt az orchestratorhoz
exports.scrape = async function(companyName = "Quantum Diákszövetkezet", baseUrl = "https://cloud.qdiak.hu/munkak", knownUrls = []) {
  const allJobs = [];
  const seenUrls = new Set();
  
  console.log(`   🌐 [QUANTUM SCRAPER] Indulás: ${companyName}`);

  try {
    const response = await fetch(baseUrl, { headers: HEADERS });
    
    if (!response.ok) {
      throw new Error(`HTTP Hiba: ${response.status} - ${baseUrl}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 🔥 WAF / Cloudflare védelem ellenőrzése
    if ($('title').text().toLowerCase().includes("just a moment") || html.includes('id="cf-wrapper"')) {
        throw new Error("WAF / Cloudflare Captcha blokkolás érzékelve az oldalon!");
    }
    
    let jobsFound = 0;

    // 🔍 Végigmegyünk a Material UI kártyákon az ID alapján
    $('.MuiCard-root[data-munkak-job-id]').each((i, el) => {
      // 1. Job ID kinyerése
      const jobId = $(el).attr('data-munkak-job-id');
      if (!jobId) return;

      // 2. Pontos, kattintható URL generálása
      const jobUrl = `https://cloud.qdiak.hu/munkak/${jobId}`;

      // Ha még nem láttuk ezt a linket a mostani futás során, és nincs benne a már ismert URL-ek között
      if (!seenUrls.has(jobUrl) && !knownUrls.includes(jobUrl)) {
        seenUrls.add(jobUrl);

        // 3. Cím és lokáció kinyerése a DOM-ból
        const title = $(el).find('p.MuiTypography-body1').first().text().trim() || "Névtelen pozíció";
        const location = $(el).find('span.MuiTypography-caption').first().text().trim() || "Magyarország";

        // 4. Fizetés és munkaidő metaadat (pl.: "10.000 Ft/próbavásárlás · Rugalmas")
        const metaDiv = $(el).find('div[aria-label*="·"]').first();
        const salaryTime = metaDiv.length ? metaDiv.attr('aria-label') : "";

        // 5. Címkék (chipek) kinyerése, a dizájn elemek (pl. "+2") kiszűrésével
        const domTags = [];
        $(el).find('.MuiChip-label').each((j, chip) => {
          const tagText = $(chip).text().trim();
          if (tagText && !tagText.match(/^\+\d+$/)) {
            domTags.push(tagText);
          }
        });

        // 6. Szöveg előkészítése az NLP számára
        const rawDescription = stripHtml(`
            Fizetés és munkaidő: ${salaryTime}
            Címkék: ${domTags.join(', ')}
            Lokáció: ${location}
        `);

        // 🧠 7. KÖZPONTI NLP AGY HÍVÁSA
        const analysis = analyzer.analyzeJob(title, rawDescription);

        // 🛡️ KAPUŐR
        if (analysis !== null) {
          jobsFound++;

          const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
          const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
          const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
          
          // Címkék összefésülése (NLP által találtak + a weboldalon lévők)
          let finalTags = analysis.airtable_ready?.required_tags || analysis.tags || domTags;
          if (!Array.isArray(finalTags) && analysis.tags?.required) finalTags = analysis.tags.required;

          allJobs.push({
            title: title.replace(/\s+/g, ' ').trim(),
            url: jobUrl,
            apply_url: jobUrl,
            location: location.replace(/\s+/g, ' ').trim(),
            date_posted: new Date().toISOString(), // Mivel nincs egzakt dátum, a futás idejét adjuk meg
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

    console.log(`   ✔️  [QUANTUM] Kész! ${jobsFound} db valid állás mentve.`);

  } catch (err) {
    console.error(`   ❌ [QUANTUM] Hiba a scrape során:`, err.message);
    throw err; // Továbbdobjuk a hibát, hogy a fő folyamat kezelni tudja
  }

  return allJobs;
};