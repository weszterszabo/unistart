const cheerio = require("cheerio");
// 🧠 1. BEHÚZZUK A KÖZPONTI NLP AGYAT
const analyzer = require("../analyzer");

// 🚀 V12: Villámgyors HTML Entity Dekóder a nyers JSON adatokhoz
function decodeHtmlEntities(text) {
    if (!text) return "";
    const entities = {
        '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó', '&ouml;': 'ö', '&otilde;': 'ő', '&uacute;': 'ú', '&uuml;': 'ü', '&ucirc;': 'ű',
        '&Aacute;': 'Á', '&Eacute;': 'É', '&Iacute;': 'Í', '&Oacute;': 'Ó', '&Ouml;': 'Ö', '&Otilde;': 'Ő', '&Uacute;': 'Ú', '&Uuml;': 'Ü', '&Ucirc;': 'Ű',
        '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' '
    };
    return text.replace(/&[#\w]+;/g, match => entities[match] || match);
}

// 🔥 JAVÍTÁS: Hozzáadva a knownUrls = [] paraméter
exports.scrape = async function(companyName, baseUrl, knownUrls = []) {
  console.log(`   ⬇️ [${companyName}] Phantom-JSBQ letöltése indul...`);
  const allJobs = [];
  
  // 🌍 Dinamikus API URL építése a Firebase-ből kapott baseUrl alapján
  const apiUrl = `${baseUrl.replace(/\/$/, '')}/jsbq`;
  
  // 🛡️ Stealth Headers: Valódi XMLHttpRequest álcázása + Modern WAF Lopakodó Mód
  const HEADERS = {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": baseUrl,
    "Referer": `${baseUrl.replace(/\/$/, '')}/allasok`,
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty"
  };

  let page = 1;
  let hasMore = true;
  const maxRetries = 1; 
  const MAX_PAGES = 30; 
  
  const seenUrls = new Set(); 

  // 🔥 JAVÍTÁS: A while cikluson BELÜL van a try-catch, így oldalspecifikusan tudjuk kezelni a hibát
  while (hasMore) {
    if (page > MAX_PAGES) {
        console.log(`   ⚠️ [${companyName}] Biztonsági leállás: Elértük a maximális ${MAX_PAGES}. oldalt!`);
        break;
    }

    console.log(`   ⬇️ [${companyName}] Lapozás: ${page}. oldal lekérése...`);
    
    try {
      const requestBody = new URLSearchParams();
      requestBody.append("page", page.toString());
      requestBody.append("rowNum", "100"); 

      let response = null;
      let fetchSuccess = false;

      // 🛡️ AUTO-RETRY LOGIKA
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 10000);

              response = await fetch(apiUrl, {
                method: "POST",
                signal: controller.signal,
                headers: HEADERS,
                body: requestBody
              });
              clearTimeout(timeoutId);

              if (response.ok) {
                  fetchSuccess = true;
                  break; 
              } else {
                  console.warn(`   ⚠️ [${companyName}] Hiba a kérésnél (Status: ${response.status}). Újrapróbálkozás...`);
              }
          } catch (e) {
              if (attempt === maxRetries) break; 
              await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
          }
      }

      if (!fetchSuccess || !response) {
        // 🔥 JAVÍTÁS: throw Error, ha egyáltalán nem sikerül a fetch!
        throw new Error(`Végzetes HTTP Hiba a letöltés során az összes próbálkozás után.`);
      }

      // 🔥 WAF / CLOUDFLARE VÉDELEM: Megnézzük, hogy JSON-t kaptunk-e!
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
          throw new Error("WAF (Cloudflare/F5) HTML blokkolás érzékelve a JSON végponton!");
      }

      const json = await response.json();
      const rowsList = json.rows || [];

      if (rowsList.length === 0) {
        break; 
      }

      let newJobsOnThisPage = 0;

      for (const jobItem of rowsList) {
        const htmlRow = jobItem.row || "";
        if (!htmlRow) continue;

        const $ = cheerio.load(htmlRow);

        // 🚀 1. OMNI-TITLE CATCHER
        let titleElement = $('.job_list_title, .jobList__item__title, h2 a, h3 a, .job-title, .title, .job_position').first();
        let title = titleElement.text().replace(/\s+/g, ' ').trim();
        
        if (!title) title = titleElement.attr('title');
        if (!title) title = titleElement.attr('aria-label');
        
        if (!title || title.length < 3) {
            const firstA = $('a').first();
            title = firstA.text().replace(/\s+/g, ' ').trim() || firstA.attr('title');
        }

        if (!title && jobItem.title) title = decodeHtmlEntities(String(jobItem.title)).trim();
        if (!title && jobItem.name) title = decodeHtmlEntities(String(jobItem.name)).trim();

        title = title || "Névtelen pozíció";
        title = title.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
        
        let jobUrl = titleElement.attr('href') || $('a').first().attr('href') || titleElement.attr('data-url') || jobItem.url || "";
        
        if (jobUrl) {
            if (jobUrl.startsWith("//")) {
                jobUrl = "https:" + jobUrl;
            } else if (!jobUrl.startsWith("http") && !jobUrl.includes("javascript:")) {
                try {
                    jobUrl = new URL(jobUrl, baseUrl).href;
                } catch (e) {
                    jobUrl = baseUrl.replace(/\/$/, '') + (jobUrl.startsWith("/") ? "" : "/") + jobUrl;
                }
            }
        }

        if (!jobUrl || jobUrl === baseUrl || jobUrl === "#" || jobUrl.includes("javascript:") || seenUrls.has(jobUrl)) continue;
        
        seenUrls.add(jobUrl);
        newJobsOnThisPage++; 

        // 🚀 2. TÖBBRÉTEGŰ HELYSZÍN ÉS DÁTUM KERESŐ
        let location = $('.job_list_place, .location, .city, .place').contents().not('span').text().replace(/\s+/g, ' ').trim();
        if (!location) location = $('.job_list_place, .location, .city, .place').text().replace(/\s+/g, ' ').trim();
        
        if (!location && jobItem.city) location = decodeHtmlEntities(String(jobItem.city)).trim();
        if (!location && jobItem.location) location = decodeHtmlEntities(String(jobItem.location)).trim();
        
        location = location || "Magyarország";

        if (location !== "Magyarország") {
            location = location.replace(/\b\d{4}\b/g, '') 
                               .replace(/\bHU\b/gi, '')
                               .replace(/\bHungary\b/gi, '')
                               .replace(/\bMagyarország\b/gi, '');
            if (location.includes(',')) location = location.split(',')[0];
            location = location.trim().replace(/(^,)|(,$)/g, '').trim() || "Magyarország";
            
            if (/^bp\.?$/i.test(location) || /^bud$/i.test(location) || /^hq$/i.test(location)) {
                location = "Budapest";
            }
        }

        let deadline = $('.job_list_application_deadline, .deadline, .date').contents().not('span').text().replace(/\s+/g, ' ').trim();
        if (!deadline) deadline = $('.job_list_application_deadline, .deadline, .date').text().replace(/\s+/g, ' ').trim();
        if (!deadline && jobItem.date) deadline = String(jobItem.date).trim();
        
        if (deadline) {
            deadline = deadline.replace(/^(jelentkezési határidő|határidő|érvényes):?\s*/i, '').trim();
        }
        deadline = deadline || new Date().toISOString();
        
        if (deadline.includes(".")) {
            const parts = deadline.split(".").map(p => p.trim()).filter(Boolean);
            if (parts.length >= 3) deadline = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        } else if (deadline.includes("/")) {
            const parts = deadline.split("/").map(p => p.trim()).filter(Boolean);
            if (parts.length >= 3) deadline = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        }
        
        if (deadline.includes("1970") || deadline.includes("0000") || deadline.includes("1899") || deadline.includes("2099")) {
            deadline = new Date().toISOString();
        }

        // 🚀 V13 ÚJ: LEÁNYVÁLLALAT
        let specificCompany = $('.job_list_company, .company-name, .brand').text().replace(/\s+/g, ' ').trim();
        if (!specificCompany && jobItem.company) specificCompany = decodeHtmlEntities(String(jobItem.company)).trim();
        
        let finalSubsidiary = companyName;
        if (specificCompany && specificCompany.toLowerCase() !== companyName.toLowerCase()) {
            finalSubsidiary = `${companyName} (${specificCompany})`;
        }

        // 🚀 EXTRA 1: JSBQ Kategória
        let department = $('.job_list_category, .job_list_department, .category').text().replace(/\s+/g, ' ').trim();
        if (!department && jobItem.department) department = decodeHtmlEntities(String(jobItem.department)).trim();

        // 🚀 EXTRA 2: JSBQ Rejtett JSON
        let hiddenJsonData = "";
        
        if (jobItem.salary) hiddenJsonData += `Fizetés: ${decodeHtmlEntities(String(jobItem.salary))} | `;
        if (jobItem.employmentType || jobItem.employment_type) hiddenJsonData += `Foglalkoztatás: ${decodeHtmlEntities(String(jobItem.employmentType || jobItem.employment_type))} | `;
        if (jobItem.workingHours) hiddenJsonData += `Munkaidő: ${decodeHtmlEntities(String(jobItem.workingHours))} | `;
        
        let htmlEmpType = $('.job_list_employment_type, .employment-type, .job-type').text().replace(/\s+/g, ' ').trim();
        let htmlWorkingHours = $('.job_list_working_hours, .working-hours, .schedule').text().replace(/\s+/g, ' ').trim();
        
        if (htmlEmpType && !hiddenJsonData.includes(htmlEmpType)) hiddenJsonData += `Típus: ${htmlEmpType} | `;
        if (htmlWorkingHours && !hiddenJsonData.includes(htmlWorkingHours)) hiddenJsonData += `Munkaidő: ${htmlWorkingHours} | `;

        let finalEmploymentType = htmlEmpType || jobItem.employmentType || jobItem.employment_type || "Teljes munkaidő";
        if (finalEmploymentType.length > 30) finalEmploymentType = "Teljes munkaidő";
        finalEmploymentType = decodeHtmlEntities(String(finalEmploymentType));

        // 🧠 3. ZAJTALANÍTÁS
        $('td, th').append(' | ');
        $('br, p, div, li, h1, h2, h3, h4').append(' '); 
        $('script, style, svg, iframe, noscript').remove();
        
        let rawDescription = $.text().replace(/\s+/g, ' ').trim();
        rawDescription = rawDescription.replace(/[\u200B-\u200D\uFEFF]/g, '');

        let extraContext = "";
        if (department) extraContext += `Részleg/Kategória: ${department} | `;
        if (hiddenJsonData) extraContext += hiddenJsonData;

        if (extraContext !== "") {
            rawDescription = extraContext + rawDescription;
        }

        // ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
        const analysis = analyzer.analyzeJob(title, rawDescription);

        if (analysis !== null && title !== "Névtelen pozíció") {
            const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
            const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
            const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
            let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
            if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required;

            allJobs.push({
              title: title, 
              url: jobUrl, 
              apply_url: jobUrl, 
              location: location,
              date_posted: deadline,
              experience_level: jobNature, 
              subsidiary: finalSubsidiary, 
              employment_type: finalEmploymentType,
              faculty: faculty,
              work_style: workStyle,
              tags: tags
            });
        }
      }
      
      // 🏎️ OKOS EARLY-EXIT ÉS THROTTLING
      if (newJobsOnThisPage === 0) {
          console.log(`   ⏹️ [${companyName}] Nincs több ÚJ állás az oldalon, vége a lapozásnak.`);
          hasMore = false;
      } else if (rowsList.length < 100) {
          console.log(`   ⏹️ [${companyName}] Elértük a lista végét (${rowsList.length} állás).`);
          hasMore = false;
      } else {
          page++;
          await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
      }

    } catch (err) {
      console.error(`   ❌ [${companyName}] Hálózat hiba vagy időtúllépés a ${page}. oldalon:`, err.message);
      
      // 🔥 KRITIKUS JAVÍTÁS:
      // Ha a legelső oldalon hiba történik, azonnal továbbdobjuk, hogy az orchestrator mentsen!
      if (page === 1) {
          throw err;
      }
      
      // Ha 2. vagy későbbi oldalon történik hiba, megelégszünk a letöltöttekkel
      hasMore = false;
    }
  }

  console.log(`   ✔️  [${companyName}] Siker: A szűrőn fennmaradt ${allJobs.length} db PÁLYAKEZDŐ/JUNIOR/GYAKORNOK állás!`);
  return allJobs;
};