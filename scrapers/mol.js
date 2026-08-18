const crypto = require("crypto");

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
        
        // Link összerakása a contestNo (vagy jobId) alapján
        let jobIdForUrl = job.contestNo || job.jobId || "";
        let jobUrl = jobIdForUrl ? `https://molgroup.taleo.net/careersection/mhu/jobdetail.ftl?job=${jobIdForUrl}&lang=hu` : "https://molgroup.taleo.net/";

        // A város a columns[1]-ben van, gyakran így: ["Hungary-Tiszaújváros"]
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
        // Ha valami más, megpróbáljuk kivágni a "Hungary-" utáni részt
        else {
             const match = rawLocation.match(/Hungary-([^"]+)/i);
             if (match && match[1]) location = match[1].split('-')[0].trim();
        }

        // A Taleo a cég nevét sokszor külön adja, de ha nincs, akkor alapból MOL
        const companyLabel = job.company || "MOL Group";
        
        // Címkék feldolgozása (részleg / kategória)
        let department = "";
        if (job.labels && Array.isArray(job.labels)) {
            department = job.labels.join(", ");
        }

        allJobs.push({
          title: title,
          url: jobUrl,
          apply_url: jobUrl,
          location: location,
          date_posted: new Date().toISOString(), // A Taleo magyar dátumformátuma (2026.08.18.) helyett biztosabb a mai napot menteni Firestore-nak
          experience_level: "", 
          subsidiary: companyLabel,
          employment_type: "Teljes munkaidő"
        });
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

  console.log(`   ✔️  [MOL Group] Siker: ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};