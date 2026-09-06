const { exec } = require("child_process");
const util = require("util");
const execAsync = util.promisify(exec);

// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ NATÍV OS-SZINTŰ LETÖLTÉS (cURL) - GitHub Actions Linux szerverekre optimalizálva
async function fetchGovApiWithCurl(postData, maxRetries = 3) {
    // Megvédjük az aposztrófokat a Linux bash környezetben
    const safePostData = postData.replace(/'/g, "'\\''");
    
    // GitHub Actions (Ubuntu) kompatibilis cURL hívás
    // Standard Windows ujjlenyomatot használunk, hogy a tűzfal ne fogjon gyanút az adatközpontból!
    const command = `curl -s -X POST "https://kozszolgallas.ksz.gov.hu/JobAd/GetJobAdCountFilteredByCities" \
        -H "Content-Type: application/json; charset=UTF-8" \
        -H "Accept: application/json, text/javascript, */*; q=0.01" \
        -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36" \
        -H "X-Requested-With: XMLHttpRequest" \
        -H "Origin: https://kozszolgallas.ksz.gov.hu" \
        -H "Referer: https://kozszolgallas.ksz.gov.hu/" \
        --data-raw '${safePostData}' \
        --compressed \
        --ipv4 \
        --insecure \
        --max-time 25`; // 25 mp türelmi idő a felhőből

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Futtatjuk a parancsot a GitHub Ubuntu szerverén
            const { stdout } = await execAsync(command, { maxBuffer: 1024 * 1024 * 10 });
            
            if (!stdout || stdout.trim() === "") {
                throw new Error("Üres válasz érkezett a curl-től a felhőben.");
            }
            
            // Ha a GitHub IP-t az állam tiltólistára tette, HTML hibaoldalt (403 Forbidden / WAF) kapunk
            if (stdout.includes("text/html") || stdout.includes("<html") || stdout.includes("Cloudflare") || stdout.includes("F5")) {
                throw new Error("WAF blokkolás! Az állami tűzfal letiltotta ezt a GitHub IP címet.");
            }

            return stdout;
        } catch (err) {
            if (attempt === maxRetries) throw err;
            console.log(`      ⚠️ [Közszolgállás] GitHub Hálózat hiba, újrapróbálkozás (${attempt}/3) [${err.message}]...`);
            await new Promise(r => setTimeout(r, 3000 * attempt)); 
        }
    }
}

// ------------------------------------------------------------------
// 🚀 FŐ SCRAPER EXPORT
// ------------------------------------------------------------------
exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  console.log(`   ⬇️ [Közszolgállás] Natív Cloud-cURL letöltés indul...`);
  const allJobs = [];
  const seenUrls = new Set();

  try {
    const postData = JSON.stringify({});

    // Az operációs rendszer szintű letöltés hívása
    const responseData = await fetchGovApiWithCurl(postData);
    const json = JSON.parse(responseData);
    
    if (!json.Success || !json.Data || json.Data.length === 0) {
      console.log(`   ⏹️ [Közszolgállás] Nincs adat vagy üres válasz érkezett.`);
      return [];
    }

    console.log(`      ✅ Sikeres JSON válasz a Cloudból! ${json.Data.length} db állás elemzése indul...`);

    for (const job of json.Data) {
      if (!job.Speciality || !job.Id) continue;

      const jobUrl = `https://kozszolgallas.ksz.gov.hu/JobAd/Info/${job.Id}`;
      
      if (seenUrls.has(jobUrl)) continue;
      seenUrls.add(jobUrl);

      const title = job.Speciality.trim();
      const department = job.CreatorOrganizationName ? job.CreatorOrganizationName.trim() : "Közigazgatás";
      const workType = job.WorkTypeName ? job.WorkTypeName.trim() : "Teljes munkaidő";
      
      let location = "Magyarország";
      if (job.CityName && job.CityGroup && job.CityName !== job.CityGroup) {
          location = `${job.CityName.trim()} (${job.CityGroup.trim()})`;
      } else if (job.CityName) {
          location = job.CityName.trim();
      }

      let expLevel = "";
      if (job.Experience !== null && job.Experience !== undefined) {
          expLevel = job.Experience === 0 ? "0 év tapasztalat" : `${job.Experience} év tapasztalat`;
      }

      const rawDescription = `${department} ${workType} ${expLevel} ${job.JobCategoryName || ""} ${job.EmploymentTypeName || ""}`;
      
      // Küldés az OMNI-MASTER Agyba
      const analysis = analyzer.analyzeJob(title, rawDescription, companyName);

      // SZELLEMI KAPUŐR (health_score > 0)
      if (analysis !== null && analysis.health_score > 0) {
          
          const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
          const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
          const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
          let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
          if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

          let postedDate = new Date().toISOString();
          if (job.PublishDate) postedDate = new Date(job.PublishDate).toISOString();

          allJobs.push({
            title: title, 
            url: jobUrl, 
            apply_url: jobUrl, 
            location: location,
            date_posted: postedDate,
            experience_level: jobNature, 
            subsidiary: department,
            employment_type: workType,
            faculty: faculty,
            work_style: workStyle,
            tags: tags
          });
      }
    }

  } catch (err) {
    console.error(`   ❌ [Közszolgállás] Végzetes Hiba a GitHubon:`, err.message);
    throw err; 
  }

  console.log(`   ✔️  [Közszolgállás] Siker: A szűrőn fennmaradt ${allJobs.length} db szellemi/junior állás!`);
  return allJobs;
};