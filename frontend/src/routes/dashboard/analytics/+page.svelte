<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  
  $: events = $eventsStore;
  
  let activeTab = 'overview';

  // Calculate Top IPs (Real Data)
  $: topIps = (() => {
    const counts: Record<string, number> = {};
    events.forEach(e => counts[e.ip] = (counts[e.ip] || 0) + 1);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count, percent: Math.round((count / (events.length || 1)) * 100) || 0 }));
  })();

  // Calculate Top Attack Types (Real Data)
  $: topTypes = (() => {
    const counts: Record<string, number> = {};
    events.forEach(e => counts[e.type] = (counts[e.type] || 0) + 1);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count, percent: Math.round((count / (events.length || 1)) * 100) || 0 }));
  })();

  // Calculate Top Countries (Real Data)
  $: topCountries = (() => {
    const counts: Record<string, number> = {};
    events.forEach(e => {
      const c = e.country || 'Local Network';
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([country, count]) => ({ country, count, percent: Math.round((count / (events.length || 1)) * 100) || 0 }));
  })();

  function getCountryColor(name: string) {
    if (name === 'China') return '#a32d2d';
    if (name === 'Russia') return '#854f0b';
    if (name === 'United States' || name === 'USA') return '#854f0b'; 
    if (name === 'Germany') return '#1d9e75';
    if (name === 'Brazil') return '#1d9e75';
    if (name === 'Local Network') return '#185fa5';
    return '#1d9e75';
  }

  function getTypeColor(type: string) {
    type = type.toLowerCase();
    if (type.includes('ssh') || type.includes('compromised')) return '#a32d2d';
    if (type.includes('port')) return '#854f0b';
    if (type.includes('web')) return '#185fa5';
    if (type.includes('sql') || type.includes('command')) return '#1d9e75';
    if (type.includes('ftp')) return '#6f42c1';
    return '#6c757d';
  }

  function getFlagEmoji(country: string) {
    if (country === 'Russia') return '🇷🇺';
    if (country === 'China') return '🇨🇳';
    if (country === 'Brazil') return '🇧🇷';
    if (country === 'United States' || country === 'USA') return '🇺🇸';
    if (country === 'Germany') return '🇩🇪';
    if (country === 'Local Network') return '🏠';
    return '🌍';
  }

  function setTab(tab: string) { activeTab = tab; }
</script>

<div class="analytics-page custom-scrollbar">
  <!-- Tabs Navigation -->
  <div class="tabs-nav">
    <button class="tab-btn {activeTab === 'overview' ? 'active' : ''}" on:click={() => setTab('overview')}>
      <i class="ti ti-dashboard"></i> Overview
    </button>
    <button class="tab-btn {activeTab === 'geographic' ? 'active' : ''}" on:click={() => setTab('geographic')}>
      <i class="ti ti-map-pin"></i> Geographic Data
    </button>
    <button class="tab-btn {activeTab === 'vectors' ? 'active' : ''}" on:click={() => setTab('vectors')}>
      <i class="ti ti-target"></i> Attack Vectors
    </button>
    <button class="tab-btn {activeTab === 'payloads' ? 'active' : ''}" on:click={() => setTab('payloads')}>
      <i class="ti ti-key"></i> Extracted Payloads
    </button>
  </div>

  <div class="tab-content">
    
    <!-- OVERVIEW TAB -->
    {#if activeTab === 'overview'}
      <div class="grid-2">
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title"><i class="ti ti-device-desktop-analytics"></i> Top Attacker IPs (Real Data)</div>
            <div class="subtitle">ไอพีที่ทำการโจมตีบ่อยที่สุดจากบันทึกการโจมตีจริง</div>
          </div>
          
          <div class="stat-list">
            {#each topIps as item, i}
            <div class="stat-item">
              <div class="stat-rank">#{i + 1}</div>
              <div class="stat-info">
                <div class="stat-name">{item.ip}</div>
                <div class="bar-bg">
                  <div class="bar-fill {i===0?'danger':(i<3?'warn':'info')}" style="width: {item.percent}%"></div>
                </div>
              </div>
              <div class="stat-val">{item.count} <span class="text-muted">hits</span></div>
            </div>
            {/each}
            {#if topIps.length === 0}
              <div class="empty-state">ไม่มีข้อมูลการโจมตี</div>
            {/if}
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <div class="panel-title"><i class="ti ti-shield-alert"></i> Quick Summary</div>
            <div class="subtitle">ภาพรวมสรุปจากข้อมูลทั้งหมดในระบบ</div>
          </div>
          <div class="summary-stats">
            <div class="s-box">
              <div class="s-val">{events.length}</div>
              <div class="s-lbl">Total Events</div>
            </div>
            <div class="s-box">
              <div class="s-val">{topIps.length}</div>
              <div class="s-lbl">Unique IPs</div>
            </div>
            <div class="s-box">
              <div class="s-val">{topCountries.length}</div>
              <div class="s-lbl">Countries</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Horizontal Distribution Legend (Added per Request) -->
      <div class="panel" style="margin-top: 16px;">
        <div class="panel-header" style="margin-bottom: 1rem;">
          <div class="panel-title"><i class="ti ti-chart-bar"></i> Attack Distribution by Type (24h)</div>
        </div>
        <div class="distribution-legend top-legend">
          {#each topTypes as item}
            <div class="legend-item">
              <span class="legend-color" style="background-color: {getTypeColor(item.type)};"></span>
              <span class="legend-name">{item.type === 'Aggressive Brute Force' ? 'SSH Brute' : (item.type === 'SSH Brute Force' ? 'SSH Brute' : (item.type === 'SSH Login Attempt' ? 'SSH Login' : item.type))}</span>
              <span class="legend-count">{item.count.toLocaleString()}</span>
            </div>
          {/each}
          {#if topTypes.length === 0}
            <div class="empty-state" style="padding: 1rem;">ไม่มีข้อมูลการโจมตี</div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- GEOGRAPHIC TAB -->
    {#if activeTab === 'geographic'}
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title"><i class="ti ti-world"></i> Top Source Countries (Real Data)</div>
          <div class="subtitle">ประเทศต้นทางของการโจมตี (มาจากข้อมูลจริง 100%) - หมายเหตุ: หากโจมตีภายในวง LAN จะขึ้นว่า Local Network</div>
        </div>
        
        <div class="country-grid">
          {#each topCountries as item, i}
          <div class="country-card">
            <div class="c-flag">{getFlagEmoji(item.country)}</div>
            <div class="c-details">
              <div class="c-name">{item.country}</div>
              <div class="c-percent">{item.percent}% ของทั้งหมด</div>
              <div class="c-bar">
                <div class="c-bar-fill" style="width: {item.percent}%; background: {getCountryColor(item.country)}"></div>
              </div>
            </div>
            <div class="c-hits">{item.count} <span class="text-muted">hits</span></div>
          </div>
          {/each}
          {#if topCountries.length === 0}
            <div class="empty-state">ไม่มีข้อมูลประเทศจากการโจมตี</div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- VECTORS TAB -->
    {#if activeTab === 'vectors'}
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title"><i class="ti ti-crosshair"></i> Attack Vectors (Real Data)</div>
          <div class="subtitle">ประเภทของการโจมตีที่พบมากที่สุด (มาจากข้อมูลจริง 100%)</div>
        </div>
        
        <div class="stat-list" style="max-width: 800px; margin: 0 auto;">
          {#each topTypes as item, i}
          <div class="stat-item" style="padding: 12px 0; border-bottom: 1px solid var(--border);">
            <div class="stat-rank" style="font-size: 16px;">#{i + 1}</div>
            <div class="stat-info" style="margin-left: 12px;">
              <div class="stat-name" style="font-size: 15px;">{item.type}</div>
              <div class="bar-bg" style="height: 10px;">
                <div class="bar-fill {i===0?'danger':(i<2?'warn':'info')}" style="width: {item.percent}%"></div>
              </div>
            </div>
            <div class="stat-val" style="font-size: 18px;">{item.count} <span class="text-muted">hits</span></div>
          </div>
          {/each}
          {#if topTypes.length === 0}
            <div class="empty-state">ไม่มีข้อมูลรูปแบบการโจมตี</div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- PAYLOADS TAB -->
    {#if activeTab === 'payloads'}
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title"><i class="ti ti-file-code"></i> Extracted Credentials & Payloads</div>
          <div class="subtitle">คำสั่งหรือข้อมูลรหัสผ่านที่แฮกเกอร์พยายามพิมพ์เข้ามาผ่าน Shell / SSH</div>
        </div>
        <div class="creds-grid">
          {#each events.filter(e => e.detail && e.detail.length > 5) as event}
            <div class="cred-card">
              <div class="cred-header">
                <span class="cred-ip">{event.ip}</span>
                <span class="cred-time">{event.time || event.timeStr}</span>
              </div>
              <div class="cred-payload">{event.detail}</div>
              <div class="cred-footer">Type: {event.type}</div>
            </div>
          {/each}
          {#if events.filter(e => e.detail && e.detail.length > 5).length === 0}
            <div class="empty-state">ยังไม่มีการบันทึก Payload หรือคำสั่งใดๆ</div>
          {/if}
        </div>
      </div>
    {/if}

  </div>
</div>

<style>
.analytics-page { max-width: 1400px; margin: 0 auto; padding-bottom: 2rem; }

/* Tabs */
.tabs-nav {
  display: flex; gap: 10px; margin-bottom: 20px;
  background: var(--bg-panel); padding: 8px; border-radius: var(--radius-md);
  border: 1px solid var(--border); overflow-x: auto;
}
.tab-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 20px; font-size: 13px; font-weight: 600;
  border-radius: var(--radius-sm); border: none; cursor: pointer;
  background: transparent; color: var(--text-secondary); transition: all 0.2s;
  white-space: nowrap;
}
.tab-btn i { font-size: 16px; }
.tab-btn:hover { background: var(--bg-secondary); color: var(--text-primary); }
.tab-btn.active { background: var(--green-bg); color: var(--green); }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.panel {
  background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 1.5rem;
  box-shadow: var(--shadow-sm); display: flex; flex-direction: column;
}
.panel-header { margin-bottom: 1.5rem; }
.panel-title { font-size: 15px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px; }
.panel-title i { color: var(--green); font-size: 20px; }
.subtitle { font-size: 12px; color: var(--text-secondary); margin-top: 4px; padding-left: 28px; }

/* Stat List (IPs, Vectors) */
.stat-list { display: flex; flex-direction: column; gap: 16px; }
.stat-item { display: flex; align-items: center; gap: 12px; }
.stat-rank { width: 24px; font-size: 12px; font-weight: 700; color: var(--text-muted); text-align: right; }
.stat-info { flex: 1; }
.stat-name { font-size: 13px; font-weight: 500; color: var(--text-primary); margin-bottom: 6px; font-family: 'Courier New', monospace; }
.bar-bg { width: 100%; height: 6px; background: var(--bg-secondary); border-radius: 4px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
.bar-fill.danger { background: var(--red); }
.bar-fill.warn { background: var(--orange); }
.bar-fill.info { background: var(--green); }
.stat-val { font-size: 14px; font-weight: 600; color: var(--text-primary); min-width: 60px; text-align: right; }
.text-muted { font-size: 11px; font-weight: 400; color: var(--text-muted); }

/* Summary Stats */
.summary-stats { display: flex; gap: 16px; margin-top: 10px; flex-wrap: wrap; }
.s-box { background: var(--bg-secondary); border-radius: var(--radius-sm); padding: 20px; flex: 1; text-align: center; border: 1px solid var(--border); }
.s-val { font-size: 32px; font-weight: 700; color: var(--green); margin-bottom: 5px; }
.s-lbl { font-size: 12px; color: var(--text-secondary); font-weight: 500; text-transform: uppercase; }

/* Distribution Legend */
.distribution-legend { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.top-legend { margin-bottom: 15px; border-bottom: 1px dashed var(--border); padding-bottom: 15px; }
.legend-item { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.legend-color { width: 12px; height: 12px; border-radius: 3px; }
.legend-name { color: var(--text-secondary); font-size: 11.5px; }
.legend-count { font-weight: 700; color: var(--text-primary); margin-left: 2px; }

/* Country Grid */
.country-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
.country-card {
  display: flex; align-items: center; gap: 16px;
  background: var(--bg-secondary); padding: 16px;
  border-radius: var(--radius-md); border: 1px solid var(--border);
}
.c-flag { font-size: 32px; }
.c-details { flex: 1; }
.c-name { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.c-percent { font-size: 11px; color: var(--text-muted); margin-bottom: 8px; }
.c-bar { height: 6px; background: rgba(0,0,0,0.05); border-radius: 3px; overflow: hidden; }
.c-bar-fill { height: 100%; border-radius: 3px; }
.c-hits { font-size: 16px; font-weight: 700; text-align: right; }

/* Payloads */
.creds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
.cred-card {
  background: var(--bg-secondary); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 16px; display: flex; flex-direction: column; gap: 12px;
}
.cred-header { display: flex; justify-content: space-between; align-items: center; }
.cred-ip { font-size: 12px; color: var(--text-primary); font-weight: 600; font-family: 'Courier New', monospace; }
.cred-time { font-size: 11px; color: var(--text-muted); }
.cred-payload { font-family: 'Courier New', monospace; font-size: 12px; color: var(--red); background: rgba(163,45,45,0.05); padding: 10px; border-radius: 6px; border: 1px solid rgba(163,45,45,0.1); word-break: break-all; }
.cred-footer { font-size: 11px; color: var(--text-muted); font-weight: 500; text-transform: uppercase; }

.empty-state { text-align: center; color: var(--text-muted); font-size: 13px; padding: 3rem; background: var(--bg-secondary); border-radius: var(--radius-md); }

@media (max-width: 900px) {
  .grid-2 { grid-template-columns: 1fr; }
}
</style>
