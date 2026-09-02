const fs = require('fs');

// Beolvassuk a friss JSON fájlodat
const jobs = JSON.parse(fs.readFileSync('./jobs.json', 'utf8'));

console.log("=== 🔍 ALDI & LIDL (Gyanús fizikai munkák) ===");
const fizikaiGyanus = jobs.filter(j => 
    (j.company_name.includes("Aldi") || j.company_name.includes("Lidl"))
);
fizikaiGyanus.forEach(j => console.log(`- [${j.company_name}] ${j.title}`));

console.log("\n=== 🔍 KÖZSZOLGÁLLÁS (Gyanús állami munkák) ===");
const allamiGyanus = jobs.filter(j => j.company_name.includes("Közszolgállás"));
// Csak az első 30-at írjuk ki, hogy ne spamelje tele a terminált
allamiGyanus.slice(0, 30).forEach(j => console.log(`- ${j.title}`));