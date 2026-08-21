const fs = require('fs');
const file = 'src/routes/dashboard/cve/+page.svelte';
let content = fs.readFileSync(file, 'utf8');

const imports = `import { callKKUAI, getKKUAIKey, getKKUAIModel } from '../../../lib/utils/kkuai';
  import AiKeyModal from '../../../lib/components/AiKeyModal.svelte';`;
  
content = content.replace("let searchQuery = '';", imports + "\n  let searchQuery = '';\n  let showAiKeyModal = false;");

const oldFunc = /async function searchVulnerability\(query: string\) \{[\s\S]*?\n  \}/;
const newFunc = `async function searchVulnerability(query: string) {
    if (!query) return;
    const apiKey = getKKUAIKey();
    if (!apiKey) {
      showAiKeyModal = true;
      return;
    }
    
    searchQuery = query;
    loading = true;
    analyzing = true;
    errorMsg = '';
    cveData = null;
    aiBriefing = null;

    let id = query.trim().toUpperCase();
    if (/^\\d{4}-\\d{4,}$/.test(id)) id = 'CVE-' + id;

    if (id.startsWith('CVE-')) {
      try {
        const res = await fetch(\`https://cveawg.mitre.org/api/cve/\${id}\`);
        if (!res.ok) throw new Error('Not found in database.');
        const data = await res.json();
        
        const desc = data.containers?.cna?.descriptions?.[0]?.value || 'No description provided.';
        const affected = data.containers?.cna?.affected?.map((a:any) => \`\${a.vendor || 'Unknown'} \${a.product || 'Unknown'}\`) || ["Unknown"];
        
        aiBriefing = {
          cveId: data.cveMetadata?.cveId || id,
          state: data.cveMetadata?.state || 'PUBLISHED',
          published: data.cveMetadata?.datePublished?.substring(0,10) || 'Unknown',
          assigner: data.cveMetadata?.assignerShortName || 'Unknown',
          cvss: 0, 
          severity: "UNKNOWN",
          attackVector: "Unknown",
          complexity: "Unknown",
          privileges: "Unknown",
          userInteraction: "Unknown",
          aiSummary: "กำลังสร้างบทวิเคราะห์จาก KKU AI...",
          mitigation: ["กำลังสร้างวิธีการแก้ไข..."],
          affected: affected,
          affectedInternal: false
        };
        
        // Call KKU AI for summary and mitigation
        const prompt = \`Summarize this vulnerability (CVE) and provide exactly 3 bullet points for mitigation steps (in Thai).
CVE: \${id}
Description: \${desc}
Affected: \${affected.join(', ')}\`;

        callKKUAI(apiKey, getKKUAIModel(), [
          { role: 'system', content: 'You are an expert security researcher. Return output as:\\nSUMMARY:\\n[summary text]\\n\\nMITIGATION:\\n- [step 1]\\n- [step 2]\\n- [step 3]' },
          { role: 'user', content: prompt }
        ]).then(res => {
           let summary = desc;
           let mitigations = ["Please refer to vendor advisories for official patches."];
           if(res.includes('SUMMARY:') && res.includes('MITIGATION:')) {
             const parts = res.split('MITIGATION:');
             summary = parts[0].replace('SUMMARY:', '').trim();
             mitigations = parts[1].split('\\n').filter(l => l.trim().startsWith('-')).map(l => l.replace('-', '').trim());
           } else {
             summary = res;
           }
           aiBriefing = { ...aiBriefing, aiSummary: summary };
           if(mitigations.length > 0 && mitigations[0] !== "") {
               aiBriefing = { ...aiBriefing, mitigation: mitigations };
           }
        }).catch(err => {
           aiBriefing = { ...aiBriefing, aiSummary: "Error generating AI summary: " + err.message };
        });

      } catch (err: any) {
        errorMsg = 'Could not find relevant data for this CVE ID in the MITRE database.';
      }
    } else {
      errorMsg = 'Currently, the real API only supports exact CVE IDs (e.g., CVE-2021-44228).';
    }

    loading = false;
    analyzing = false;
  }`;

content = content.replace(oldFunc, newFunc);

content = content.replace('</script>', '</script>\n\n<AiKeyModal show={showAiKeyModal} onClose={() => showAiKeyModal = false} onSaved={() => { showAiKeyModal = false; searchVulnerability(searchQuery); }} />\n');

fs.writeFileSync(file, content);
console.log('Done cve/+page.svelte');
