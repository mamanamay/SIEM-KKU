<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  import { faculties, getFacultyForIP } from '../../../stores/faculties';
  
  let selectedFacultyCode = 'ALL';

  $: mappedEvents = $eventsStore.map(e => ({
    ...e,
    faculty: getFacultyForIP(e.ip)
  }));

  $: filteredEvents = selectedFacultyCode === 'ALL' 
    ? mappedEvents.filter(e => e.faculty !== null) // show all internal mapped events
    : mappedEvents.filter(e => e.faculty && e.faculty.code === selectedFacultyCode);

  $: facultyStats = (() => {
    if (selectedFacultyCode !== 'ALL') {
      const f = faculties.find(x => x.code === selectedFacultyCode);
      return { total: filteredEvents.length, name: f ? f.name : 'Unknown' };
    }
    return { total: filteredEvents.length, name: 'ทุกคณะ / ส่วนงาน' };
  })();
</script>

<style>
  .page-container {
    padding: 1.5rem;
    max-width: 1400px;
    margin: 0 auto;
  }
  .page-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .page-title i {
    color: var(--green);
  }
  
  .filter-panel {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 15px;
    box-shadow: var(--shadow-sm);
  }
  
  .select-box {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    padding: 8px 12px;
    border-radius: 6px;
    font-family: inherit;
    font-size: 13px;
    outline: none;
    min-width: 250px;
    cursor: pointer;
  }
  
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 15px;
    margin-bottom: 1.5rem;
  }
  .metric-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1.25rem;
    box-shadow: var(--shadow-sm);
    position: relative;
    overflow: hidden;
  }
  .metric-card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background: var(--orange);
    border-radius: 2px 0 0 2px;
  }
  .m-label {
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .m-val {
    font-size: 28px;
    font-weight: 700;
    color: var(--text-primary);
  }
  
  .data-panel {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1.25rem;
    box-shadow: var(--shadow-sm);
  }
  
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .data-table th {
    text-align: left;
    padding: 10px;
    border-bottom: 2px solid var(--border);
    color: var(--text-secondary);
    font-weight: 600;
  }
  .data-table td {
    padding: 10px;
    border-bottom: 1px solid var(--border);
    color: var(--text-primary);
  }
  .badge {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: var(--bg-secondary);
  }
  .badge.critical { background: var(--red-bg); color: var(--red); }
  .badge.high { background: var(--orange-bg); color: var(--orange); }
</style>

<div class="page-container">
  <div class="page-title">
    <i class="ti ti-building"></i> Internal Threats Monitor (Faculty)
  </div>

  <div class="filter-panel">
    <span style="font-size: 13px; font-weight: 500;">เลือกคณะ / ส่วนงาน:</span>
    <select class="select-box" bind:value={selectedFacultyCode}>
      <option value="ALL">-- ดูทุกคณะ (ALL) --</option>
      {#each faculties as fac}
        <option value={fac.code}>[{fac.code}] {fac.name}</option>
      {/each}
    </select>
    <div style="flex-grow: 1;"></div>
    <span style="font-size: 11px; color: var(--text-muted);">* ข้อมูล Mapping IP กับคณะ เป็นระบบจำลองสำหรับการนำเสนอ Demo</span>
  </div>

  <div class="kpi-row">
    <div class="metric-card">
      <div class="m-label"><i class="ti ti-activity"></i> Total Events</div>
      <div class="m-val">{facultyStats.total.toLocaleString()}</div>
    </div>
    <div class="metric-card" style="--orange: var(--red)">
      <div class="m-label"><i class="ti ti-alert-triangle"></i> Critical Threats</div>
      <div class="m-val">{filteredEvents.filter(e => e.severity === 'critical').length.toLocaleString()}</div>
    </div>
    <div class="metric-card" style="--orange: var(--blue)">
      <div class="m-label"><i class="ti ti-shield"></i> Target Faculty</div>
      <div class="m-val" style="font-size: 18px; margin-top: 8px;">{facultyStats.name}</div>
    </div>
  </div>

  <div class="data-panel">
    <table class="data-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Source IP</th>
          <th>Mapped Faculty</th>
          <th>Event Type</th>
          <th>Severity</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredEvents.slice(0, 50) as event}
          <tr>
            <td>{event.time || event.timeStr}</td>
            <td style="font-family: monospace;">{event.ip}</td>
            <td>
              <span class="badge" style="border: 1px solid var(--border)">
                {event.faculty?.code || 'Unknown'}
              </span>
            </td>
            <td>{event.type}</td>
            <td>
              <span class="badge {event.severity}">{event.severity.toUpperCase()}</span>
            </td>
          </tr>
        {/each}
        {#if filteredEvents.length === 0}
          <tr>
            <td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">
              ไม่พบข้อมูลการโจมตีจากไอพีภายใน (หรือคณะที่เลือก)
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>
