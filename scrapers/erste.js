// 🧠 1. BEHÚZZUK A KÖZPONTI AGYAT
const analyzer = require("../analyzer");

// 🛡️ Stealth Headers: Valódi böngésző XHR kérésének álcázva
const HEADERS = {
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
  "Origin": "https://karrier.erstebank.hu",
  "Referer": "https://karrier.erstebank.hu/allasok"
};

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [ERSTE] Titkos JSBQ API letöltése indul...`);
  const allJobs = [];
  const seenUrls = new Set(); 
  
  let page = 1;
  let hasMore = true;
  const ROW_NUM = 100; // Csomagméret

  while (hasMore) {
    console.log(`   ⬇️ [ERSTE] Oldal ${page} lekérése...`);
    try {
      // Megfelelő payload formátum
      const extraParam = JSON.stringify({ page: page, rowNum: ROW_NUM.toString() }); 
      const bodyData = `q=ds&ajax=1&extra=${encodeURIComponent(extraParam)}`;
      
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: HEADERS,
        body: bodyData
      });

      if (!response.ok) {
        console.error(`   ❌ [ERSTE] Hiba a letöltés során (HTTP ${response.status})`);
        break;
      }
      
      const data = await response.json();
      const rows = data.rows || [];
      
      if (rows.length === 0) {
        console.log(`   ⏹️ [ERSTE] Nincs több állás a listában.`);
        hasMore = false;
        break;
      }

      let newJobsThisPage = 0;

      for (const item of rows) {
        // Gyakran a nested ecommerceData tartalmazza a strukturált metaadatokat
        const eco = item.ecommerceData || {};
        
        let jobUrl = item.url ? item.url : "";
        if (jobUrl && !jobUrl.startsWith("http")) jobUrl = `https://karrier.erstebank.hu${jobUrl.startsWith('/') ? '' : '/'}${jobUrl}`;
        
        if (!jobUrl || seenUrls.has(jobUrl)) continue; // Kapuőr a duplikációk ellen
        
        seenUrls.add(jobUrl);
        newJobsThisPage++; 
        
        const title = eco.item_name || item.title || item.name || "Névtelen pozíció";
        const department = eco.item_category || item.department || "";
        const experience = eco.item_category4 || item.experience || "";
        const type = eco.item_category3 || item.employmentType || "";

        // 🧠 2. MÉLY-ADATBÁNYÁSZAT (Deep Text Extraction)
        // Összeszedünk mindent a JSON-ből, ami leírás lehet (HTML snippetek is jöhetnek)
        const rawDescription = [
            department, 
            experience, 
            type,
            item.short_description,
            item.preview,
            item.excerpt,
            eco.item_category2
        ].filter(Boolean).join(" | ").replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();

        // 🧠 3. ELKÜLDJÜK AZ ADATOKAT AZ AGYNAK ELEMZÉSRE
        const analysis = analyzer.analyzeJob(title, rawDescription);

        // 🛡️ 4. JUNIOR KAPUŐR: CSAK AKKOR MENTJÜK, HA ÁTMENT A TESZTEN
        if (analysis !== null) {
            
            // 🔄 Dinamikus V17/V16 kompatibilis adatkinyerés
            const jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
            const faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
            const workStyle = analysis.metadata?.work_style || analysis.work_style || "";
            
            let tags = analysis.airtable_ready?.required_tags || analysis.tags || [];
            if (!Array.isArray(tags) && analysis.tags?.required) tags = analysis.tags.required; // V16 fallback

            // 📍 Helyszín formázása (Ha pl. 'Budapest' helyett 'BDPST' jönne, tisztítjuk)
            let location = eco.location_id || item.location || "Magyarország";
            location = location.replace(/_/, ' ').trim();

            allJobs.push({
              title: title.replace(/\s+/g, ' ').trim(),
              url: jobUrl,
              apply_url: jobUrl,
              location: location,
              // Ha van a JSON-ben publish_date, azt használjuk
              date_posted: item.publish_date || item.created || new Date().toISOString(), 
              
              experience_level: jobNature,
              subsidiary: department || "Erste Bank Hungary", 
              employment_type: type || "Teljes munkaidő",
              
              // 🌟 A SZUPERERŐK: 
              faculty: faculty,
              work_style: workStyle,
              tags: tags
            });
        }
      }

      // 🏎️ 5. OKOS EARLY-EXIT ÉS THROTTLING
      if (rows.length < ROW_NUM) {
        console.log(`   ⏹️ [ERSTE] Utolsó oldal (${rows.length} db), vége a lapozásnak!`);
        hasMore = false;
      } else if (newJobsThisPage === 0) {
        console.log(`   ⏹️ [ERSTE] Csak ismétlődő állások érkeztek, leállunk!`);
        hasMore = false;
      } else {
        page++;
        // Véletlenszerű Jitter: 500ms - 1000ms közötti várakozás (WAF védelem)
        await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
      }

    } catch (err) {
      console.error(`   ❌ [ERSTE] Végzetes Hálózat vagy JSON hiba a ${page}. oldalon:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [ERSTE] Siker: A szűrőn fennmaradt ${allJobs.length} db DIÁK/JUNIOR állás!`);
  return allJobs;
};