// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ Stealth Headers: Valódi böngésző álcázása
const HEADERS = {
  "Accept": "application/json",
  "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Referer": "https://www.telekom.hu/karrier",
  "Origin": "https://www.telekom.hu"
};

// 🔥 JAVÍTÁS: Hozzáadva a knownUrls = [] paraméter
exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  console.log(`   ⬇️ [Telekom] Phantom-API letöltése indul...`);
  const allJobs = [];
  const seenUrls = new Set(); // 🛑 VÉDELEM A DUPLIKÁCIÓK ELLEN
  
  const apiUrl = "https://www.telekom.hu/karrier/api/jobs?keyword=&areas=";

  try {
    // 🛑 Időtúllépés kezelés (10 másodperc), ha az API beragadna
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: HEADERS,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    // 🔥 JAVÍTÁS: return [] helyett throw, hogy az orchestrator tudjon az adatmentésről
    if (!response.ok) {
      throw new Error(`HTTP Hiba a letöltés során (Status: ${response.status})`);
    }

    // 🔥 WAF / CLOUDFLARE VÉDELEM: Megnézzük, hogy JSON-t kaptunk-e!
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
        throw new Error("WAF / Tűzfal HTML blokkolás érzékelve a JSON végponton!");
    }

    const json = await response.json();
    const jobsList = json.jobList || [];

    if (jobsList.length === 0) {
      console.log(`   ⏹️ [Telekom] Jelenleg nincs egyetlen nyitott pozíció sem.`);
      return [];
    }

    for (const job of jobsList) {
      const title = job.title || "Névtelen pozíció";
      
      // Link összerakása és normalizálása
      let jobUrl = job.id ? `https://www.telekom.hu/karrier/allasok/${job.id}` : "";
      if (job.url) {
          jobUrl = job.url.startsWith("http") ? job.url : `https://www.telekom.hu${job.url}`;
      }
      if (!jobUrl) jobUrl = "https://www.telekom.hu/karrier/allasok";

      // 🛑 DUPLIKÁCIÓ ELLENŐRZÉS ON-THE-FLY
      if (seenUrls.has(jobUrl)) continue;
      seenUrls.add(jobUrl);

      // 📍 Helyszín és részleg kinyerése
      let location = job.location || "Magyarország";
      let department = Array.isArray(job.labels) ? job.labels.join(", ") : (job.department || "");

      // 🕵️ MÉLY-ADATBÁNYÁSZAT: Dinamikus mezőkeresés
      const employmentType = job.employmentType || job.workingHours || "Teljes munkaidő";
      const description = job.description || job.shortDescription || job.excerpt || "";

      // Megtisztítjuk és összefűzzük az összes elérhető kontextust az NLP számára!
      const rawDescription = [department, employmentType, description]
        .filter(Boolean)
        .join(" ")
        .replace(/<[^>]*>?/gm, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
      const analysis = analyzer.analyzeJob(title, rawDescription);

      // 🛡️ 3. JUNIOR KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT (Pályakezdő vagy Gyakornok)
      if (analysis !== null) {
          
          // V17 / V16 Kompatibilis adatkinyerés
          const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
          const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
          const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
          let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
          if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

          // Okos Dátum-kereső (Ha van rejtett dátum, kinyeri)
          let postedDate = new Date().toISOString();
          if (job.date || job.publishDate || job.createdAt) {
              const parsedDate = Date.parse(job.date || job.publishDate || job.createdAt);
              if (!isNaN(parsedDate)) postedDate = new Date(parsedDate).toISOString();
          }

          allJobs.push({
            title: title.replace(/\s+/g, ' ').trim(),
            url: jobUrl,
            apply_url: jobUrl,
            location: location.replace(/\s+/g, ' ').trim(),
            date_posted: postedDate,
            
            experience_level: jobNature, 
            subsidiary: department || "Magyar Telekom",
            employment_type: employmentType,
            
            // 🌟 A SZUPERERŐK:
            faculty: faculty,
            work_style: workStyle,
            tags: tags
          });
      }
    }

  } catch (err) {
    console.error(`   ❌ [Telekom] Hálózat hiba vagy időtúllépés:`, err.message);
    
    // 🔥 KRITIKUS JAVÍTÁS:
    // Mivel a Telekomot egyetlen kéréssel húzzuk le, bármilyen hiba (timeout, WAF stb.) esetén
    // azonnal továbbdobjuk a hibát, hogy a rendszer megmentse a tegnapi Telekomos állásokat!
    throw err;
  }

  console.log(`   ✔️  [Telekom] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};