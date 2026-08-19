// A meglévő motorok betöltése
const engines = {
    sap: require("./scrapers/sap"),
    smartrecruiters: require("./scrapers/smartrecruiters"),
    workday: require("./scrapers/workday"),
    erste: require("./scrapers/erste"),
    otp: require("./scrapers/otp"),
    khbank: require("./scrapers/khbank"),
    aldi: require("./scrapers/aldi"),
    lidl: require("./scrapers/lidl"),
    telekom: require("./scrapers/telekom"),
    fourig: require("./scrapers/fourig"),
    siemens: require("./scrapers/siemens"),
    mol: require("./scrapers/mol"),
    posta: require("./scrapers/posta"),
    mvm: require("./scrapers/mvm"),
    kozszolgallas: require("./scrapers/kozszolgallas"),
    custom: require("./scrapers/custom")
};

// Változók a teszteléshez
// ÍRD ÁT EZT A KÉT VÁLTOZÓT, HA MÁS CÉGET AKARSZ TESZTELNI!
const TEST_ENGINE = "siemens"; 
const TEST_COMPANY_NAME = "siemens"; 
const TEST_URL = ["careers.siemens.com", "jobs.siemens.com"];

async function runTest() {
    console.log(`\n🧪 LOKÁLIS TESZT INDUL...`);
    console.log(`🏢 Cég: ${TEST_COMPANY_NAME} | Motor: [${TEST_ENGINE.toUpperCase()}]`);
    console.log(`🔗 URL: ${TEST_URL}\n`);

    const engine = engines[TEST_ENGINE];

    if (!engine) {
        console.error(`❌ Hiba: A '${TEST_ENGINE}' motor nem létezik!`);
        return;
    }

    try {
        console.time("⏱️ Futási idő");
        
        // Futtatjuk a motort, de NEM mentjük adatbázisba!
        const jobs = await engine.scrape(TEST_COMPANY_NAME, TEST_URL);
        
        console.timeEnd("⏱️ Futási idő");
        console.log(`\n✅ EREDMÉNY: A motor ${jobs.length} db állást adott vissza.`);

        // Ha kaptunk állást, írjuk ki az első kettőt (hogy lássuk, jól működik-e)
        if (jobs.length > 0) {
            console.log(`\n🔍 Minta az első 2 állásból:`);
            const sample = jobs.slice(0, 2);
            console.log(JSON.stringify(sample, null, 2));
        }

    } catch (error) {
        console.error(`\n❌ Kritikus hiba a futás során:`, error);
    }
}

runTest();