const cheerio = require("cheerio");

const HEADERS = {
  "Accept": "text/html,application/xhtml+xml",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"
};

exports.scrape = async function(companyName, baseUrl) {
  const allJobs = [];
  const seenUrls = new Set();
  
  let currentUrl = baseUrl;
  let hasNextPage = true;
  let pageCount = 1;

  while (hasNextPage && pageCount <= 10) { // Max 10 oldalt lapoz, nehogy végtelen ciklusba essen
    console.log(`   ⬇️ [Custom] Oldal ${pageCount} HTML letapogatása: ${currentUrl}`);
    try {
      const response = await fetch(currentUrl, { headers: HEADERS });
      const html = await response.text();
      const $ = cheerio.load(html);
      
      let jobsFoundOnPage = 0;

      // Schema.org intelligens kinyerés
      $('script[type="application/ld+json"]').each((i, el) => {
        try {
          const data = JSON.parse($(el).html());
          const items = Array.isArray(data) ? data : [data];
          items.forEach((item) => {
            if (item["@type"] === "JobPosting") {
              const url = item.url || currentUrl;
              if (!seenUrls.has(url)) {
                seenUrls.add(url);
                jobsFoundOnPage++;
                allJobs.push({
                  title: item.title || "Névtelen",
                  url: url,
                  apply_url: url,
                  location: item.jobLocation?.address?.addressLocality || "Magyarország",
                  date_posted: item.datePosted || new Date().toISOString(),
                  employment_type: item.employmentType || "",
                  experience_level: "",
                  subsidiary: item.hiringOrganization?.name || ""
                });
              }
            }
          });
        } catch (e) {}
      });

      // LAPOZÁS SZIMULÁLÁSA (Keresünk egy "Következő" vagy "Next" vagy ">" linket)
      let nextUrl = "";
      $('a').each((i, el) => {
        const text = $(el).text().toLowerCase().trim();
        const href = $(el).attr('href');
        const rel = $(el).attr('rel');
        
        // Ha úgy tűnik, mint egy lapozó gomb...
        if (href && (rel === 'next' || text === 'next' || text === 'következő' || text === 'tovább' || text === '>')) {
           nextUrl = href.startsWith('http') ? href : new URL(href, currentUrl).href;
        }
      });

      // Ha nincs több állás vagy nincs következő oldal gomb
      if (jobsFoundOnPage === 0 || !nextUrl || nextUrl === currentUrl) {
        hasNextPage = false;
        console.log(`   ⏹️ [Custom] Nincs több lapozó gomb vagy találat.`);
      } else {
        currentUrl = nextUrl;
        pageCount++;
        await new Promise(r => setTimeout(r, 500));
      }

    } catch (err) {
      console.error(`   ❌ [Custom] Hiba az oldal olvasásakor:`, err.message);
      hasNextPage = false;
    }
  }

  return allJobs;
};