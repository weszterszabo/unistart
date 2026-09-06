const kozszolgallas = require('./scrapers/kozszolgallas');

async function runTest() {
    console.log("=======================================");
    console.log("🚀 KÖZSZOLGÁLLÁS IZOLÁLT TESZT INDUL...");
    console.log("=======================================\n");

    try {
        // Meghívjuk a scraper.js-t kikerülve, közvetlenül a motort!
        // Paraméterek: cégnév, url, korábbi url-ek (most üres tömb)
        const jobs = await kozszolgallas.scrape("Közszolgállás (Állami Szféra)", "https://kozszolgallas.ksz.gov.hu", []);
        
        console.log(`\n✅ TESZT SIKERES! Összesen ${jobs.length} db állás átment az MI szűrőjén.`);
        
        if (jobs.length > 0) {
            console.log("\nÍme az első 2 állás mintaként:");
            console.log(JSON.stringify(jobs.slice(0, 2), null, 2));
        }

    } catch (error) {
        console.error("\n❌ TESZT ELBUKOTT! Pontos hibaüzenet:");
        console.error(error.message);
        console.error(error.stack); // Ebből látjuk, ha megint a tűzfal dob el
    }
}

runTest();