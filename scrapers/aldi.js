const crypto = require("crypto");
// 🧠 1. BEHÚZZUK A KÖZPONTI AGYAT
const analyzer = require("../analyzer");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [ALDI] REST API letöltése indul...`);
  const allJobs = [];
  let page = 1; // Az Aldi API általában 1-től indul
  let hasMore = true;
  const seenUrls = new Set(); // Végtelen ciklus védelem!

  while (hasMore) {
    console.log(`   ⬇️ [ALDI] Lapozás: ${page}. oldal...`);
    // A TE TÖKÉLETES URL-ed:
    const apiUrl = `https://karrier.aldi.hu/rest/jobs/search?page=${page}&size=100`;

    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
      });

      if (!response.ok) {
        console.error(`   ❌ [ALDI] Hiba a letöltés során (HTTP ${response.status})`);
        break;
      }

      const json = await response.json();
      const jobsList = json.jobs || [];

      if (jobsList.length === 0) {
        hasMore = false;
        break;
      }

      let newJobsCount = 0;

      jobsList.forEach(job => {
        const title = job.title || "Névtelen pozíció";
        
        let jobUrl = job.url || "";
        if (!jobUrl && job.job_id) jobUrl = `job/${job.job_id}`;
        if (jobUrl && !jobUrl.startsWith("http")) jobUrl = "https://karrier.aldi.hu/" + jobUrl;

        // Csak az ÚJ (nem ismétlődő) állások URL-jét vizsgáljuk
        if (!seenUrls.has(jobUrl)) {
            seenUrls.add(jobUrl);
            newJobsCount++; // Növeljük a számlálót a lapozáshoz (akkor is ha később eldobjuk)

            const department = job.area_of_activity_title || "";
            const careerLevel = job.career_level_title || "";
            
            // 🧠 2. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
            // Összefűzzük az összes elérhető szöveget, hogy okosabban döntsön
            const rawDescription = `${careerLevel} ${department} ${job.description || ""}`;
            const analysis = analyzer.analyzeJob(title, rawDescription);

            // 🧠 3. KAPUŐR: CSAK AKKOR MENTJÜK, HA NEM NULL (Azaz ha átment a teszten)
            if (analysis !== null) {
                let location = job.city || "Magyarország";

                allJobs.push({
                  title: title,
                  url: jobUrl,
                  apply_url: jobUrl,
                  location: location,
                  date_posted: new Date().toISOString(),
                  
                  // ÚJ CÍMKÉZÉS AZ AGY ALAPJÁN!
                  experience_level: analysis.job_nature, // A régi 'careerLevel' helyett
                  subsidiary: department,
                  employment_type: job.shift || "Teljes munkaidő",
                  
                  // 🌟 A SZUPERERŐK: 
                  faculty: analysis.faculty,         // pl: 💼 Gazdasági & Üzleti
                  work_style: analysis.work_style,   // pl: 📊 Elemző / Adatvezérelt
                  tags: analysis.tags                // pl: ["#Angol", "#Excel"]
                });
            }
        }
      });

      // Ha nem találtunk ÚJ URL-t az oldalon (függetlenül attól, hogy senior vagy junior), leállunk
      if (newJobsCount === 0) {
        console.log(`   ⏹️ [ALDI] Csak ismétlődő állások jöttek, vége a lapozásnak!`);
        hasMore = false;
      } else {
        page++;
        await new Promise(r => setTimeout(r, 400));
      }

    } catch (err) {
      console.error(`   ❌ [ALDI] Hálózat hiba:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [ALDI] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};