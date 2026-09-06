const https = require('https');
// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🛡️ BIZTONSÁGOS KAPCSOLAT: Állami lejárt SSL ignorálása és TCP nyitvatartás (Keep-Alive)
const secureAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 10,
    rejectUnauthorized: false
});

// 🛡️ TÖKÉLETES BÖNGÉSZŐ ÁLCA (Chrome 126 ujjlenyomat)
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7',
    'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Connection': 'keep-alive'
};

// Dinamikus Süti Tároló
let globalWafCookies = "";

// Segédfüggvény: Natív HTTPS kérések Promise alapúvá tétele
function makeHttpsRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
        });

        req.on('error', e => reject(e));
        req.on('timeout', () => { 
            req.destroy(); 
            reject(new Error('Közszolgállás Szerver Timeout (20s)')); 
        });

        req.setTimeout(20000); // 20 másodperc türelmi idő

        if (postData) req.write(postData);
        req.end();
    });
}

// 🛡️ PÁNCÉLOZOTT ÉS ÖNGYÓGYÍTÓ KÉRÉS (Pre-Warm + Jitter + WAF Bypass)
async function fetchGovApiWithRetry(postData, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // 1. LÉPÉS: "Előmelegítés" (Pre-flight). Megnyitjuk a főoldalt a tűzfal megnyugtatására.
            if (!globalWafCookies) {
                const preFlightOptions = {
                    hostname: 'kozszolgallas.ksz.gov.hu',
                    path: '/',
                    method: 'GET',
                    agent: secureAgent,
                    headers: { ...BROWSER_HEADERS, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8', 'Upgrade-Insecure-Requests': '1' }
                };
                
                try {
                    const preRes = await makeHttpsRequest(preFlightOptions);
                    // Kinyerjük és összefűzzük a tűzfal (pl. F5 BIG-IP) sütijeit
                    if (preRes.headers['set-cookie']) {
                        globalWafCookies = preRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
                    }
                } catch (e) {
                    console.warn(`      ⚠️ [Közszolgállás] Pre-flight figyelmeztetés: ${e.message}`);
                }

                // 🔥 EMBERI KÉSLELTETÉS (Jitter): Várunk 0.8 - 1.5 másodpercet, mintha ember nézné az oldalt
                const humanDelay = Math.floor(Math.random() * 700) + 800;
                await new Promise(r => setTimeout(r, humanDelay));
            }

            // 2. LÉPÉS: Az igazi adatlekérő POST kérés, felvértezve a tűzfal sütijével
            const postOptions = {
                hostname: 'kozszolgallas.ksz.gov.hu',
                path: '/JobAd/GetJobAdCountFilteredByCities',
                method: 'POST',
                agent: secureAgent,
                headers: {
                    ...BROWSER_HEADERS,
                    'Content-Type': 'application/json; charset=UTF-8',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Origin': 'https://kozszolgallas.ksz.gov.hu',
                    'Referer': 'https://kozszolgallas.ksz.gov.hu/',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            // Hozzáadjuk a Sütit, ha van
            if (globalWafCookies) {
                postOptions.headers['Cookie'] = globalWafCookies;
            }

            const response = await makeHttpsRequest(postOptions, postData);

            // 🔥 WAF / TŰZFAL VÉDELEM: Ha JSON helyett HTML-t (Hibaoldalt) kapunk, lebuktunk!
            const contentType = response.headers['content-type'] || "";
            if (contentType.includes("text/html") || response.data.includes("<html")) {
                globalWafCookies = ""; // Sütik törlése, hogy a következő körben újat kérjen a tűzfaltól
                throw new Error("WAF / Tűzfal HTML blokkolás érzékelve a JSON végponton!");
            }

            if (response.status !== 200) {
                throw new Error(`Nem várt HTTP státuszkód: ${response.status}`);
            }

            return response.data;

        } catch (err) {
            if (attempt === maxRetries) throw err;
            console.log(`      ⚠️ [Közszolgállás] Hálózat/Tűzfal hiba, újrapróbálkozás (${attempt}/3) [${err.message}]...`);
            await new Promise(r => setTimeout(r, 2500 * attempt)); // Exponenciális csúsztatás (2.5s, 5.0s, stb.)
        }
    }
}

// ------------------------------------------------------------------
// 🚀 FŐ SCRAPER EXPORT
// ------------------------------------------------------------------
exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  console.log(`   ⬇️ [Közszolgállás] Phantom-Gov (Military Grade) letöltés indul...`);
  const allJobs = [];
  const seenUrls = new Set();

  try {
    const postData = JSON.stringify({});

    // A megbízható hálózati funkció hívása
    const jsonStr = await fetchGovApiWithRetry(postData);
    const json = JSON.parse(jsonStr);
    
    if (!json.Success || !json.Data || json.Data.length === 0) {
      console.log(`   ⏹️ [Közszolgállás] Nincs adat vagy üres válasz érkezett.`);
      return [];
    }

    json.Data.forEach(job => {
      if (!job.Speciality || !job.Id) return;

      const jobUrl = `https://kozszolgallas.ksz.gov.hu/JobAd/Info/${job.Id}`;
      
      // Duplikáció védelem
      if (seenUrls.has(jobUrl)) return;
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

      // 🧠 Számból szöveges NLP csapda
      let expLevel = "";
      if (job.Experience !== null && job.Experience !== undefined) {
          expLevel = job.Experience === 0 ? "0 év tapasztalat" : `${job.Experience} év tapasztalat`;
      }

      // 🕵️ MÉLY-KONTEXTUS AZ NLP-NEK
      const rawDescription = `${department} ${workType} ${expLevel} ${job.JobCategoryName || ""} ${job.EmploymentTypeName || ""}`;
      
      // Átküldjük az AI Motornak pontozásra
      const analysis = analyzer.analyzeJob(title, rawDescription, companyName);

      // 🛡️ JUNIOR KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT (health_score > 0)
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
    });

  } catch (err) {
    console.error(`   ❌ [Közszolgállás] Végzetes Hiba:`, err.message);
    throw err; // Továbbdobjuk a fő Orchestrátornak az auto-mentéshez
  }

  console.log(`   ✔️  [Közszolgállás] Siker: A szűrőn fennmaradt ${allJobs.length} db szellemi/junior állás!`);
  return allJobs;
};