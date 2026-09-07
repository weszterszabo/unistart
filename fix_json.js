const fs = require('fs');
const path = require('path');

const JSON_PATH = path.join(process.cwd(), 'jobs.json');

try {
    const rawData = fs.readFileSync(JSON_PATH, 'utf8');
    const jobs = JSON.parse(rawData);
    let updatedCount = 0;

    jobs.forEach(job => {
        let posType = "graduate"; // Alapértelmezett

        // Összerakjuk a címet, címkéket és a jelleget, hogy kitaláljuk a kategóriát
        const checkStr = (
            (job.title || "") + " " + 
            (job.job_nature || "") + " " + 
            (job.tags ? job.tags.join(" ") : "")
        ).toLowerCase();

        // Diákmunka keresése
        if (/\b(diák|diákmunka|iskolaszövetkezet|student|working student|werkstudent)\b/i.test(checkStr)) {
            posType = "student";
        } 
        // Gyakornoki keresése
        else if (/\b(gyakornok|intern|internship|trainee)\b/i.test(checkStr)) {
            posType = "intern";
        }

        // Frissítjük az objektumot
        if (job.position_type !== posType) {
            job.position_type = posType;
            updatedCount++;
        }
        
        if (job.airtable_ready) {
            job.airtable_ready.position_type = posType;
        }
    });

    fs.writeFileSync(JSON_PATH, JSON.stringify(jobs, null, 2), 'utf8');
    console.log(`✅ SIKER! ${updatedCount} db meglévő állás kapta meg a visszamenőleges kategóriát.`);
} catch (error) {
    console.error("❌ Hiba történt:", error.message);
}