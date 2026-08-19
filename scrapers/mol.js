const crypto = require("crypto");
// 🧠 1. BEHÚZZUK A KÖZPONTI AGYAT
const analyzer = require("../analyzer");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [MOL Group] Taleo API letöltése indul...`);
  const allJobs = [];
  
  let page = 1;
  let hasMore = true;

  // A Taleo (Oracle) rendszernek egy POST kérést kell küldeni az állásokért
  const apiUrl = "https://molgroup.taleo.net/careersection/rest/jobboard/searchjobs?lang=hu&portal=8205100397";

  while (hasMore) {
    console.log(`   ⬇️ [MOL] Lapozás: ${page}. oldal...`);
    
    // Taleo-nál a lapozás és a szűrők egy JSON body-ban mennek
    const requestBody = {
      "multilineEnabled": false,
      "sortingSelection": {
          "sortBySelectionParam": "3",
          "ascendingSortingOrder": "false"
      },
      "fieldData": {
          "fields": {
              "KEYWORD": "",
              "LOCATION": "2205100397" // Ez a "Magyarország" kódja a MOL Taleo rendszerében!
          },
          "valid": true
      },
      "filterSelectionParam": {
          "searchFilterSelections": [
              {
                  "id": "LOCATION",
                  "selectedValues": []
              }
          ]
      },
      "advancedSearchFiltersSelectionParam": {
          "searchFilterSelections": [
              {
                  "id": "ORGANIZATION",
                  "selectedValues": []
              },
              {
                  "id": "LOCATION",
                  "selectedValues": []
              },
              {
                  "id": "JOB_FIELD",
                  "selectedValues": []
              },
              {
                  "id": "JOB_SCHEDULE",
                  "selectedValues": []
              }
          ]
      },
      "pageNo": page
    };

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "tz": "GMT+02:00",
          "tzname": "Europe/Budapest"
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        console.error(`   ❌ [MOL] Hiba a letöltés során (HTTP ${response.status})`);
        break;
      }

      const json = await response.json();
      
      // A Taleo a 'requisitionList' kulcsban adja vissza a találatokat
      const jobsList = json.requisitionList || [];

      if (jobsList.length === 0) {
        hasMore = false;
        break;
      }

      jobsList.forEach(job => {
        // A Taleo egy 'column' nevű tömbbe teszi ömlesztve az adatokat (0: Cím, 1: Hely, 2: Dátum)
        const columns = job.column || [];
        let title = columns[0] || "Névtelen pozíció";
        
        let jobIdForUrl = job.contestNo || job.jobId || "";
        let jobUrl = jobIdForUrl ? `https://molgroup.taleo.net/careersection/mhu/jobdetail.ftl?job=${jobIdForUrl}&lang=hu` : "https://molgroup.taleo.net/";

        let rawLocation = columns[1] || "";
        let location = "Magyarország";
        
        if (rawLocation.includes("Budapest") || rawLocation.includes("Dombóvári")) location = "Budapest";
        else if (rawLocation.includes("Tiszaújváros")) location = "Tiszaújváros";
        else if (rawLocation.includes("Százhalombatta")) location = "Százhalombatta";
        else if (rawLocation.includes("Algyő")) location = "Algyő";
        else if (rawLocation.includes("Siófok")) location = "Siófok";
        else if (rawLocation.includes("Almásfüzitő")) location = "Almásfüzitő";
        else if (rawLocation.includes("Eger")) location = "Eger";
        else if (rawLocation.includes("Győr")) location = "Győr";
        else if (rawLocation.includes("Szeged")) location = "Szeged";
        else if (rawLocation.includes("Nagykanizsa")) location = "Nagykanizsa";
        else {
             const match = rawLocation.match(/Hungary-([^"]+)/i);
             if (match && match[1]) location = match[1].split('-')[0].trim();
        }

        const companyLabel = job.company || "MOL Group";
        
        let department = "";
        if (job.labels && Array.isArray(job.labels)) {
            department = job.labels.join(", ");
        }

        // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
        // A részleget is hozzáfűzzük, hátha segít a kategorizálásban
        const rawDescription = `${companyLabel} ${department}`;
        const analysis = analyzer.analyzeJob(title, rawDescription);

        // 🧠 3. KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT
        if (analysis !== null) {
            allJobs.push({
              title: title,
              url: jobUrl,
              apply_url: jobUrl,
              location: location,
              date_posted: new Date().toISOString(), 
              
              // ÚJ CÍMKÉZÉS AZ AGY ALAPJÁN!
              experience_level: analysis.job_nature, 
              subsidiary: companyLabel !== "MOL Group" ? companyLabel : (department || "MOL Group"),
              employment_type: "Teljes munkaidő",
              
              // 🌟 A SZUPERERŐK:
              faculty: analysis.faculty,
              work_style: analysis.work_style,
              tags: analysis.tags
            });
        }
      });

      // Lapozás ellenőrzése
      const pagingData = json.pagingData || {};
      const totalCount = pagingData.totalCount || 0;
      const currentPage = pagingData.currentPageNo || page;
      const pageSize = pagingData.pageSize || 25;
      
      // Ha elértük a maximális állásszámot, leállunk
      if (currentPage * pageSize >= totalCount) {
          hasMore = false;
      } else {
          page++;
          await new Promise(r => setTimeout(r, 400));
      }

    } catch (err) {
      console.error(`   ❌ [MOL] Hálózat hiba:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [MOL Group] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};