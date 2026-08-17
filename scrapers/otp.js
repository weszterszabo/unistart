const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [OTP] Ultimate SAP Scraper elindult...`);
  const allJobs = [];
  let startrow = 0;
  let hasMore = true;
  const seenUrls = new Set();

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
    "Connection": "keep-alive"
  };

  while (hasMore) {
    const targetUrl = `https://karrier.otpbank.hu/search/?q=&sortColumn=referencedate&sortDirection=desc&startrow=${startrow}`;
    console.log(`   ⬇️ [OTP] Oldal letöltése: startrow=${startrow}`);
    
    try {
      const response = await fetch(targetUrl, { headers });
      const html = await response.text();
      
      let newJobsCount = 0;

      // 1. STRATÉGIA: Keresünk BÁRMILYEN blokkot (tr, li, div), amiben benne van a "jobTitle-link"
      const itemRegex = /<(tr|li|div)[^>]*>([\s\S]*?class="[^"]*jobTitle-link[^"]*"[\s\S]*?)<\/\1>/gi;
      let match;

      while ((match = itemRegex.exec(html)) !== null) {
        const rowHtml = match[2];

        // Cím és Link kinyerése
        const linkMatch = rowHtml.match(/<a[^>]+class="[^"]*jobTitle-link[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) || 
                          rowHtml.match(/<a[^>]+href="([^"]+)"[^>]+class="[^"]*jobTitle-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
        
        if (!linkMatch) continue;

        let link = linkMatch[1];
        if (!link.startsWith("http")) {
          link = "https://karrier.otpbank.hu" + link;
        }
        
        // HTML entitások és tagek eltávolítása a címből
        let title = linkMatch[2].replace(/<[^>]+>/g, "").trim();

        // Duplikáció szűrés (végtelen lapozás elleni védelem)
        if (seenUrls.has(link)) continue;
        seenUrls.add(link);

        // Helyszín (általában jobLocation vagy facility class)
        const locMatch = rowHtml.match(/class="[^"]*(jobLocation|jobFacility)[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
        let location = locMatch ? locMatch[2].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, ' ') : "Budapest";

        // Osztály/Terület (jobDepartment)
        const deptMatch = rowHtml.match(/class="[^"]*jobDepartment[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
        let department = deptMatch ? deptMatch[1].replace(/<[^>]+>/g, "").trim() : "";

        allJobs.push({
          title: title,
          url: link,
          apply_url: link,
          location: location,
          date_posted: new Date().toISOString(),
          experience_level: "", 
          subsidiary: department,
          employment_type: "Teljes munkaidő"
        });
        
        newJobsCount++;
      }

      // 2. STRATÉGIA (Védőháló): Ha az 1. stratégia nem talált semmit, kitépjük az összes /job/ linket a HTML-ből!
      if (newJobsCount === 0) {
        const fallbackLinkRegex = /<a[^>]+href="([^"]+\/job\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let fbMatch;
        while ((fbMatch = fallbackLinkRegex.exec(html)) !== null) {
            let link = fbMatch[1];
            if (!link.startsWith("http")) link = "https://karrier.otpbank.hu" + link;
            let title = fbMatch[2].replace(/<[^>]+>/g, "").trim();
            
            if (title && !seenUrls.has(link) && !title.includes("<img")) {
                seenUrls.add(link);
                newJobsCount++;
                allJobs.push({
                    title: title,
                    url: link,
                    apply_url: link,
                    location: "Budapest", // Alapértelmezett, ha a nyers linkből szedjük
                    date_posted: new Date().toISOString(),
                    experience_level: "", 
                    subsidiary: "",
                    employment_type: ""
                });
            }
        }
      }

      // Végtelen ciklus elleni védelem: Ha ezen az oldalon nem volt ÚJ állás, befejezzük a lapozást!
      if (newJobsCount === 0) {
        console.log(`   ⏹️ [OTP] Nincs több új állás, elértük a végét.`);
        hasMore = false;
      } else {
        startrow += 25; // Ugrás a következő oldalra
        await new Promise(r => setTimeout(r, 500)); // Várunk fél másodpercet a következő lapozás előtt
      }

    } catch (err) {
      console.error(`   ❌ [OTP] Hálózat hiba:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [OTP] Siker: ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};