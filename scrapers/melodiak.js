const analyzer = require("../analyzer");

const HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Origin": "https://www.melodiak.hu",
  "Referer": "https://www.melodiak.hu/"
};

const stripHtml = (html) => {
    if (!html) return "";
    return html.toString().replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
};

exports.scrape = async function(companyName = "Meló-Diák", baseUrl = "https://www.melodiak.hu", knownUrls = []) {
  const allJobs = [];
  const seenUrls = new Set();
  const API_ENDPOINT = "https://web-api.melodiak.hu/v1/job-advertisement"; 
  
  let pageCount = 1;
  let hasNextPage = true;
  const MAX_PAGES = 20;

  console.log(`   🚀 [MELO-DIAK API SCRAPER] Indulás: ${companyName}`);

  while (hasNextPage && pageCount <= MAX_PAGES) {
    const currentUrl = `${API_ENDPOINT}?page=${pageCount}`;
    console.log(`   ⬇️ [MELO-DIAK] ${pageCount}. API oldal lekérése...`);
    
    try {
      const response = await fetch(currentUrl, { headers: HEADERS });
      if (!response.ok) throw new Error(`API HTTP Hiba: ${response.status}`);

      const jsonData = await response.json();
      
      // 🛡️ GOLYÓÁLLÓ TÖMB KIVÁLASZTÓ (Ez oldja meg a hibát)
      let jobsArray = [];
      if (Array.isArray(jsonData)) jobsArray = jsonData;
      else if (Array.isArray(jsonData.data)) jobsArray = jsonData.data;
      else if (jsonData.data && Array.isArray(jsonData.data.data)) jobsArray = jsonData.data.data;
      else if (Array.isArray(jsonData.items)) jobsArray = jsonData.items;

      if (!jobsArray || jobsArray.length === 0) {
        hasNextPage = false;
        break;
      }

      let jobsFoundOnPage = 0;

      for (const item of jobsArray) {
        const slug = item.slug || item.id;
        if (!slug) continue;

        const jobUrl = `${baseUrl}/diakmunka/${slug}`; 
        
        if (!seenUrls.has(jobUrl) && !knownUrls.includes(jobUrl)) {
            seenUrls.add(jobUrl);

            const title = item.title || item.name || item.position || "Névtelen pozíció";
            const location = item.city || item.locationName || item.region?.name || "Magyarország";
            const salary = item.wage || item.salary || item.hourlyWage || "";
            const shortDesc = stripHtml(item.shortDescription || item.description || "");
            
            let tags = [];
            if (item.jobCategories && Array.isArray(item.jobCategories)) {
                tags = item.jobCategories.map(c => c.name);
            }

            const rawDescription = `Fizetés: ${salary}\nLokáció: ${location}\nCímkék: ${tags.join(', ')}\nRészletek: ${shortDesc}`.replace(/\s+/g, ' ').trim();

            let finalTags = tags;
            let jobNature = "Pályakezdő";
            let faculty = "Egyéb";
            let workStyle = "";

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
                date_posted: item.createdAt || item.publishedAt || new Date().toISOString(),
                experience_level: jobNature,
                subsidiary: companyName,
                employment_type: "Diákmunka",
                faculty: faculty,
                work_style: workStyle,
                tags: Array.isArray(finalTags) ? finalTags : []
            });
        }
      }

      const lastPage = jsonData.meta?.last_page || jsonData.last_page || jsonData.totalPages;
      if (lastPage && pageCount >= lastPage) hasNextPage = false;
      else if (jobsFoundOnPage === 0 && pageCount > 3) hasNextPage = false;
      else {
        pageCount++;
        await new Promise(r => setTimeout(r, 600));
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