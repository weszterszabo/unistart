const fs = require('fs');

try {
    // Beolvassuk az adatbázist
    const jobs = JSON.parse(fs.readFileSync('./jobs.json', 'utf8'));
    
    // Kiszűrjük azokat, amik passzívak (is_active === false)
    const passiveJobs = jobs.filter(j => j.is_active === false);

    console.log(`\n=== 🔴 PASSZÍV / KISZŰRT ÁLLÁSOK RÖNTGEN (${passiveJobs.length} db) ===\n`);

    if (passiveJobs.length === 0) {
        console.log("Jelenleg egyetlen passzív állás sincs az adatbázisban.");
    } else {
        // Csoportosítás cégenként a jobb átláthatóságért
        const byCompany = {};
        passiveJobs.forEach(j => {
            const comp = j.company_name || "Ismeretlen cég";
            if (!byCompany[comp]) byCompany[comp] = [];
            byCompany[comp].push(j);
        });

        // Kiíratás
        for (const [company, cJobs] of Object.entries(byCompany)) {
            console.log(`🏢 ${company} (${cJobs.length} db):`);
            
            // Ha nagyon sok van egy cégnél, csak az első 20-at írjuk ki, hogy ne robbanjon fel a terminál
            cJobs.slice(0, 20).forEach(j => {
                console.log(`   - ${j.title}`);
            });
            
            if (cJobs.length > 20) {
                console.log(`   ... és még ${cJobs.length - 20} további állás.`);
            }
            console.log('');
        }
    }
} catch (error) {
    console.error("❌ Hiba történt a fájl olvasásakor:", error.message);
}