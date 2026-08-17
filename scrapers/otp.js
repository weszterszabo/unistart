const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [OTP] SAP SuccessFactors API letöltése indul...`);
  const allJobs = [];

  // Az OTP álláskereső API végpontja
  const apiEndpoint = "https://karrier.otpbank.hu/services/cas/graphql";

  // Ezzel a GraphQL szerű payload-dal kérjük le a hirdetéseket
  const graphqlPayload = {
    query: `
      query SearchJobs($query: String, $offset: Int, $limit: Int) {
        jobSearch(query: $query, offset: $offset, limit: $limit) {
          elements {
            jobId
            title
            location
            datePosted
            customField1
            customField2
          }
        }
      }
    `,
    variables: {
      query: "",
      offset: 0,
      limit: 100 // Egyszerre 100 állást kérünk le, ez bőven lefedi az igényeinket
    }
  };

  try {
    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"
      },
      body: JSON.stringify(graphqlPayload)
    });

    if (!response.ok) {
        // Ha valamiért az új API tiltva van, megpróbáljuk a standard SAP /search API-t
        console.log(`   ⚠️ [OTP] A GraphQL nem válaszolt, átállás a standard SAP REST API-ra...`);
        return await fallbackScrape(companyName, "https://karrier.otpbank.hu/search/?q=&optionsFacetsDD_customfield1=&optionsFacetsDD_customfield2=&optionsFacetsDD_city=&optionsFacetsDD_title=");
    }

    const json = await response.json();
    const jobsList = json.data?.jobSearch?.elements || [];

    if (jobsList.length === 0) {
      console.log(`   ⏹️ [OTP] Nincs aktív állás a GraphQL válaszban.`);
      return await fallbackScrape(companyName, "https://karrier.otpbank.hu/search/?q=&optionsFacetsDD_customfield1=&optionsFacetsDD_customfield2=&optionsFacetsDD_city=&optionsFacetsDD_title=");
    }

    jobsList.forEach(job => {
      const jobId = job.jobId;
      const jobUrl = `https://karrier.otpbank.hu/job/Budapest-${encodeURIComponent(job.title.replace(/\s+/g, '-'))}/${jobId}/`;

      allJobs.push({
        title: job.title || "Névtelen pozíció",
        url: jobUrl,
        apply_url: jobUrl,
        location: job.location || "Magyarország",
        date_posted: job.datePosted || new Date().toISOString(),
        experience_level: job.customField1 || "", // Az OTP-nél ez a tapasztalati szint
        subsidiary: job.customField2 || "",       // Ez pedig a szakterület
        employment_type: "Teljes munkaidő"
      });
    });

    console.log(`   ✔️  [OTP] Siker: ${allJobs.length} db állás letöltve az API-n keresztül.`);
    return allJobs;

  } catch (error) {
    console.log(`   ⚠️ [OTP] API Hiba (${error.message}). Átállás HTML letapogatásra...`);
    return await fallbackScrape(companyName, "https://karrier.otpbank.hu/search/?q=&optionsFacetsDD_customfield1=&optionsFacetsDD_customfield2=&optionsFacetsDD_city=&optionsFacetsDD_title=");
  }
};

// ============================================================
// BIZTONSÁGI HÁLÓ (HTML SCRAPER) HA AZ API BEZÁRULNA
// ============================================================
async function fallbackScrape(companyName, fallbackUrl) {
  console.log(`   ⬇️ [OTP HTML] Letöltés indul: ${fallbackUrl}`);
  const allJobs = [];

  try {
    const response = await fetch(fallbackUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    const html = await response.text();

    const rowRegex = /<tr class="jobResultItem">([\s\S]*?)<\/tr>/g;
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
      const rowHtml = match[1];

      // Cím és Link
      const titleMatch = rowHtml.match(/<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/);
      if (!titleMatch) continue;

      let link = titleMatch[1];
      if (!link.startsWith("http")) {
        link = "https://karrier.otpbank.hu" + link;
      }
      const title = titleMatch[2].trim();

      // Helyszín
      const locMatch = rowHtml.match(/<span class="jobLocation">([\s\S]*?)<\/span>/);
      const location = locMatch ? locMatch[1].replace(/<[^>]+>/g, "").trim() : "Magyarország";

      // Dátum
      const dateMatch = rowHtml.match(/<span class="jobDate">([\s\S]*?)<\/span>/);
      const dateRaw = dateMatch ? dateMatch[1].replace(/<[^>]+>/g, "").trim() : "";

      allJobs.push({
        title: title,
        url: link,
        apply_url: link,
        location: location,
        date_posted: dateRaw || new Date().toISOString(),
        experience_level: "",
        subsidiary: "",
        employment_type: ""
      });
    }

    console.log(`   ✔️  [OTP HTML] Siker: ${allJobs.length} db állás letöltve.`);
    return allJobs;

  } catch (err) {
    console.error(`   ❌ [OTP HTML] Végzetes hiba a HTML olvasásakor:`, err.message);
    return [];
  }
}