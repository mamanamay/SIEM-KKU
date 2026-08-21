<svelte:head><title>Security Scorecard - KKUSIEM</title></svelte:head>
<script lang="ts">
  import { eventsStore } from '../../../stores/events';

  $: events = $eventsStore;

  $: criticalCount = events.filter(e => e.severity === 'critical').length;
  $: highCount = events.filter(e => e.severity === 'high').length;
  $: blockedCount = events.filter(e => e.status === 'blocked' || e.status === 'Blocked').length;
  $: totalCount = events.length;

  // Dynamic score from real data
  $: securityScore = Math.max(10, Math.min(100, Math.round(100 - (criticalCount * 3 + highCount * 1.5) / Math.max(totalCount, 1) * 100)));
  $: scoreGrade = securityScore >= 85 ? 'A' : securityScore >= 70 ? 'B' : securityScore >= 55 ? 'C' : 'D';
  $: scoreColor = securityScore >= 85 ? '#10b981' : securityScore >= 70 ? '#f59e0b' : '#ef4444';

  const compliance = [
    { name: 'ISO 27001', desc: 'Information Security Management', score: 92, status: 'Compliant' },
    { name: 'PDPA', desc: 'Personal Data Protection Act (TH)', score: 88, status: 'Warning' },
    { name: 'PCI-DSS', desc: 'Payment Card Industry Security', score: 95, status: 'Compliant' },
    { name: 'NIST CSF', desc: 'Cybersecurity Framework', score: 80, status: 'Compliant' },
  ];

  const riskLayers = [
    { label: 'Network (Firewall / IDS)', pct: 45, color: '#3b82f6' },
    { label: 'Application (WAF / Web)', pct: 30, color: '#8b5cf6' },
    { label: 'Endpoint (EDR / Wazuh)', pct: 25, color: '#f43f5e' },
  ];

  const metrics = [
    { label: 'Mean Time to Detect (MTTD)', value: '4.2m', icon: 'ti-eye', color: '#3b82f6' },
    { label: 'Mean Time to Respond (MTTR)', value: '12.5m', icon: 'ti-clock', color: '#8b5cf6' },
    { label: 'False Positive Rate', value: '3.1%', icon: 'ti-filter', color: '#f59e0b' },
    { label: 'Detection Coverage', value: '87%', icon: 'ti-radar', color: '#10b981' },
  ];

  import PageHeader from '../../../lib/components/PageHeader.svelte';
  
  $: scorecardExportData = compliance.map(c => ({ Framework: c.name, Description: c.desc, Score: `${c.score}%`, Status: c.status }));
</script>

