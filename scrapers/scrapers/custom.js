const cheerio = require("cheerio");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Custom/Fallback] Univerzális HTML beolvasás...`);
  try {
    const response = await fetch(baseUrl);
    const html = await response.text();
    const $ = cheerio.load(html);
    const allJobs = [];

    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const data = JSON.parse($(el).html());
        const items = Array.isArray(data) ? data : [data];
        items.forEach((item) => {
          if (item["@type"] === "JobPosting") {
            allJobs.push({
              title: item.title || "Névtelen",
              url: item.url || baseUrl,
              apply_url: item.url || baseUrl,
              location: item.jobLocation?.address?.addressLocality || "Magyarország",
              date_posted: item.datePosted || new Date().toISOString(),
              employment_type: item.employmentType || "",
              experience_level: "",
              subsidiary: ""
            });
          }
        });
      } catch (e) {}
    });

    return allJobs.filter((v, i, a) => a.findIndex(t => (t.url === v.url)) === i);
  } catch (err) {
    console.error(`   ❌ [Custom] Hiba:`, err.message);
    return [];
  }
};