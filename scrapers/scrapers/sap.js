const cheerio = require("cheerio");

const HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

exports.scrape = async function(companyName, baseUrl) {
  const allJobs = [];
  const seenUrls = new Set();
  let startrow = 0;
  const maxPages = 10;
  let lastPageCount = 0;

  for (let page = 1; page <= maxPages; page++) {
    const currentUrl = page > 1 ? (baseUrl.includes('?') ? `${baseUrl}&startrow=${startrow}` : `${baseUrl}?startrow=${startrow}`) : baseUrl;
    console.log(`   ⬇️ [SAP] Oldal ${page} letöltése...`);
    
    try {
      const response = await fetch(currentUrl, { headers: HEADERS });
      const html = await response.text();
      const $ = cheerio.load(html);
      
      const pageLinks = [];
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim().replace(/\s+/g, ' ');
        if (href && (href.includes('/job/') || href.includes('/position/')) && text.length > 5) {
          pageLinks.push({ title: text, url: href.startsWith('http') ? href : new URL(href, currentUrl).href });
        }
      });

      const uniqueOnPage = pageLinks.filter((v, i, a) => a.findIndex(t => (t.url === v.url)) === i);
      let newJobsCount = 0;

      for (const job of uniqueOnPage) {
        if (!seenUrls.has(job.url)) {
          seenUrls.add(job.url);
          process.stdout.write(`   🔎 [SAP] Olvasás: ${job.title.substring(0, 30)}... `);
          const details = await getDeepDetails(job.url);
          console.log(details ? "Kész!" : "Hiba.");
          
          allJobs.push({
            title: job.title,
            url: job.url,
            apply_url: job.url,
            location: details && details.location ? details.location : "",
            date_posted: details && details.datePosted ? details.datePosted : new Date().toISOString(),
            employment_type: details && details.employment_type ? details.employment_type : "",
            experience_level: details && details.experience_level ? details.experience_level : "",
            subsidiary: details && details.subsidiary ? details.subsidiary : ""
          });
          newJobsCount++;
          await new Promise(r => setTimeout(r, 400));
        }
      }

      if (newJobsCount === 0 || (page > 1 && uniqueOnPage.length < lastPageCount)) break;
      lastPageCount = uniqueOnPage.length;
      startrow += 25;

    } catch (err) {
      console.error(`   ❌ [SAP] Hiba:`, err.message);
      break;
    }
  }
  return allJobs;
};

async function getDeepDetails(jobUrl) {
  try {
    const res = await fetch(jobUrl, { headers: HEADERS });
    const html = await res.text();
    const $ = cheerio.load(html);
    let details = { location: "", employment_type: "", experience_level: "", subsidiary: "", datePosted: "" };

    let locFound = $('.jobGeoLocation, .job-location, .location').first().text().trim();
    if (locFound && locFound.length < 80) details.location = locFound;

    $('span, p, div, li, b, strong').each((i, el) => {
      const txt = $(el).text().replace(/\s+/g, ' ').trim();
      const lower = txt.toLowerCase();

      if (lower.includes('foglalkoztatás típusa') || lower.includes('foglalkoztatás jellege')) {
        let val = $(el).next().text().trim() || txt.split(':')[1]?.trim() || txt.replace(/foglalkoztatás (típusa|jellege):?/i, '').trim();
        if(val.length < 50) details.employment_type = val;
      }
      if (lower.includes('tapasztalati szint')) {
        let val = $(el).next().text().trim() || txt.split(':')[1]?.trim() || txt.replace(/tapasztalati szint:?/i, '').trim();
        if(val.length < 50) details.experience_level = val;
      }
      if (!details.location && lower.includes('helyszín') && !lower.includes('keresés')) {
        let val = $(el).next().text().trim() || txt.split(':')[1]?.trim() || txt.replace(/helyszín:?/i, '').trim();
        if(val.length < 80) details.location = val;
      }
    });
    return details;
  } catch (e) {
    return null;
  }
}