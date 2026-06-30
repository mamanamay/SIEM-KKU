<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  $: events = $eventsStore;

  // Categorize events by MITRE Tactics & Techniques
  $: reconEvents = events.filter(e => e.type.includes('Scan') || e.mitreCode === 'T1595' || e.mitreCode === 'T1046');
  $: accessEvents = events.filter(e => e.type.includes('SQL') || e.type.includes('Traversal') || e.type.includes('XSS') || e.mitreCode === 'T1190');
  $: credEvents = events.filter(e => e.type.includes('Brute') || e.type.includes('Login') || e.mitreCode === 'T1110');
  $: execEvents = events.filter(e => e.type.includes('Command') || e.type.includes('Exec') || e.mitreCode === 'T1059');
  $: ccEvents = events.filter(e => e.type.includes('Compromised') || e.mitreCode === 'T1043');

  // Helper to extract top IPs for a category
  function getTopIPs(catEvents: any[], limit = 3) {
    const counts: Record<string, number> = {};
    catEvents.forEach(e => counts[e.ip] = (counts[e.ip] || 0) + 1);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([ip, count]) => ({ ip, count }));
  }

  // Calculate Metrics for the top KPIs
  $: totalMappedEvents = reconEvents.length + accessEvents.length + credEvents.length + execEvents.length + ccEvents.length;
  $: activeTactics = [reconEvents, accessEvents, credEvents, execEvents, ccEvents].filter(arr => arr.length > 0).length;
  
  $: mostActiveTactic = (() => {
    const counts = [
      { name: 'Reconnaissance', count: reconEvents.length },
      { name: 'Initial Access', count: accessEvents.length },
      { name: 'Credential Access', count: credEvents.length },
      { name: 'Execution', count: execEvents.length },
      { name: 'Command & Control', count: ccEvents.length }
    ].sort((a,b) => b.count - a.count);
    return counts[0].count > 0 ? counts[0] : { name: 'None', count: 0 };
  })();

  $: uniqueSources = new Set(events.filter(e => e.type.includes('Scan') || e.type.includes('SQL') || e.type.includes('Brute') || e.type.includes('Command')).map(e => e.ip)).size;
</script>

