const cheerio = require("cheerio");
// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ Stealth Headers (Hogy a WAF és Cloudflare ne blokkoljon azonnal)
const HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "max-age=0"
};

// HTML tisztító segédfüggvény a mélyelemzéshez
const stripHtml = (html) => {
    if (!html) return "";
    return html.toString().replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
};

// Hozzáadva a knownUrls paraméter kompatibilitás miatt
exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  const allJobs = [];
  const seenUrls = new Set();
  
  let currentUrl = baseUrl;
  let hasNextPage = true;
  let pageCount = 1;
  const MAX_PAGES = 15;

  console.log(`   🌐 [CUSTOM Omni-Parser] Indulás: ${companyName}`);

  while (hasNextPage && pageCount <= MAX_PAGES) {
    console.log(`   ⬇️ [CUSTOM] ${pageCount}. oldal letapogatása: ${currentUrl}`);
    try {
      const response = await fetch(currentUrl, { headers: HEADERS });
      
      if (!response.ok) {
        // HTTP Hiba (pl. 403 Forbidden, 404, 500)
        throw new Error(`HTTP Hiba: ${response.status} - ${currentUrl}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // 🔥 WAF / CLOUDFLARE CAPTCHA ELLENŐRZÉS 🔥
      // Megnézzük, hogy az oldal címe vagy tartalma gyanús-e.
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
      
      let jobsFoundOnPage = 0;

      // 🧠 2. SCHEMA.ORG INTELLIGENS KINYERÉS ÉS ELEMZÉS
      $('script[type="application/ld+json"]').each((i, el) => {
        try {
          const rawContent = $(el).html();
          const data = JSON.parse(rawContent.replace(/[\u0000-\u0019]+/g,"")); 
          const items = Array.isArray(data) ? data : (data["@graph"] || [data]);
          
          items.forEach((item) => {
            if (item["@type"] === "JobPosting") {
              const jobUrl = item.url ? (item.url.startsWith('http') ? item.url : new URL(item.url, currentUrl).href) : currentUrl;
              
              if (!seenUrls.has(jobUrl)) {
                seenUrls.add(jobUrl);
                
                const title = item.title || "Névtelen pozíció";
                
                // 🕵️ MÉLY-ADATBÁNYÁSZAT AZ NLP SZÁMÁRA
                const rawDescription = stripHtml(`
                    ${item.description || ""} 
                    ${item.qualifications || ""} 
                    ${item.responsibilities || ""}
                    ${item.employmentType || ""}
                `);

                // 🧠 ELKÜLDJÜK AZ ADATOKAT AZ NLP AGYNAK
                const analysis = analyzer.analyzeJob(title, rawDescription);

                // 🛡️ KAPUŐR
                if (analysis !== null) {
                    jobsFoundOnPage++;

                    let location = "Magyarország";
                    if (item.jobLocation) {
                        const loc = Array.isArray(item.jobLocation) ? item.jobLocation[0] : item.jobLocation;
                        if (loc.address) {
                            location = [loc.address.postalCode, loc.address.addressLocality, loc.address.addressRegion]
                                .filter(Boolean).join(" ") || "Magyarország";
                        }
                    }

                    const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
                    const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
                    const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
                    let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
                    if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

                    allJobs.push({
                      title: title.replace(/\s+/g, ' ').trim(),
                      url: jobUrl,
                      apply_url: jobUrl,
                      location: location.replace(/\s+/g, ' ').trim(),
                      date_posted: item.datePosted || new Date().toISOString(),
                      experience_level: jobNature,
                      subsidiary: item.hiringOrganization?.name || companyName,
                      employment_type: Array.isArray(item.employmentType) ? item.employmentType.join(", ") : (item.employmentType || "Teljes munkaidő"),
                      faculty: faculty,
                      work_style: workStyle,
                      tags: tags
                    });
                }
              }
            }
          });
        } catch (e) {
            // Csendes hiba ezen a konkrét JSON blokkon
        }
      });

      // 🔄 3. LAPOZÁS SZIMULÁLÁSA
      let nextUrl = "";
      $('a').each((i, el) => {
        const text = $(el).text().toLowerCase().trim();
        const href = $(el).attr('href');
        const rel = $(el).attr('rel');
        const ariaLabel = ($(el).attr('aria-label') || "").toLowerCase();
        
        if (href && href !== "#" && !href.startsWith("javascript:")) {
            if (rel === 'next' || text === 'next' || text === 'következő' || text === 'tovább' || text === '>' || text === '»' || ariaLabel.includes('next') || ariaLabel.includes('következő')) {
                const candidateUrl = href.startsWith('http') ? href : new URL(href, currentUrl).href;
                if (candidateUrl.split('#')[0] !== currentUrl.split('#')[0]) {
                    nextUrl = candidateUrl;
                }
            }
        }
      });

      // 🚦 4. CIKLUS KONTROLL
      if (!nextUrl || nextUrl === currentUrl) {
        hasNextPage = false;
        console.log(`   ⏹️ [CUSTOM] Nincs több lapozó gomb. Vége.`);
      } else if (jobsFoundOnPage === 0) {
        if (allJobs.length === 0 && pageCount > 2) {
             console.log(`   ⏹️ [CUSTOM] 3 oldal óta zéró releváns állás. Felesleges tovább lapozni.`);
             hasNextPage = false;
        } else {
            currentUrl = nextUrl;
            pageCount++;
            await new Promise(r => setTimeout(r, 800 + Math.random() * 500));
        }
      } else {
        currentUrl = nextUrl;
        pageCount++;
        await new Promise(r => setTimeout(r, 800 + Math.random() * 500));
      }

    } catch (err) {
      console.error(`   ❌ [CUSTOM] Hiba az oldal olvasásakor:`, err.message);
      
      // 🔥 KRITIKUS JAVÍTÁS:
      // Ha a legelső oldalon (pageCount === 1) hiba történik (blokkolás, rossz URL, 404),
      // továbbdobjuk a hibát az orchestratornak, hogy megmentse a korábbi állásokat.
      if (pageCount === 1) {
        throw err;
      }
      
      // Ha már a második vagy sokadik oldalnál kapunk hibát, beérjük annyival, amit eddig leszedtünk.
      hasNextPage = false;
    }
  }

  console.log(`   ✔️  [CUSTOM] ${companyName} kész! ${allJobs.length} db valid JUNIOR állás mentve.`);
  return allJobs;
};