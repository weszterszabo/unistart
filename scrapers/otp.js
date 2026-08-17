const crypto = require("crypto");

exports.scrape = async function(companyName, baseUrl) {
  console.log(`   ⬇️ [OTP] Browser-like Scraper elindult...`);
  const allJobs = [];
  
  // A legfontosabb: a böngésző számára "hiteles" fejlécek
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://karrier.otpbank.hu/",
    "Connection": "keep-alive"
  };

  try {
    // Első hívás: megpróbáljuk betölteni a fő oldalt
    const response = await fetch("https://karrier.otpbank.hu/otp/go/OTP_Minden-allasajanlat/9753101/", { headers });
    const html = await response.text();
    
    // Debug célból: ha a HTML-ben látjuk a pozícióneveket, akkor a Regex a rossz.
    // Ha nem látjuk, akkor az OTP szerver nem adta ki a tartalmát.
    console.log(`   🔍 [OTP] HTML méret: ${html.length} karakter.`);

    // Az OTP/SAP SuccessFactors gyakran "jobResultItem" vagy hasonló osztályokat használ
    // Próbálunk egy általánosabb mintát, ami minden <tr>-t kiszed, ami állásra utal
    const rowRegex = /<tr[^>]*class="[^"]*jobResultItem[^"]*"[\s\S]*?<\/tr>/g;
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
      const rowHtml = match[0];
      
      const titleMatch = rowHtml.match(/<a[^>]+class="jobTitle-link"[^>]*>([\s\S]*?)<\/a>/);
      if (!titleMatch) continue;

      const title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
      const hrefMatch = titleMatch[0].match(/href="([^"]+)"/);
      let link = hrefMatch ? "https://karrier.otpbank.hu" + hrefMatch[1] : "";

      allJobs.push({
        title: title,
        url: link,
        apply_url: link,
        location: "Budapest (vagy lista)",
        date_posted: new Date().toISOString()
      });
    }

    console.log(`   ✔️  [OTP] Siker: ${allJobs.length} db állás feldolgozva.`);
    return allJobs;

  } catch (err) {
    console.error(`   ❌ [OTP] Végzetes hiba:`, err.message);
    return [];
  }
};