<div class="page-container">
  <div class="page-header">
    <div class="page-title"><i class="ti ti-grid-dots"></i> MITRE ATT&CK® Matrix Mapping</div>
    <div class="page-subtitle">Mapping real-time honeypot alerts to adversary tactics, techniques, and procedures (TTPs).</div>
  </div>

  <!-- KPI Summary Cards -->
  <div class="kpi-row">
    <div class="kpi-card info">
      <div class="kpi-icon"><i class="ti ti-target"></i></div>
      <div class="kpi-data">
        <div class="kpi-val">{totalMappedEvents}</div>
        <div class="kpi-label">Mapped Events</div>
      </div>
    </div>
    <div class="kpi-card warn">
      <div class="kpi-icon"><i class="ti ti-flame"></i></div>
      <div class="kpi-data">
        <div class="kpi-val">{mostActiveTactic.name}</div>
        <div class="kpi-label">Top Tactic ({mostActiveTactic.count} hits)</div>
      </div>
    </div>
    <div class="kpi-card danger">
      <div class="kpi-icon"><i class="ti ti-skull"></i></div>
      <div class="kpi-data">
        <div class="kpi-val">{activeTactics} / 5</div>
        <div class="kpi-label">Active Threat Vectors</div>
      </div>
    </div>
    <div class="kpi-card ok">
      <div class="kpi-icon"><i class="ti ti-users"></i></div>
      <div class="kpi-data">
        <div class="kpi-val">{uniqueSources}</div>
        <div class="kpi-label">Unique Adversary IPs</div>
      </div>
    </div>
  </div>

  <!-- Information Banner -->
  <div class="info-banner">
    <i class="ti ti-info-circle"></i>
    <div class="banner-text">
      <strong>How to read this matrix:</strong> Columns represent the tactical goal of the adversary (Tactics). The cards inside represent how they achieve it (Techniques). The system automatically correlates live honeypot traffic and flags the most active techniques. Colored badges indicate payload severity: <span class="badge b-cyan">Recon</span> <span class="badge b-orange">High Risk</span> <span class="badge b-red">Critical</span>.
    </div>
  </div>

  <!-- The Matrix -->
  <div class="mitre-matrix">
    <!-- Tactic 1: Reconnaissance -->
    <div class="tactic-column">
      <div class="tactic-header">
        <h4>Reconnaissance & Discovery</h4>
        <div class="tactic-desc">Adversary is trying to gather information they can use to plan future operations.</div>
        <div class="tactic-stats"><i class="ti ti-activity"></i> {reconEvents.length} Events Detected</div>
      </div>
      
      {#if reconEvents.length > 0}
        <div class="technique-card active">
          <div class="t-id">T1595 / T1046</div>
          <div class="t-name">Active Scanning & Port Discovery</div>
          <p class="t-desc">Probing network boundaries for open ports and vulnerable web services.</p>
          <div class="t-body">
            <div class="badge-group">
              <span class="badge b-cyan">Web Scan</span>
              <span class="badge b-orange">Port Scan</span>
            </div>
            <div class="top-attackers">
              <strong>Top Adversary IPs:</strong>
              {#each getTopIPs(reconEvents) as src}
                <div class="src-ip">{src.ip} <span class="hit-count">({src.count})</span></div>
              {/each}
            </div>
          </div>
        </div>
      {:else}
        <div class="technique-card empty">
          <i class="ti ti-shield-check"></i>
          <div>No scanning activity detected. Perimeter is secure.</div>
        </div>
      {/if}
    </div>

    <!-- Tactic 2: Initial Access -->
    <div class="tactic-column">
      <div class="tactic-header">
        <h4>Initial Access</h4>
        <div class="tactic-desc">Adversary is trying to get into your network by exploiting public-facing applications.</div>
        <div class="tactic-stats"><i class="ti ti-activity"></i> {accessEvents.length} Events Detected</div>
      </div>
      
      {#if accessEvents.length > 0}
        <div class="technique-card active danger">
          <div class="t-id">T1190</div>
          <div class="t-name">Exploit Public-Facing Application</div>
          <p class="t-desc">Attempting to exploit vulnerabilities (SQLi, XSS) in external web servers.</p>
          <div class="t-body">
            <div class="badge-group">
              <span class="badge b-red">SQL Injection</span>
              <span class="badge b-orange">Path Traversal</span>
            </div>
            <div class="top-attackers">
              <strong>Top Adversary IPs:</strong>
              {#each getTopIPs(accessEvents) as src}
                <div class="src-ip">{src.ip} <span class="hit-count">({src.count})</span></div>
              {/each}
            </div>
          </div>
        </div>
      {:else}
        <div class="technique-card empty">
          <i class="ti ti-shield-check"></i>
          <div>No exploit attempts detected on public apps.</div>
        </div>
      {/if}
    </div>

    <!-- Tactic 3: Credential Access -->
    <div class="tactic-column">
      <div class="tactic-header">
        <h4>Credential Access</h4>
        <div class="tactic-desc">Adversary is trying to steal account names and passwords (e.g. via Brute Force).</div>
        <div class="tactic-stats"><i class="ti ti-activity"></i> {credEvents.length} Events Detected</div>
      </div>
      
      {#if credEvents.length > 0}
        <div class="technique-card active warning">
          <div class="t-id">T1110</div>
          <div class="t-name">Brute Force</div>
          <p class="t-desc">Systematically guessing passwords to gain valid credentials for SSH access.</p>
          <div class="t-body">
            <div class="badge-group">
              <span class="badge b-red">SSH Brute Force</span>
              <span class="badge b-orange">SSH Login Attempt</span>
            </div>
            <div class="top-attackers">
              <strong>Top Adversary IPs:</strong>
              {#each getTopIPs(credEvents) as src}
                <div class="src-ip">{src.ip} <span class="hit-count">({src.count})</span></div>
              {/each}
            </div>
          </div>
        </div>
      {:else}
        <div class="technique-card empty">
          <i class="ti ti-shield-check"></i>
          <div>No credential stuffing or brute force detected.</div>
        </div>
      {/if}
    </div>

    <!-- Tactic 4: Execution -->
    <div class="tactic-column">
      <div class="tactic-header">
        <h4>Execution</h4>
        <div class="tactic-desc">Adversary is trying to run malicious code or scripts on the compromised system.</div>
        <div class="tactic-stats"><i class="ti ti-activity"></i> {execEvents.length} Events Detected</div>
      </div>
      
      {#if execEvents.length > 0}
        <div class="technique-card active danger">
          <div class="t-id">T1059</div>
          <div class="t-name">Command & Scripting</div>
          <p class="t-desc">Adversary is executing unauthorized shell commands on the honeypot.</p>
          <div class="t-body">
            <div class="badge-group">
              <span class="badge b-red">Command Execution</span>
            </div>
            <div class="top-attackers">
              <strong>Top Adversary IPs:</strong>
              {#each getTopIPs(execEvents) as src}
                <div class="src-ip">{src.ip} <span class="hit-count">({src.count})</span></div>
              {/each}
            </div>
          </div>
        </div>
      {:else}
        <div class="technique-card empty">
          <i class="ti ti-shield-check"></i>
          <div>No unauthorized code execution detected.</div>
        </div>
      {/if}
    </div>

    <!-- Tactic 5: Command and Control -->
    <div class="tactic-column">
      <div class="tactic-header">
        <h4>Command & Control</h4>
        <div class="tactic-desc">Adversary is trying to communicate with compromised systems to control them.</div>
        <div class="tactic-stats"><i class="ti ti-activity"></i> {ccEvents.length} Events Detected</div>
      </div>
      
      {#if ccEvents.length > 0}
        <div class="technique-card active critical">
          <div class="t-id">T1043 / T1071</div>
          <div class="t-name">Application Layer Protocol</div>
          <p class="t-desc">Compromised host establishing outbound connection to known C&C servers.</p>
          <div class="t-body">
            <div class="badge-group">
              <span class="badge b-red">System Compromised</span>
              <span class="badge b-red">Outbound C&C</span>
            </div>
            <div class="top-attackers">
              <strong>Top Adversary IPs:</strong>
              {#each getTopIPs(ccEvents) as src}
                <div class="src-ip">{src.ip} <span class="hit-count">({src.count})</span></div>
              {/each}
            </div>
          </div>
        </div>
      {:else}
        <div class="technique-card empty">
          <i class="ti ti-shield-check"></i>
          <div>No C&C communication detected.</div>
        </div>
        <!-- Mock display for visual completeness -->
        <div class="technique-card placeholder">
          <div class="t-id">T1043</div>
          <div class="t-name">Commonly Used Port</div>
          <div class="t-body text-muted">Awaiting correlation data from network sensors...</div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .page-container { padding: 1.5rem; max-width: 1400px; margin: 0 auto; }
  .page-header { margin-bottom: 1.5rem; }
  .page-title { font-size: 1.5rem; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .page-title i { color: var(--accent); }
  .page-subtitle { font-size: 13px; color: var(--text-secondary); }

  /* KPI Summary Row */
  .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; }
  .kpi-card { 
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; 
    padding: 15px; display: flex; align-items: center; gap: 15px; box-shadow: var(--shadow-sm); 
  }
  .kpi-icon { width: 45px; height: 45px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 24px; }
  .kpi-card.info .kpi-icon { background: rgba(0, 212, 255, 0.15); color: var(--blue); }
  .kpi-card.warn .kpi-icon { background: rgba(255, 136, 0, 0.15); color: var(--orange); }
  .kpi-card.danger .kpi-icon { background: rgba(255, 51, 51, 0.15); color: var(--red); }
  .kpi-card.ok .kpi-icon { background: rgba(46, 204, 113, 0.15); color: var(--green); }
  
  .kpi-val { font-size: 1.4rem; font-weight: 700; color: var(--text-primary); line-height: 1.2; }
  .kpi-label { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; }

  /* Info Banner */
  .info-banner {
    background: rgba(0, 212, 255, 0.05); border: 1px solid rgba(0, 212, 255, 0.2);
    border-radius: 8px; padding: 12px 15px; display: flex; align-items: flex-start; gap: 12px;
    margin-bottom: 20px;
  }
  .info-banner i { color: var(--accent); font-size: 20px; margin-top: 2px; }
  .banner-text { font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
  .banner-text strong { color: var(--text-primary); }

  /* The Matrix */
  .mitre-matrix { 
    display: flex; gap: 15px; 
    overflow-x: auto; padding-bottom: 15px; 
  }
  
  .tactic-column {
    flex: 1; min-width: 260px; max-width: 320px;
    background: var(--bg-panel); border: 1px solid var(--border); 
    border-radius: 8px; overflow: hidden;
    display: flex; flex-direction: column;
  }
  
  .tactic-header {
    background: rgba(0,0,0,0.15); padding: 15px; 
    border-bottom: 1px solid var(--border);
  }
  .tactic-header h4 { margin: 0 0 5px 0; font-size: 14px; color: var(--text-primary); font-weight: 700; }
  .tactic-desc { font-size: 11px; color: var(--text-secondary); line-height: 1.4; margin-bottom: 10px; }
  .tactic-stats { font-size: 11px; color: var(--accent); font-weight: 600; display: flex; align-items: center; gap: 4px; }

  .technique-card {
    margin: 12px; padding: 15px; 
    border-radius: 8px; border: 1px solid var(--border);
    background: var(--bg-secondary);
  }
  .technique-card.empty { 
    text-align: center; color: var(--text-muted); font-size: 12px; 
    border: 1px dashed var(--border); background: transparent; 
    padding: 30px 15px; display: flex; flex-direction: column; gap: 10px; align-items: center;
  }
  .technique-card.empty i { font-size: 24px; opacity: 0.5; }
  .technique-card.placeholder { opacity: 0.5; border: 1px dashed var(--border); }
  
  .technique-card.active { border-left: 3px solid var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .technique-card.active.warning { border-left-color: var(--orange); }
  .technique-card.active.danger { border-left-color: var(--red); background: rgba(255,51,51,0.02); }
  .technique-card.active.critical { border-left-color: #ff0000; background: rgba(255,0,0,0.05); border: 1px solid rgba(255,0,0,0.2); border-left: 4px solid #ff0000; }

  .t-id { font-size: 11px; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px; }
  .t-name { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; line-height: 1.2; }
  .t-desc { font-size: 11px; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.4; }
  
  .t-body { display: flex; flex-direction: column; gap: 12px; }
  
  .badge-group { display: flex; flex-wrap: wrap; gap: 6px; }
  .badge { font-size: 10px; padding: 4px 8px; border-radius: 4px; font-weight: 700; letter-spacing: 0.05em; }
  .b-red { background: rgba(255, 51, 51, 0.15); color: #ff3333; border: 1px solid rgba(255, 51, 51, 0.4); }
  .b-orange { background: rgba(255, 136, 0, 0.15); color: #ff8800; border: 1px solid rgba(255, 136, 0, 0.4); }
  .b-cyan { background: rgba(0, 212, 255, 0.15); color: #00d4ff; border: 1px solid rgba(0, 212, 255, 0.4); }

  .top-attackers { padding-top: 10px; border-top: 1px dashed var(--border); }
  .top-attackers strong { display: block; font-size: 10px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; }
  .src-ip { font-family: monospace; font-size: 12px; color: var(--text-primary); display: flex; justify-content: space-between; margin-bottom: 4px; background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 4px; }
  .hit-count { color: var(--accent); font-weight: 600; }
  
  .text-muted { color: var(--text-muted); font-size: 11px; }

  @media (max-width: 1200px) {
    .kpi-row { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 800px) {
    .kpi-row { grid-template-columns: 1fr; }
    .mitre-matrix { flex-direction: column; }
    .tactic-column { width: 100%; max-width: none; }
  }
</style>
