const fs = require('fs');

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'patXISxgZknEmCH9M.1ebf18a4abe4b0f8959925489ca16529764e8e9b38e8f94a71ed7c46bb35d9c0';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'app5MwPvsXXsoNrh0';
const AIRTABLE_TABLE_NAME = 'Jobs';

async function fetchAirtableData() {
    let records = [];
    let offset = '';
    
    console.log("Adatok letöltése az Airtable-ből...");

    try {
        do {
            const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}?${offset ? `offset=${offset}` : ''}`;
            
            const res = await fetch(url, { 
                headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } 
            });
            
            if (!res.ok) throw new Error(`Airtable hiba: ${res.status}`);
            
            const data = await res.json();
            records = records.concat(data.records);
            offset = data.offset;
            
        } while (offset);

        // OPTIMALIZÁLÁS: Csak a szükséges mezőket tartjuk meg!
        const cleanedRecords = records.map(r => ({
            fields: {
                "Álláshirdetések": r.fields["Álláshirdetések"] || r.fields["title"] || '',
                "Cég": r.fields["Cég"] || '',
                "Lokáció": r.fields["Lokáció"] || r.fields["location"] || '',
                "Egyetem – Kar": r.fields["Egyetem – Kar"] || r.fields["Egyetem-Kar"] || r.fields["faculty"] || '',
                "logo": Array.isArray(r.fields["logo"]) ? r.fields["logo"][0]?.url : r.fields["logo"] || '',
                "link": r.fields["link"] || r.fields["Teszt"] || '#',
                "prior": r.fields["prior"] || 0
            }
        }));

        fs.writeFileSync('jobs.json', JSON.stringify(cleanedRecords));
        console.log(`✅ Sikeresen optimalizálva és mentve ${cleanedRecords.length} állás a jobs.json fájlba!`);
        
    } catch (error) {
        console.error("❌ Hiba az Airtable letöltés során:", error);
    }
}

fetchAirtableData();