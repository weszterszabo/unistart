const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [Siemens] Állások letöltése indul (Nyers HTML elemző)...`);
  const allJobs = [];
  let offset = 0; // A Siemens offset-tel lapoz (0, 25, 50...)
  let hasMore = true;
  const seenUrls = new Set();

  while (hasMore) {
    console.log(`   ⬇️ [Siemens] Lapozás: ${offset}. állástól...`);
    
    // Rászűrünk a "Hungary" kulcsszóra, hogy a magyar állásokat adja be
    const targetUrl = `https://jobs.siemens.com/en_US/externaljobs/SearchJobs/?keyword=Hungary&listFilterMode=1&jobRecordsPerPage=25&offset=${offset}`;
    
    try {
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        }
      });
      
      if (!response.ok) {
        console.error(`   ❌ [Siemens] Hiba az oldal letöltésekor (HTTP ${response.status})`);
        break;
      }

      const html = await response.text();
      let newJobsCount = 0;

      // Keresgélünk az Avature HTML struktúrájában (a linkek általában a /JobDescription/ mappára mutatnak)
      const linkRegex = /<a[^>]+href="([^"]*\/JobDescription\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;

      while ((match = linkRegex.exec(html)) !== null) {
        let link = match[1];
        if (!link.startsWith("http")) link = "https://jobs.siemens.com" + link;
        
        // A cím a HTML tagok között van, letisztítjuk
        let title = match[2].replace(/<[^>]+>/g, "").trim();

        // Duplikáció szűrés és fals linkek kiszűrése
        if (title && !seenUrls.has(link) && !title.includes("<img")) {
            seenUrls.add(link);
            newJobsCount++;
            allJobs.push({
                title: title,
                url: link,
                apply_url: link,
                location: "Magyarország", // Nyers HTML-ből nehezebb a pontos várost kiszedni, alapból Magyarországot adunk
                date_posted: new Date().toISOString(),
                experience_level: "",
                subsidiary: "Siemens",
                employment_type: "Teljes munkaidő"
            });
        }
      }

      // Ha ezen az oldalon már nem volt egyetlen új, /JobDescription/ végződésű link sem, akkor elértük a listánk végét!
      if (newJobsCount === 0) {
        console.log(`   ⏹️ [Siemens] Nincs több állás ezen az oldalon, befejezzük a lapozást.`);
        hasMore = false;
      } else {
        offset += 25; // Ugrunk a következő 25 állásra
        await new Promise(r => setTimeout(r, 400));
      }

    } catch (err) {
      console.error(`   ❌ [Siemens] Hálózat hiba:`, err.message);
      hasMore = false;
    }
  }

  console.log(`   ✔️  [Siemens] Siker: ${allJobs.length} db állás feldolgozva.`);
  return allJobs;
};