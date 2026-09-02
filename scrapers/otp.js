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

// 🛡️ UNIVERZÁLIS GOLYÓÁLLÓ FETCH (Node.js Crash Védelemmel)
async function fetchSafe(url, options = {}, timeoutMs = 12000, type = 'json') {
    const controller = new AbortController();
    options.signal = controller.signal;
    
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            controller.abort(); 
            reject(new Error(`Hálózati időtúllépés (${timeoutMs}ms)`)); 
        }, timeoutMs);
    });

    try {
        const networkTask = fetch(url, options).then(async (res) => {
            if (!res.ok) throw new Error(`HTTP hiba: ${res.status}`);
            
            const contentType = res.headers.get("content-type") || "";
            if (contentType.includes("text/html") && type === 'json') {
                throw new Error("WAF/Captcha blokkolás érzékelve a JSON végponton!");
            }
            
            return type === 'json' ? await res.json() : await res.text();
        });

        // 🔥 KRITIKUS JAVÍTÁS: Csendben lenyeljük az elárvult Abort hibát, hogy a Node.js ne omoljon össze!
        networkTask.catch(() => {});

        const data = await Promise.race([networkTask, timeoutPromise]);
        clearTimeout(timeoutId);
        return data;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

// 🔥 JAVÍTÁS: Hozzáadva a knownUrls = [] paraméter
exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  console.log(`   ⬇️ [OTP] Phantom-SAP Scraper elindult...`);
  const allJobs = [];
  let startrow = 0;
  let hasMore = true;
  const seenUrls = new Set();
  const PAGE_SIZE = 25; 

  while (hasMore) {
    const targetUrl = `https://karrier.otpbank.hu/search/?q=&sortColumn=referencedate&sortDirection=desc&startrow=${startrow}`;
    console.log(`   ⬇️ [OTP] Oldal letöltése: startrow=${startrow}`);
    
    try {
      // 🚀 ERŐSZAKOS FETCH HÍVÁSA HTML (text) MÓDBAN
      const html = await fetchSafe(targetUrl, { headers: HEADERS }, 12000, 'text');
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
      
      if (jobLinks.length === 0) {
          jobLinks = $('a[href*="/job/"]');
      }

      jobLinks.each((i, el) => {
        let link = $(el).attr('href');
        if (!link) return;
        
        if (!link.startsWith("http")) link = "https://karrier.otpbank.hu" + link;
        
        if (seenUrls.has(link)) return;
        seenUrls.add(link);
        newJobsCount++;

        const title = $(el).text().replace(/\s+/g, ' ').trim();
        const parentCard = $(el).closest('tr, li, .searchResultItem, .job-row');
        const rawCardText = parentCard.length > 0 ? parentCard.text() : "";

        let location = parentCard.find('.jobLocation, .jobFacility').text().replace(/\s+/g, ' ').trim();
        if (!location) location = "Budapest"; 
        location = location.replace(/,?\s*HU\b/i, '').replace(/,\s*\d{4}/, '').trim(); 

        const department = parentCard.find('.jobDepartment').text().replace(/\s+/g, ' ').trim();

        // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
        const analysis = analyzer.analyzeJob(title, rawCardText);

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
              subsidiary: department || "OTP Bank",
              employment_type: "Teljes munkaidő",
              faculty: faculty,
              work_style: workStyle,
              tags: tags
            });
        }
      });

      if (newJobsCount === 0 || newJobsCount < (PAGE_SIZE * 0.5)) { 
        console.log(`   ⏹️ [OTP] Elértük az adatbázis végét (Új állások ezen az oldalon: ${newJobsCount}).`);
        hasMore = false;
      } else {
        startrow += PAGE_SIZE; 
        await new Promise(r => setTimeout(r, 600 + Math.random() * 500)); 
      }

    } catch (err) {
      console.error(`   ❌ [OTP] Végzetes Hiba a(z) ${startrow}. sornál:`, err.message);
      
      // 🔥 Ha az 1. oldalon hiba történik, azonnal dobjuk tovább az Orchestratornak
      if (startrow === 0) {
        throw err;
      }
      
      hasMore = false;
    }
  }

  console.log(`   ✔️  [OTP] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};