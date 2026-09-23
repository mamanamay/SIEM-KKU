<svelte:head><title>MITRE ATT&CK&reg; Matrix - KKUSIEM</title></svelte:head>
<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  
  
  $: events = $eventsStore || [];

  // The 14 MITRE Tactics
  const tactics = [
    { id: 'TA0043', name: 'Reconnaissance', techniques: [{ id: 'T1595', name: 'Active Scanning' }, { id: 'T1592', name: 'Gather Victim Host Info' }, { id: 'T1589', name: 'Gather Victim Identity Info' }] },
    { id: 'TA0042', name: 'Resource Dev', techniques: [{ id: 'T1583', name: 'Acquire Infrastructure' }, { id: 'T1587', name: 'Develop Capabilities' }] },
    { id: 'TA0001', name: 'Initial Access', techniques: [{ id: 'T1190', name: 'Exploit Public-Facing App' }, { id: 'T1566', name: 'Phishing' }, { id: 'T1078', name: 'Valid Accounts' }] },
    { id: 'TA0002', name: 'Execution', techniques: [{ id: 'T1059', name: 'Command & Scripting' }, { id: 'T1203', name: 'Exploitation for Exec' }, { id: 'T1053', name: 'Scheduled Task/Job' }] },
    { id: 'TA0003', name: 'Persistence', techniques: [{ id: 'T1098', name: 'Account Manipulation' }, { id: 'T1543', name: 'Create/Modify Process' }] },
    { id: 'TA0004', name: 'Privilege Esc', techniques: [{ id: 'T1548', name: 'Abuse Elevation Control' }, { id: 'T1068', name: 'Exploitation for PrivEsc' }] },
    { id: 'TA0005', name: 'Defense Evasion', techniques: [{ id: 'T1140', name: 'Deobfuscate/Decode' }, { id: 'T1070', name: 'Indicator Removal' }] },
    { id: 'TA0006', name: 'Credential Access', techniques: [{ id: 'T1110', name: 'Brute Force' }, { id: 'T1003', name: 'OS Credential Dumping' }, { id: 'T1555', name: 'Credentials from Password Stores' }] },
    { id: 'TA0007', name: 'Discovery', techniques: [{ id: 'T1087', name: 'Account Discovery' }, { id: 'T1082', name: 'System Info Discovery' }, { id: 'T1046', name: 'Network Service Scanning' }] },
    { id: 'TA0008', name: 'Lateral Movement', techniques: [{ id: 'T1210', name: 'Exploitation of Remote Services' }, { id: 'T1563', name: 'Remote Service Session Hijacking' }] },
    { id: 'TA0009', name: 'Collection', techniques: [{ id: 'T1560', name: 'Archive Collected Data' }, { id: 'T1119', name: 'Automated Collection' }] },
    { id: 'TA0011', name: 'Command & Control', techniques: [{ id: 'T1071', name: 'Application Layer Protocol' }, { id: 'T1132', name: 'Data Encoding' }] },
    { id: 'TA0010', name: 'Exfiltration', techniques: [{ id: 'T1041', name: 'Exfiltration Over C2 Channel' }] },
    { id: 'TA0040', name: 'Impact', techniques: [{ id: 'T1485', name: 'Data Destruction' }, { id: 'T1490', name: 'Inhibit System Recovery' }, { id: 'T1489', name: 'Service Stop' }] }
  ];

  // Map events to techniques
  $: techniqueCounts = events.reduce((acc, e) => {
    let t = '';
    if ((e.type || '').includes('Scan') || (e.type || '').includes('Nmap')) { t = 'T1595'; acc['T1046'] = (acc['T1046'] || 0) + 1; }
    else if ((e.type || '').includes('SQL') || (e.type || '').includes('Traversal') || (e.type || '').includes('XSS')) t = 'T1190';
    else if ((e.type || '').includes('Brute') || (e.type || '').includes('Login')) t = 'T1110';
    else if ((e.type || '').includes('Command') || (e.type || '').includes('Exec')) t = 'T1059';
    else if ((e.type || '').includes('Compromised') || (e.type || '').includes('Botnet')) t = 'T1071';
    
    if (t) acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  function getHeatmapColor(count: number) {
    if (!count) return 'transparent';
    if (count > 50) return 'rgba(220, 38, 38, 0.8)'; // Red
    if (count > 20) return 'rgba(245, 158, 11, 0.8)'; // Orange
    if (count > 5) return 'rgba(234, 179, 8, 0.6)'; // Yellow
    return 'rgba(59, 130, 246, 0.4)'; // Blue
  }

  $: totalHits = Object.values(techniqueCounts).reduce((a, b) => a + (b as number), 0);
  $: activeTacticsCount = tactics.filter(t => t.techniques.some(tech => techniqueCounts[tech.id])).length;

  $: mitreExportRows = tactics.flatMap(tac => 
    tac.techniques
      .filter(tech => techniqueCounts[tech.id])
      .map(tech => ({
        Tactic: tac.name,
        'Technique ID': tech.id,
        'Technique Name': tech.name,
        Hits: String(techniqueCounts[tech.id])
      }))
  );
  const mitreExportCols = ['Tactic', 'Technique ID', 'Technique Name', 'Hits'];
</script>

<div class="mitre-page">
  <PageHeader title="MITRE ATT&CK® Enterprise Matrix" description="Mapping observed threat events to the globally accessible knowledge base of adversary tactics and techniques." icon="ti-target">
    <div slot="actions" style="display:flex; gap:12px;">
      <div class="summary-card">
        <div class="sc-val">{activeTacticsCount} / 14</div>
        <div class="sc-lbl">Active Tactics</div>
      </div>
      <div class="summary-card">
        <div class="sc-val">{totalHits}</div>
        <div class="sc-lbl">Mapped Events</div>
      </div>
    </div>
  </PageHeader>

  <!-- Enterprise Matrix -->
  <div class="matrix-container custom-scrollbar">
    <table class="mitre-matrix">
      <thead>
        <tr>
          {#each tactics as tac}
            <th title={tac.id}>
              <div class="tac-name">{tac.name}</div>
              <div class="tac-count">{tac.techniques.length} techniques</div>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        <!-- Max rows needed = 3 in this mock, but we'll find max techniques dynamically -->
        {#each Array(Math.max(...tactics.map(t => t.techniques.length))) as _, rowIndex}
          <tr>
            {#each tactics as tac}
              <td>
                {#if tac.techniques[rowIndex]}
                  {@const tech = tac.techniques[rowIndex]}
                  {@const hits = techniqueCounts[tech.id] || 0}
                  <div class="technique-cell" class:active={hits > 0} style="background: {getHeatmapColor(hits)}">
                    <div class="tech-id">{tech.id}</div>
                    <div class="tech-name">{tech.name}</div>
                    {#if hits > 0}
                      <div class="tech-hits">{hits} hits</div>
                    {/if}
                  </div>
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .mitre-page { display: flex; flex-direction: column; flex: 1; padding: 24px; gap: 24px; overflow: hidden; font-family: 'Inter', sans-serif; color: var(--text-primary); }
  
  .header-row { display: flex; justify-content: space-between; align-items: flex-end; flex-shrink: 0; }
  .page-title { margin: 0; font-size: 24px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 8px; }
  .page-sub { margin: 6px 0 0; font-size: 14px; color: var(--text-muted); }
  
  .summary-card { background: rgba(0,0,0,0.2); border: 1px solid var(--border, rgba(255,255,255,0.1)); border-radius: 8px; padding: 12px 20px; display: flex; flex-direction: column; justify-content: center; align-items: center; }
  .sc-val { font-size: 20px; font-weight: 700; color: var(--text-primary); }
  .sc-lbl { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-top: 4px; }
  
  .matrix-container { flex: 1; overflow: auto; background: var(--bg-panel, #181b24); border: 1px solid var(--border); border-radius: 12px; }
  .mitre-matrix { border-collapse: separate; border-spacing: 4px; padding: 12px; min-width: 2800px; }
  .mitre-matrix th { background: rgba(255,255,255,0.05); border: 1px solid var(--border); padding: 12px; border-radius: 6px; text-align: left; vertical-align: top; width: 200px; }
  .tac-name { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
  .tac-count { font-size: 11px; color: var(--text-muted); }
  
  .mitre-matrix td { padding: 0; vertical-align: top; }
  .technique-cell { padding: 10px; border: 1px solid var(--border); border-radius: 6px; min-height: 80px; transition: 0.2s; position: relative; }
  .technique-cell.active { border-color: rgba(255,255,255,0.3); color: var(--text-primary); box-shadow: inset 0 0 20px rgba(0,0,0,0.2); }
  .tech-id { font-size: 11px; font-weight: 600; opacity: 0.7; margin-bottom: 4px; }
  .tech-name { font-size: 13px; font-weight: 500; line-height: 1.4; }
  .tech-hits { position: absolute; bottom: 8px; right: 8px; font-size: 10px; font-weight: 700; background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 4px; }
  
  .custom-scrollbar::-webkit-scrollbar { height: 10px; width: 10px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); border-radius: 5px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 5px; }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
</style>


