// Behúzzuk a 4 diákszövetkezeti letöltő modult
const quantum = require('./quantum');
const ydiak = require('./ydiak');
const melodiak = require('./melodiak');
const humancentrum = require('./humancentrum'); // Vagy 'minddiak', ahogy elnevezted

async function runTest() {
    console.log("🛠️ [UNISTART] Teszt Scraper Indítása...\n");

    try {
        // 🟢 CSERÉLD KI A KOMMENTEZÉST (//) AHHOZ KÉPEST, HOGY MELYIKET AKAROD TESZTELNI!
        // Csak az az egy legyen "kikommentezve", amelyiket épp próbálod.

        // --- 1. QUANTUM TESZT ---
        // const jobs = await quantum.scrape("Quantum Diákszövetkezet", "https://cloud.qdiak.hu/munkak", []);

        // --- 2. Y DIÁK TESZT ---
        // const jobs = await ydiak.scrape("Y Diákszövetkezet", "https://ydiak.hu/aktualis-diakmunkaink", []);

        // --- 3. MELÓ-DIÁK TESZT ---
        const jobs = await melodiak.scrape("Meló-Diák", "https://www.melodiak.hu", []);

        // --- 4. HUMAN CENTRUM TESZT ---
        // const jobs = await humancentrum.scrape("Human Centrum", "https://www.humancentrum.hu", []);

        console.log(`\n✅ Teszt befejezve! Összesen ${jobs.length} db érvényes állást talált a rendszer.`);

        if (jobs.length > 0) {
            console.log("\n👀 Íme az első 3 megtalált állás előnézete (ahogy a Firebase-be menne):");
            // Csak az első 3-at írjuk ki szépen formázva, hogy ne árassza el a konzolt
            console.log(JSON.stringify(jobs.slice(0, 3), null, 2));
        } else {
            console.log("\n⚠️ Nem találtunk egyetlen állást sem. (Vagy üres az oldal, vagy az NLP agy kiszűrt mindent).");
        }

    } catch (error) {
        console.error("\n❌ KRITIKUS HIBA a teszt során:");
        console.error(error);
    }
}

// Futás indítása
runTest();