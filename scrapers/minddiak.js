const analyzer = require("../analyzer");

const HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Origin": "https://www.humancentrum.hu",
  "Referer": "https://www.humancentrum.hu/"
};

const stripHtml = (html) => {
    if (!html) return "";
    return html.toString().replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
};

exports.scrape = async function(companyName = "Human Centrum", baseUrl = "https://www.humancentrum.hu", knownUrls = []) {
  const allJobs = [];
  const seenUrls = new Set();
  const API_ENDPOINT = "https://api.humancentrum.hu/positions"; 
  
  let page = 1;
  const limit = 20; 
  let hasNextPage = true;
  const MAX_PAGES = 15;

  console.log(`   🚀 [MIND-DIAK API SCRAPER] Indulás: ${companyName}`);

  const includeParams = JSON.stringify([
      {"relation":"positionMd"},
      {"relation":"positionFrontend"},
      {"relation":"positionLanguages"}
  ]);

  while (hasNextPage && page <= MAX_PAGES) {
    const skip = (page - 1) * limit;
    const currentUrl = `${API_ENDPOINT}?limit=${limit}&skip=${skip}&include=${encodeURIComponent(includeParams)}`;
    
    console.log(`   ⬇️ [MIND-DIAK] ${page}. oldal letöltése... (Skip: ${skip})`);
    
    try {
      const response = await fetch(currentUrl, { headers: HEADERS });
      if (!response.ok) throw new Error(`API HTTP Hiba: ${response.status} - ${currentUrl}`);

      const jsonData = await response.json();
      const jobsArray = Array.isArray(jsonData) ? jsonData : (jsonData.data || jsonData.items || []); 

      if (jobsArray.length === 0) {
        hasNextPage = false;
        break;
      }

      let jobsFoundOnPage = 0;

      for (const item of jobsArray) {
        const jobId = item.id;
        const slug = item.slug || item.id;
        if (!jobId) continue;

        const jobUrl = `${baseUrl}/allas/${slug}`; 
        
        if (!seenUrls.has(jobUrl) && !knownUrls.includes(jobUrl)) {
            seenUrls.add(jobUrl);

            const title = item.name || item.title || item.positionFrontend?.name || "Névtelen pozíció";
            const location = item.city || item.location || item.positionFrontend?.city || "Magyarország";
            const salary = item.wage || item.hourlyWage || item.positionFrontend?.wage || "";
            const shortDesc = stripHtml(item.description || item.positionFrontend?.description || item.positionMd?.description || "");
            
            let tags = [];
            if (item.positionLanguages && item.positionLanguages.length > 0) {
                tags.push(...item.positionLanguages.map(l => l.name || "Nyelvtudás"));
            }

            const rawDescription = `Fizetés: ${salary}\nLokáció: ${location}\nCímkék: ${tags.join(', ')}\nRészletek: ${shortDesc}`.replace(/\s+/g, ' ').trim();

            let finalTags = tags;
            let jobNature = "Pályakezdő";
            let faculty = "Egyéb";
            let workStyle = "";

            // 🛡️ BIZTONSÁGOS NLP HÍVÁS
            if (analyzer && typeof analyzer.analyzeJob === 'function') {
                const analysis = analyzer.analyzeJob(title, rawDescription);
                if (analysis !== null) {
                    jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
                    faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
                    workStyle = analysis.metadata?.work_style || analysis.work_style || "";
                    finalTags = analysis.airtable_ready?.required_tags || analysis.tags || tags;
                    if (!Array.isArray(finalTags) && analysis.tags?.required) finalTags = analysis.tags.required;
                }
            }

            jobsFoundOnPage++;
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
                tags: Array.isArray(finalTags) ? finalTags : [] // Biztosítjuk, hogy tömb legyen!
            });
        }
      }

      if (jobsArray.length < limit) hasNextPage = false;
      else if (jobsFoundOnPage === 0 && page > 3) hasNextPage = false;
      else {
        page++;
        await new Promise(r => setTimeout(r, 600)); 
      }

    } catch (err) {
      console.error(`   ❌ [MIND-DIAK] Hiba az API hívásakor:`, err.message);
      if (page === 1) throw err;
      hasNextPage = false;
    }
  }

  console.log(`   ✔️  [MIND-DIAK] Kész! ${allJobs.length} db valid állás mentve.`);
  return allJobs;
};