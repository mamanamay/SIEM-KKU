const fs = require('fs');
const file = 'src/routes/dashboard/+page.svelte';
let content = fs.readFileSync(file, 'utf8');

// 1. Add state for selected IP
if (!content.includes('let selectedMapIp = null;')) {
  content = content.replace(/let mapEl: HTMLDivElement;/, "let mapEl: HTMLDivElement;\n  let selectedMapIp: any = null;");
}

// 2. Add marker click event
const markerCode = `
      const marker = L.marker(coords, { icon }).addTo(map)
        .bindPopup(\`<b>\${ip}</b><br>\${country}<br>\${atkCount} attacks\`);
`;
const newMarkerCode = `
      const marker = L.marker(coords, { icon }).addTo(map)
        .bindPopup(\`<b>\${ip}</b><br>\${country}<br>\${atkCount} attacks\`);
      
      marker.on('click', () => {
        const events = $eventsStore.filter(e => e.ip === ip);
        const criticals = events.filter(e => e.severity === 'critical').length;
        selectedMapIp = { ip, country, atkCount, criticals, latestType: events[0]?.type || 'Unknown' };
      });
`;
content = content.replace(markerCode, newMarkerCode);

// 3. Add the side panel UI
const sidePanelUI = `
  <!-- Click-to-Analyze Side Panel -->
  {#if selectedMapIp}
    <div class="map-side-panel">
      <div class="panel-header">
        <h4><i class="ti ti-target"></i> Threat Target Analysis</h4>
        <button on:click={() => selectedMapIp = null}><i class="ti ti-x"></i></button>
      </div>
      <div class="panel-body">
        <div class="info-row">
          <span class="lbl">Source IP</span>
          <span class="val ds-mono" style="color:var(--cyan);">{selectedMapIp.ip}</span>
        </div>
        <div class="info-row">
          <span class="lbl">Location</span>
          <span class="val">{selectedMapIp.country}</span>
        </div>
        <div class="info-row">
          <span class="lbl">Total Attacks</span>
          <span class="val" style="color:var(--orange);font-weight:bold;">{selectedMapIp.atkCount}</span>
        </div>
        <div class="info-row">
          <span class="lbl">Critical severity</span>
          <span class="val" style="color:var(--red);font-weight:bold;">{selectedMapIp.criticals}</span>
        </div>
        <div class="info-row">
          <span class="lbl">Latest Vector</span>
          <span class="val">{selectedMapIp.latestType}</span>
        </div>
        
        <div class="panel-actions">
          <a href="/dashboard/hunting?ip={selectedMapIp.ip}" class="ds-btn primary" style="text-decoration:none;text-align:center;"><i class="ti ti-search"></i> Investigate</a>
          <a href="/dashboard/blocked_ip_audit?ip={selectedMapIp.ip}" class="ds-btn danger" style="text-decoration:none;text-align:center;"><i class="ti ti-ban"></i> Block IP</a>
        </div>
      </div>
    </div>
  {/if}
`;

if (!content.includes('map-side-panel')) {
  content = content.replace(/<div class="map-container" bind:this={mapEl}><\/div>/, `<div class="map-container" bind:this={mapEl}></div>\n${sidePanelUI}`);
  
  const sidePanelStyle = `
  .map-side-panel {
    position: absolute; top: 10px; right: 10px; width: 300px;
    background: rgba(10, 15, 28, 0.95); backdrop-filter: blur(10px);
    border: 1px solid var(--border); border-radius: 8px; z-index: 1000;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    display: flex; flex-direction: column; overflow: hidden;
    animation: slideInRight 0.3s ease-out forwards;
  }
  @keyframes slideInRight { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  .map-side-panel .panel-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 16px; border-bottom: 1px solid var(--border); background: rgba(0,0,0,0.2);
  }
  .map-side-panel .panel-header h4 { margin: 0; font-size: 13px; color: var(--cyan); display: flex; align-items: center; gap: 6px; }
  .map-side-panel .panel-header button { background: none; border: none; color: var(--text-muted); cursor: pointer; }
  .map-side-panel .panel-header button:hover { color: #fff; }
  .map-side-panel .panel-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .info-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 6px; }
  .info-row .lbl { color: var(--text-muted); }
  .panel-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
  `;
  content = content.replace(/<\/style>/, `${sidePanelStyle}\n</style>`);
}

fs.writeFileSync(file, content);
console.log('Added Click-to-Analyze Map panel');
