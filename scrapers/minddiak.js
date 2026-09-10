// 🧠 BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ Alapvető API headerek a Human Centrumhoz
const HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Origin": "https://www.humancentrum.hu",
  "Referer": "https://www.humancentrum.hu/"
};

// HTML tisztító segédfüggvény (mivel az API gazdag HTML leírást is visszaadhat)
const stripHtml = (html) => {
    if (!html) return "";
    return html.toString().replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
};

exports.scrape = async function(companyName = "Human Centrum", baseUrl = "https://www.humancentrum.hu", knownUrls = []) {
  const allJobs = [];
  const seenUrls = new Set();
  
  // A TE ÁLTALAD TALÁLT FŐ API VÉGPONT
  const API_ENDPOINT = "https://api.humancentrum.hu/positions"; 
  
  let page = 1;
  const limit = 20; // Hány állást kérünk le egy oldalon
  let hasNextPage = true;
  const MAX_PAGES = 15;

  console.log(`   🚀 [HUMAN CENTRUM API SCRAPER] Indulás: ${companyName}`);

  // Az általad talált include paraméterek, amik behúzzák a részleteket is
  const includeParams = JSON.stringify([
      {"relation":"positionMd"},
      {"relation":"positionFrontend"},
      {"relation":"positionLanguages"}
  ]);

  while (hasNextPage && page <= MAX_PAGES) {
    const skip = (page - 1) * limit;
    
    // Összerakjuk a lekérdezést (a te linkedből tudjuk, hogy limit és skip alapú a lapozás)
    const currentUrl = `${API_ENDPOINT}?limit=${limit}&skip=${skip}&include=${encodeURIComponent(includeParams)}`;
    
    console.log(`   ⬇️ [HUMAN CENTRUM] ${page}. oldal letöltése... (Skip: ${skip})`);
    
    try {
      const response = await fetch(currentUrl, { headers: HEADERS });
      
      if (!response.ok) {
        throw new Error(`API HTTP Hiba: ${response.status} - ${currentUrl}`);
      }

      const jsonData = await response.json();
      
      // LoopBack API-k általában közvetlenül a tömböt adják vissza, vagy egy 'data' mezőben
      const jobsArray = Array.isArray(jsonData) ? jsonData : (jsonData.data || jsonData.items || []); 

      if (jobsArray.length === 0) {
        hasNextPage = false;
        console.log(`   ⏹️ [HUMAN CENTRUM] Nincs több állás az API-ban. Vége.`);
        break;
      }

      let jobsFoundOnPage = 0;

      for (const item of jobsArray) {
        // ID kinyerése (a linked alapján fixen szám alapú ID-k vannak, pl. 54098)
        const jobId = item.id;
        const slug = item.slug || item.id;
        
        if (!jobId) continue;

        // A jelentkezési URL összerakása (valószínűleg /allas/ vagy /diakmunka/ útvonal)
        const jobUrl = `${baseUrl}/allas/${slug}`; 
        
        if (!seenUrls.has(jobUrl) && !knownUrls.includes(jobUrl)) {
            seenUrls.add(jobUrl);

            // Adatok kinyerése
            // A positionFrontend vagy positionMd tartalmazhatja a publikus leírásokat
            const title = item.name || item.title || item.positionFrontend?.name || "Névtelen pozíció";
            const location = item.city || item.location || item.positionFrontend?.city || "Magyarország";
            const salary = item.wage || item.hourlyWage || item.positionFrontend?.wage || "";
            
            const shortDesc = stripHtml(
                item.description || 
                item.positionFrontend?.description || 
                item.positionMd?.description || 
                ""
            );
            
            // Ha van reláció a nyelvekre, azt is betesszük címkének
            let tags = [];
            if (item.positionLanguages && item.positionLanguages.length > 0) {
                tags.push(...item.positionLanguages.map(l => l.name || "Nyelvtudás"));
            }

            const rawDescription = `
                Fizetés: ${salary}
                Lokáció: ${location}
                Címkék: ${tags.join(', ')}
                Részletek: ${shortDesc} 
            `.replace(/\s+/g, ' ').trim();

            // 🧠 KÖZPONTI NLP AGY HÍVÁSA
            const analysis = analyzer.analyzeJob(title, rawDescription);

            // 🛡️ KAPUŐR
            if (analysis !== null) {
                jobsFoundOnPage++;

                const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
                const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
                const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
                
                let finalTags = analysis.airtable_ready?.required_tags || analysis.tags || tags;
                if (!Array.isArray(finalTags) && analysis.tags?.required) finalTags = analysis.tags.required;

                allJobs.push({
                    title: title.replace(/\s+/g, ' ').trim(),
                    url: jobUrl,
                    apply_url: jobUrl,
                    location: location.trim(),
                    date_posted: item.created || item.createdAt || new Date().toISOString(),
                    experience_level: jobNature,
                    subsidiary: companyName,
                    employment_type: "Diákmunka",
                    faculty: faculty,
                    work_style: workStyle,
                    tags: finalTags
                });
            }
        }
      }

      // 🚦 Lapozás kontroll: Ha kevesebb állás jött le, mint a limit, akkor a végére értünk
      if (jobsArray.length < limit) {
        hasNextPage = false;
      } else if (jobsFoundOnPage === 0 && page > 3) {
         // Biztonsági leállás
         hasNextPage = false;
      } else {
        page++;
        await new Promise(r => setTimeout(r, 600)); // Udvarias API késleltetés
      }

    } catch (err) {
      console.error(`   ❌ [HUMAN CENTRUM] Hiba az API hívásakor:`, err.message);
      if (page === 1) throw err;
      hasNextPage = false;
    }
  }

  console.log(`   ✔️  [HUMAN CENTRUM] Kész! ${allJobs.length} db valid állás mentve.`);
  return allJobs;
};