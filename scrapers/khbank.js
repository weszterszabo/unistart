const cheerio = require("cheerio");
// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ Stealth Headers: Valódi XMLHttpRequest szimulálása
const HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Referer": "https://karrier.kh.hu/allasok",
  "Origin": "https://karrier.kh.hu"
};

// 🔥 JAVÍTÁS: Hozzáadva a knownUrls = [] paraméter
exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  console.log(`   ⬇️ [K&H Bank] Phantom-JSBQ API letöltése indul...`);
  const allJobs = [];
  const seenUrls = new Set(); 
  
  let page = 1;
  let hasMore = true;
  const apiUrl = "https://karrier.kh.hu/jsbq";

  while (hasMore) {
    console.log(`   ⬇️ [K&H Bank] Lapozás: ${page}. oldal...`);
    
    // JSBQ speciális payload összeállítása
    const bodyParams = new URLSearchParams();
    bodyParams.append("init", "1");
    bodyParams.append("ds", "q");
    bodyParams.append("ajax", "1");
    bodyParams.append("isCart", "0");
    bodyParams.append("routeQuery", `page=${page}`); 

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: HEADERS,
        body: bodyParams
      });

      // 🔥 JAVÍTÁS: break helyett throw, hogy a catch ág lekezelje az első oldali hibát!
      if (!response.ok) {
        throw new Error(`HTTP hiba! Státusz: ${response.status}`);
      }

      // 🔥 WAF / CLOUDFLARE VÉDELEM: Megnézzük, hogy JSON-t kaptunk-e!
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
          throw new Error("WAF (Cloudflare/F5) HTML blokkolás érzékelve a JSON végponton!");
      }

      const json = await response.json();
      
      if (!json.rows || json.rows.length === 0) {
        console.log(`   ⏹️ [K&H Bank] Nincs több állás a listában.`);
        hasMore = false;
        break;
      }

      let newJobsOnPage = 0;

      for (const jobRow of json.rows) {
        // 🕵️ 1. MINDEN HTML TÖREDÉK ÖSSZEGYŰJTÉSE (Deep Extract)
        let htmlSnippet = "";
        for (const key in jobRow) {
            if (typeof jobRow[key] === 'string' && jobRow[key].includes('<')) {
                htmlSnippet += jobRow[key] + " ";
            }
        }

        // Töltsük be a nyers HTML-t a virtuális DOM-ba
        const $ = cheerio.load(htmlSnippet);

        // 2. LINK NORMALIZÁLÁS
        let jobUrl = jobRow.url || "";
        if (jobUrl && !jobUrl.startsWith("http")) jobUrl = "https://karrier.kh.hu" + jobUrl;
        
        if (!jobUrl || seenUrls.has(jobUrl)) continue;
        
        seenUrls.add(jobUrl);
        newJobsOnPage++;

        // 3. ADATOK KINYERÉSE (CSS Szelektorokkal)
        let title = $('h2, .title, [data-cy="title"]').first().text().trim();
        
        if (!title) {
            if (jobRow.title || jobRow.name) title = jobRow.title || jobRow.name;
            else if (jobUrl) {
                const slug = jobUrl.split('/').filter(Boolean).pop();
                if (slug) title = slug.replace(/-\d+$/, '').replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());
            } else title = "Névtelen pozíció";
        }

        let location = $('[itemprop="address"], [data-cy="address"]').first().text().trim() || jobRow.city || "Magyarország";
        let experience = $('[data-cy="experiences"]').first().text().trim();
        let department = $('[data-cy="area"]').first().text().trim();

        if (jobRow.ecommerceData) {
            department = department || jobRow.ecommerceData.item_category || "";
            experience = experience || jobRow.ecommerceData.item_category4 || "";
        }

        // 🧠 4. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
        const cleanDescription = $.text().replace(/\s+/g, ' ').trim();
        const rawContext = `${department} ${experience} ${cleanDescription}`;
        
        const analysis = analyzer.analyzeJob(title, rawContext);

        // 🛡️ 5. JUNIOR KAPUŐR
        if (analysis !== null) {
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
              date_posted: jobRow.publish_date || jobRow.created || new Date().toISOString(),
              
              experience_level: jobNature,
              subsidiary: department || "K&H Csoport",
              employment_type: "Teljes munkaidő", 

              faculty: faculty,
              work_style: workStyle,
              tags: tags
            });
        }
      }

      // 🏎️ 6. OKOS EARLY-EXIT ÉS THROTTLING
      if (newJobsOnPage === 0) {
        console.log(`   ⏹️ [K&H Bank] Csak ismétlődő állások érkeztek az API-ból! Vége a lapozásnak.`);
        hasMore = false;
        break;
      }

      const totalPages = parseInt(json.total) || 1;
      if (page >= totalPages) {
        hasMore = false;
      } else {
        page++;
        // 🛑 Anti-Bot Jitter
        await new Promise(r => setTimeout(r, 400 + Math.random() * 400));
      }

    } catch (err) {
      console.error(`   ❌ [K&H Bank] Végzetes Hiba a(z) ${page}. oldalon:`, err.message);
      
      // 🔥 KRITIKUS JAVÍTÁS:
      // Ha az első oldalon hálózat/tűzfal hiba van, dobjuk tovább az orchestratornak, 
      // hogy megmentse a korábbi K&H-s állásokat!
      if (page === 1) {
          throw err;
      }
      
      hasMore = false;
    }
  }

  console.log(`   ✔️  [K&H Bank] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};