<div class="sc-page">
  <PageHeader 
    title="Security Scorecard" 
    description="Executive CISO View — Overall Posture, Compliance Readiness & Risk Metrics" 
    icon="ti-shield-check"
    exportData={scorecardExportData}
    exportColumns={['Framework', 'Description', 'Score', 'Status']}
    exportFilename="scorecard-report"
    exportTitle="KKUSIEM Security Scorecard — Grade {scoreGrade}"
  />

  <!-- Top Row: Score + KPI -->
  <div class="top-row">
    <!-- Security Grade Card -->
    <div class="score-card">
      <div class="grade-ring" style="border-color:{scoreColor}; color:{scoreColor};">
        {scoreGrade}
      </div>
      <div class="score-info">
        <div class="score-num" style="color:{scoreColor};">{securityScore}<span style="font-size:14px;font-weight:500;color:var(--text-muted);">/100</span></div>
        <div class="score-lbl">Overall Security Score</div>
        <div class="score-sub">{scoreGrade === 'A' ? '✅ ระดับดีเยี่ยม' : scoreGrade === 'B' ? '⚠️ ระดับดี — ปรับปรุงได้' : '❌ ต้องแก้ไขด่วน'}</div>
      </div>
    </div>

    <!-- KPI Grid -->
    <div class="kpi-grid">
      <div class="kpi-card" style="border-top: 3px solid #dc2626;">
        <div class="kpi-icon" style="background:rgba(220,38,38,0.1);color:#dc2626;"><i class="ti ti-shield-x"></i></div>
        <div class="kpi-val" style="color:#dc2626;">{criticalCount}</div>
        <div class="kpi-lbl">Critical Alerts Open</div>
      </div>
      <div class="kpi-card" style="border-top: 3px solid #ea580c;">
        <div class="kpi-icon" style="background:rgba(234,88,12,0.1);color:#ea580c;"><i class="ti ti-alert-triangle"></i></div>
        <div class="kpi-val" style="color:#ea580c;">{highCount}</div>
        <div class="kpi-lbl">High Severity</div>
      </div>
      <div class="kpi-card" style="border-top: 3px solid #1d9e75;">
        <div class="kpi-icon" style="background:rgba(29,158,117,0.1);color:#1d9e75;"><i class="ti ti-ban"></i></div>
        <div class="kpi-val" style="color:#1d9e75;">{blockedCount}</div>
        <div class="kpi-lbl">IPs Blocked</div>
      </div>
      <div class="kpi-card" style="border-top: 3px solid #3b82f6;">
        <div class="kpi-icon" style="background:rgba(59,130,246,0.1);color:#3b82f6;"><i class="ti ti-activity"></i></div>
        <div class="kpi-val">{totalCount.toLocaleString()}</div>
        <div class="kpi-lbl">Total Events</div>
      </div>
    </div>
  </div>

  <!-- Second Row: Compliance + Metrics -->
  <div class="mid-row">
    <!-- Compliance -->
    <div class="card">
      <div class="card-head"><div class="card-title"><i class="ti ti-file-certificate"></i> Compliance Readiness</div></div>
      <div class="comp-list">
        {#each compliance as c}
          <div class="comp-row">
            <div class="comp-left">
              <div class="comp-name">{c.name}</div>
              <div class="comp-desc">{c.desc}</div>
            </div>
            <div class="comp-bar-wrap">
              <div class="comp-bar">
                <div class="comp-fill" style="width:{c.score}%;background:{c.score >= 90 ? '#10b981' : c.score >= 75 ? '#f59e0b' : '#ef4444'};"></div>
              </div>
            </div>
            <div class="comp-right">
              <div class="comp-score">{c.score}%</div>
              <span class="comp-badge comp-{c.status === 'Compliant' ? 'green' : 'orange'}">{c.status}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- SOC Metrics -->
    <div class="card">
      <div class="card-head"><div class="card-title"><i class="ti ti-activity"></i> SOC Performance Metrics</div></div>
      <div class="metrics-list">
        {#each metrics as m}
          <div class="metric-row">
            <div class="metric-icon" style="background:rgba(0,0,0,0.05);color:{m.color};"><i class="ti {m.icon}"></i></div>
            <div class="metric-info">
              <div class="metric-lbl">{m.label}</div>
            </div>
            <div class="metric-val" style="color:{m.color};">{m.value}</div>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Bottom Row: Risk Layers -->
  <div class="card">
    <div class="card-head"><div class="card-title"><i class="ti ti-chart-pie-2"></i> Risk Distribution by Security Layer</div></div>
    <div class="risk-body">
      <div class="risk-bars">
        {#each riskLayers as r}
          <div class="risk-row">
            <div class="risk-lbl"><span class="risk-dot" style="background:{r.color};"></span>{r.label}</div>
            <div class="risk-bar-wrap">
              <div class="risk-bar"><div class="risk-fill" style="width:{r.pct}%;background:{r.color};"></div></div>
            </div>
            <div class="risk-pct">{r.pct}%</div>
          </div>
        {/each}
      </div>
      <div class="multi-bar">
        {#each riskLayers as r}
          <div class="multi-seg" style="width:{r.pct}%;background:{r.color};" title="{r.label}: {r.pct}%"></div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .sc-page { padding: 24px 32px; max-width: 1400px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
  .page-hdr { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
  .page-hdr-left { display: flex; align-items: center; gap: 14px; }
  .page-icon { width: 44px; height: 44px; background: rgba(16,185,129,0.12); color: #10b981; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
  .page-title { font-size: 22px; font-weight: 800; color: var(--text-primary); margin: 0 0 4px; }
  .page-desc { font-size: 13px; color: var(--text-muted); margin: 0; }
  .btn-primary { display: inline-flex; align-items: center; gap: 6px; padding: 9px 18px; background: #1d9e75; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; color: var(--bg-panel); cursor: pointer; }

  /* Top Row */
  .top-row { display: grid; grid-template-columns: 280px 1fr; gap: 16px; }
  .score-card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; padding: 24px; display: flex; align-items: center; gap: 20px; }
  .grade-ring { width: 80px; height: 80px; border-radius: 50%; border: 4px solid; display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: 900; flex-shrink: 0; }
  .score-num { font-size: 32px; font-weight: 900; line-height: 1; }
  .score-lbl { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-top: 6px; }
  .score-sub { font-size: 11.5px; color: var(--text-muted); margin-top: 4px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  .kpi-card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
  .kpi-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 17px; }
  .kpi-val { font-size: 28px; font-weight: 900; color: var(--text-primary); line-height: 1; }
  .kpi-lbl { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; }

  /* Mid Row */
  .mid-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .card-head { padding: 13px 18px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); }
  .card-title { font-size: 13px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 7px; }

  /* Compliance */
  .comp-list { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
  .comp-row { display: flex; align-items: center; gap: 12px; }
  .comp-left { width: 140px; flex-shrink: 0; }
  .comp-name { font-size: 13px; font-weight: 700; color: var(--text-primary); }
  .comp-desc { font-size: 10.5px; color: var(--text-muted); }
  .comp-bar-wrap { flex: 1; }
  .comp-bar { height: 8px; background: var(--bg-secondary); border-radius: 4px; overflow: hidden; }
  .comp-fill { height: 100%; border-radius: 4px; transition: width 1s; }
  .comp-right { width: 90px; text-align: right; flex-shrink: 0; }
  .comp-score { font-size: 14px; font-weight: 800; color: var(--text-primary); }
  .comp-badge { display: inline-block; padding: 2px 7px; border-radius: 20px; font-size: 9.5px; font-weight: 700; text-transform: uppercase; }
  .comp-green { background: rgba(16,185,129,0.1); color: #10b981; }
  .comp-orange { background: rgba(245,158,11,0.1); color: #f59e0b; }

  /* Metrics */
  .metrics-list { padding: 12px; display: flex; flex-direction: column; gap: 4px; }
  .metric-row { display: flex; align-items: center; gap: 12px; padding: 10px 6px; border-radius: 8px; }
  .metric-row:hover { background: var(--bg-secondary); }
  .metric-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0; }
  .metric-lbl { font-size: 13px; color: var(--text-primary); font-weight: 500; }
  .metric-val { font-size: 22px; font-weight: 900; margin-left: auto; }

  /* Risk Layers */
  .risk-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }
  .risk-bars { display: flex; flex-direction: column; gap: 10px; }
  .risk-row { display: flex; align-items: center; gap: 12px; }
  .risk-lbl { width: 220px; font-size: 13px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
  .risk-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .risk-bar-wrap { flex: 1; }
  .risk-bar { height: 10px; background: var(--bg-secondary); border-radius: 5px; overflow: hidden; }
  .risk-fill { height: 100%; border-radius: 5px; transition: width 1s; }
  .risk-pct { width: 42px; font-size: 13px; font-weight: 700; color: var(--text-primary); text-align: right; }
  .multi-bar { display: flex; height: 28px; border-radius: 14px; overflow: hidden; background: var(--bg-secondary); margin-top: 4px; }
  .multi-seg { height: 100%; transition: width 1s; }

  @media (max-width: 900px) {
    .top-row, .mid-row, .kpi-grid { grid-template-columns: 1fr; }
  }
</style>
