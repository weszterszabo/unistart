// 4. ÁLLÁSOK LETÖLTÉSE (NYOMKÖVETŐ MÓD)
        for (let i = 0; i < jobUrls.length; i++) {
            const jobUrl = jobUrls[i];
            
            // NYOMKÖVETŐ 1: Pontos URL kiírása
            console.log(`\n▶️ [YDIAK] ${i + 1} / ${jobUrls.length} feldolgozása indul: ${jobUrl}`);
            
            console.log(`   ├─ 1. Letöltés...`);
            const html = await vipDownload(jobUrl);
            if (!html) { console.log(`   └─ ❌ Ugrás (Hálózati hiba)`); continue; }

            console.log(`   ├─ 2. Cheerio betöltés és tisztítás...`);
            const $ = cheerio.load(html);
            $('script, style, noscript, iframe, svg, meta, link').remove();

            let title = $('h1').first().text().replace(/\s+/g, ' ').trim() || $('title').text().split('-')[0].trim();
            if (!title || title.length < 3) continue;

            let rawDescription = $('main').text() || $('.container').text() || $('body').text();
            
            rawDescription = stripHtml(rawDescription);
            rawDescription = rawDescription.replace(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ.,:;?!%\-\s]/g, ' ');
            rawDescription = rawDescription.replace(/\s+/g, ' ').trim().substring(0, 1500);

            const urlCategory = new URL(jobUrl).pathname.split('/')[1] || "";
            const finalDesc = `Kategória: ${urlCategory}\n${rawDescription}`;

            let jobNature = "Pályakezdő", faculty = "Egyéb", finalTags = [], workStyle = "", location = "Magyarország"; 

            console.log(`   ├─ 3. NLP agy hívása (Cím: ${title})`);
            
            // 🧠 ITT FOG ELDŐLNI, HOGY AZ NLP FAGY-E LE!
            if (analyzer && typeof analyzer.analyzeJob === 'function') {
                const analysis = analyzer.analyzeJob(title, finalDesc);
                if (analysis !== null) {
                    jobNature = analysis.metadata?.job_nature || analysis.job_nature || "Pályakezdő";
                    faculty = analysis.metadata?.faculty || analysis.faculty || "Egyéb";
                    workStyle = analysis.metadata?.work_style || analysis.work_style || "";
                    finalTags = analysis.airtable_ready?.required_tags || analysis.tags || [];
                    if (!Array.isArray(finalTags) && analysis.tags?.required) finalTags = analysis.tags.required;
                }
            }

            console.log(`   └─ 4. Kész! NLP végzett, állás mentve.`);

            allJobs.push({
                title: title, url: jobUrl, apply_url: jobUrl, location: location, 
                date_posted: new Date().toISOString(), experience_level: jobNature,
                subsidiary: companyName, employment_type: "Diákmunka",
                faculty: faculty, work_style: workStyle,
                tags: Array.isArray(finalTags) ? finalTags : []
            });

            await new Promise(r => setTimeout(r, 100));
        }