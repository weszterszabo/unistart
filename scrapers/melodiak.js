// 🧠 BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ Alapvető API headerek a Meló-Diákhoz
const HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Origin": "https://www.melodiak.hu",
  "Referer": "https://www.melodiak.hu/"
};

// HTML tisztító segédfüggvény (az API is visszaadhat HTML formázott leírást)
const stripHtml = (html) => {
    if (!html) return "";
    return html.toString().replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
};

exports.scrape = async function(companyName = "Meló-Diák", baseUrl = "https://www.melodiak.hu", knownUrls = []) {
  const allJobs = [];
  const seenUrls = new Set();
  
  // A Meló-Diák fő listázó API végpontja
  const API_ENDPOINT = "https://web-api.melodiak.hu/v1/job-advertisement"; 
  
  let pageCount = 1;
  let hasNextPage = true;
  const MAX_PAGES = 20; // Itt lehet sok oldal

  console.log(`   🚀 [MELO-DIAK API SCRAPER] Indulás: ${companyName}`);

  while (hasNextPage && pageCount <= MAX_PAGES) {
    const currentUrl = `${API_ENDPOINT}?page=${pageCount}`;
    console.log(`   ⬇️ [MELO-DIAK] ${pageCount}. API oldal lekérése...`);
    
    try {
      const response = await fetch(currentUrl, { headers: HEADERS });
      
      if (!response.ok) {
        throw new Error(`API HTTP Hiba: ${response.status} - ${currentUrl}`);
      }

      // 📦 Nyers JSON adat kinyerése
      const jsonData = await response.json();
      
      // A Laravel alapú API-k általában a 'data' kulcs alatt küldik a tömböt
      const jobsArray = jsonData.data || jsonData.items || jsonData; 

      if (!jobsArray || jobsArray.length === 0) {
        hasNextPage = false;
        console.log(`   ⏹️ [MELO-DIAK] Nincs több állás az API-ban. Vége.`);
        break;
      }

      let jobsFoundOnPage = 0;

      for (const item of jobsArray) {
        // A te linkedből tudjuk, hogy a 'slug' mező a kulcs! (pl. legyel-te-is-...)
        const slug = item.slug || item.id;
        if (!slug) continue;

        // A jelentkezési URL összeállítása
        const jobUrl = `${baseUrl}/diakmunka/${slug}`; 
        
        if (!seenUrls.has(jobUrl) && !knownUrls.includes(jobUrl)) {
            seenUrls.add(jobUrl);

            // Adatok kinyerése a JSON-ből (biztosítva az alternatív kulcsokat)
            const title = item.title || item.name || item.position || "Névtelen pozíció";
            const location = item.city || item.locationName || item.region?.name || "Magyarország";
            const salary = item.wage || item.salary || item.hourlyWage || "";
            const shortDesc = stripHtml(item.shortDescription || item.description || "");
            
            // Címkék (pl. kategóriák, ha vannak az API-ban)
            let tags = [];
            if (item.jobCategories && Array.isArray(item.jobCategories)) {
                tags = item.jobCategories.map(c => c.name);
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
                    date_posted: item.createdAt || item.publishedAt || new Date().toISOString(),
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

      // 🚦 Lapozás ellenőrzése az API válasza alapján (Laravel pagináció szabvány)
      const lastPage = jsonData.meta?.last_page || jsonData.last_page || jsonData.totalPages;
      
      if (lastPage && pageCount >= lastPage) {
        hasNextPage = false;
      } else if (jobsFoundOnPage === 0 && pageCount > 3) {
         // Ha sokadik oldal óta nincs releváns (pl. csak senior), álljunk le
         hasNextPage = false;
      } else {
        pageCount++;
        await new Promise(r => setTimeout(r, 600)); // Udvarias késleltetés a szerver felé
      }

    } catch (err) {
      console.error(`   ❌ [MELO-DIAK] Hiba az API hívásakor:`, err.message);
      if (pageCount === 1) throw err;
      hasNextPage = false;
    }
  }

  console.log(`   ✔️  [MELO-DIAK] Kész! ${allJobs.length} db valid állás mentve.`);
  return allJobs;
};