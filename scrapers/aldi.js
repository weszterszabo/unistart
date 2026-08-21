const crypto = require("crypto");
// 🧠 1. BEHÚZZUK A KÖZPONTI AGYAT
const analyzer = require("../analyzer");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [ALDI] REST API letöltése indul...`);
  const allJobs = [];
  let page = 1; 
  let hasMore = true;
  const seenUrls = new Set(); 
  const PAGE_SIZE = 100; // Konstans a méretnek a logikához

  while (hasMore) {
    console.log(`   ⬇️ [ALDI] Lapozás: ${page}. oldal...`);
    const apiUrl = `https://karrier.aldi.hu/rest/jobs/search?page=${page}&size=${PAGE_SIZE}`;

    try {
      // 🛡️ Stealth Headers: Valódi böngészőt szimulálunk
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://karrier.aldi.hu/allasajanlatok"
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

      for (const job of jobsList) {
        const title = job.title || "Névtelen pozíció";
        
        let jobUrl = job.url || (job.job_id ? `job/${job.job_id}` : "");
        if (jobUrl && !jobUrl.startsWith("http")) jobUrl = "https://karrier.aldi.hu/" + jobUrl.replace(/^\//, '');

        if (!jobUrl || seenUrls.has(jobUrl)) continue; // Ha nincs URL, vagy már láttuk, átugorjuk
        
        seenUrls.add(jobUrl);
        newJobsCount++;

        // 🧠 2. MÉLY ADATFÚRÁS (Deep Text Extraction)
        // Kinyerjük a JSON-ból az összes olyan mezőt, amiben értékes szöveg lehet!
        const textParts = [
            job.career_level_title,
            job.area_of_activity_title,
            job.description,
            job.tasks,
            job.profile,
            job.offer,
            job.benefits
        ].filter(Boolean).join(" | "); // A filter(Boolean) kiszűri a null/undefined értékeket

        // 📍 3. INTELLIGENS HELYSZÍN KINYERÉS
        let location = job.city || job.region || "Magyarország";
        if (job.zip_code && job.city && !job.city.includes(job.zip_code)) {
            location = `${job.zip_code} ${job.city}`;
        }

        // 🧠 4. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
        const analysis = analyzer.analyzeJob(title, textParts);

        // 🛡️ 5. KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT A JUNIOR TESZTEN
        if (analysis !== null) {
            
            // 🔄 Dinamikus adat-kikérés (Támogatja a V17 struktúrát és a régit is)
            const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
            const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
            const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
            
            let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
            if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required; // Fallback

            allJobs.push({
              title: title.replace(/\s+/g, ' ').trim(), // Tisztítjuk a dupla szóközöket
              url: jobUrl,
              apply_url: jobUrl,
              location: location.replace(/\s+/g, ' ').trim(),
              // Megpróbáljuk kinyerni az eredeti publikálási dátumot, ha nincs, marad a mostani
              date_posted: job.publish_date || job.created_at || new Date().toISOString(),
              
              experience_level: jobNature,
              subsidiary: job.area_of_activity_title || "ALDI Magyarország",
              employment_type: job.shift || job.working_hours || "Teljes munkaidő",
              
              // 🌟 A SZUPERERŐK:
              faculty: faculty,
              work_style: workStyle,
              tags: tags
            });
        }
      }

      // 🏎️ 6. OKOS EARLY-EXIT ÉS THROTTLING
      if (jobsList.length < PAGE_SIZE) {
        console.log(`   ⏹️ [ALDI] Utolsó oldal (${jobsList.length} db), vége a lapozásnak!`);
        hasMore = false;
      } else if (newJobsCount === 0) {
        console.log(`   ⏹️ [ALDI] Csak ismétlődő állások jöttek az oldalon, leállunk!`);
        hasMore = false;
      } else {
        page++;
        // Kicsit nagylelkűbb szünet, hogy ne tiltsa le a szerver az IP-t (Rate Limit védelem)
        await new Promise(r => setTimeout(r, 600)); 
      }

    } catch (err) {
      console.error(`   ❌ [ALDI] Végzetes Hálózat/JSON hiba a ${page}. oldalon:`, err.message);
      hasMore = false; // Megtörjük a végtelen ciklust hiba esetén!
    }
  }

  console.log(`   ✔️  [ALDI] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};