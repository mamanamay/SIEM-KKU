<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  import { getFacultyForIP } from '../../../stores/faculties';
  import { isIpInCidr } from '../../../lib/utils/ip';
  // @ts-ignore
  import ipRecordsRaw from '$lib/data/ip_records.json';

  let selectedFacultyCode = 'ALL';

  // Extract unique faculties from JSON dynamically
  const dynamicFaculties = Array.from(new Set(ipRecordsRaw.map((r: any) => r['Faculty/Dept']).filter(Boolean))).map(name => {
    let code = String(name).split('—')[0].trim().toUpperCase();
    if (!code) code = 'UNASSIGNED';
    if (code === 'MS/KKBS') code = 'MS/KKBS';
    return { code, name: String(name) };
  });

  // Map events dynamically using the new CIDR logic
  $: mappedEvents = $eventsStore.map(e => {
    return { ...e, faculty: getFacultyForIP(e.ip) };
  });

  let searchTopIP = '';
  let searchBottomIP = '';

  $: filteredEvents = (() => {
    let base = selectedFacultyCode === 'ALL' 
      ? mappedEvents 
      : mappedEvents.filter(e => e.faculty && e.faculty.code === selectedFacultyCode);
    
    if (searchTopIP) {
      base = base.filter(e => e.ip && e.ip.includes(searchTopIP));
    }
    return base;
  })();

  $: facultyStats = (() => {
    if (selectedFacultyCode !== 'ALL') {
      const f = dynamicFaculties.find(x => x.code === selectedFacultyCode);
      return { total: filteredEvents.length, name: f ? f.name : 'Unknown' };
    }
    return { total: filteredEvents.length, name: 'ทุกคณะ / ส่วนงาน' };
  })();

  // --- Events Pagination (30 rows limit) ---
  let currentEventPage = 1;
  const eventsPerPage = 30;
  $: totalEventPages = Math.ceil(filteredEvents.length / eventsPerPage) || 1;
  $: {
    if (currentEventPage > totalEventPages) currentEventPage = Math.max(1, totalEventPages);
  }
  $: paginatedEvents = filteredEvents.slice((currentEventPage - 1) * eventsPerPage, currentEventPage * eventsPerPage);

  function prevEventPage() { if (currentEventPage > 1) currentEventPage--; }
  function nextEventPage() { if (currentEventPage < totalEventPages) currentEventPage++; }

  // --- IP Records Filtering & Pagination ---
  let selectedType = 'ALL';
  let activeTab: 'faculties' | 'departments' | 'general' = 'faculties';
  $: filteredRecords = ipRecordsRaw.filter((r: any) => {
    if (!r['Faculty/Dept']) return false;

    if (searchBottomIP && (!r.Route || !r.Route.includes(searchBottomIP))) return false;

    const rType = r.Type || r.type || 'LAN';
    if (selectedType !== 'ALL' && String(rType).toUpperCase() !== selectedType.toUpperCase()) return false;

    if (selectedFacultyCode !== 'ALL') {
      let rCode = String(r['Faculty/Dept']).split('—')[0].trim().toUpperCase();
      if (!rCode) rCode = 'UNASSIGNED';
      if (rCode !== selectedFacultyCode) return false;
    }
    return true;
  });

  // Separate into Faculties vs Departments vs General
  $: facultyRecords = filteredRecords.filter((r: any) => {
    const name = String(r['Faculty/Dept'] || '');
    return name.includes('คณะ') || name.includes('วิทยาลัย');
  });

  $: generalRecords = filteredRecords.filter((r: any) => {
    const name = String(r['Faculty/Dept'] || '').trim();
    const desc = String(r.Description || '').trim();
    const noName = name === '' || name === '—' || name === 'NaN' || name === 'undefined';
    const noDesc = desc === '' || desc === '—' || desc === 'NaN' || desc === 'undefined';
    return noName && noDesc;
  });

  $: deptRecords = filteredRecords.filter((r: any) => {
    const name = String(r['Faculty/Dept'] || '').trim();
    const desc = String(r.Description || '').trim();
    const isFac = name.includes('คณะ') || name.includes('วิทยาลัย');
    const noName = name === '' || name === '—' || name === 'NaN' || name === 'undefined';
    const noDesc = desc === '' || desc === '—' || desc === 'NaN' || desc === 'undefined';
    const isGen = noName && noDesc;
    return !isFac && !isGen;
  });

  // Pagination Variables (30 rows limit)
  let currentFacPage = 1;
  let currentDeptPage = 1;
  let currentGenPage = 1;
  const ipPerPage = 30;

  // Faculties Pagination
  $: totalFacPages = Math.ceil(facultyRecords.length / ipPerPage) || 1;
  $: { if (currentFacPage > totalFacPages) currentFacPage = Math.max(1, totalFacPages); }
  $: paginatedFac = facultyRecords.slice((currentFacPage - 1) * ipPerPage, currentFacPage * ipPerPage);
  function prevFacPage() { if (currentFacPage > 1) currentFacPage--; }
  function nextFacPage() { if (currentFacPage < totalFacPages) currentFacPage++; }

  // Departments Pagination
  $: totalDeptPages = Math.ceil(deptRecords.length / ipPerPage) || 1;
  $: { if (currentDeptPage > totalDeptPages) currentDeptPage = Math.max(1, totalDeptPages); }
  $: paginatedDept = deptRecords.slice((currentDeptPage - 1) * ipPerPage, currentDeptPage * ipPerPage);
  function prevDeptPage() { if (currentDeptPage > 1) currentDeptPage--; }
  function nextDeptPage() { if (currentDeptPage < totalDeptPages) currentDeptPage++; }

  // General Pagination
  $: totalGenPages = Math.ceil(generalRecords.length / ipPerPage) || 1;
  $: { if (currentGenPage > totalGenPages) currentGenPage = Math.max(1, totalGenPages); }
  $: paginatedGen = generalRecords.slice((currentGenPage - 1) * ipPerPage, currentGenPage * ipPerPage);
  function prevGenPage() { if (currentGenPage > 1) currentGenPage--; }
  function nextGenPage() { if (currentGenPage < totalGenPages) currentGenPage++; }

  function hasMatch(cidr: any) {
    if (!cidr || cidr === '0.0.0.0/0') return false;
    return $eventsStore.some(e => isIpInCidr(e.ip, cidr));
  }
</script>

<style>
  .page-container {
    padding: 1.5rem;
    max-width: 1400px;
    margin: 0 auto;
    font-family: 'Inter', sans-serif;
  }
  .page-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .subsection-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.8rem;
    margin-top: 1.5rem;
    border-left: 4px solid var(--accent);
    padding-left: 10px;
    background: var(--bg-panel);
    padding: 8px 12px;
    border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
  .filter-panel {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
    display: flex;
    gap: 15px;
    align-items: center;
    box-shadow: var(--shadow-sm);
  }
  .select-box {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    color: var(--text-primary);
    padding: 8px 12px;
    border-radius: var(--radius-md);
    outline: none;
    font-size: 13px;
    min-width: 250px;
  }
  
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.5rem;
    margin-bottom: 2rem;
  }
  .metric-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    position: relative;
    box-shadow: var(--shadow-sm);
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
    padding: 12px 10px;
    border-bottom: 2px solid var(--border);
    color: var(--text-secondary);
    font-weight: 600;
    background: var(--bg-secondary);
  }
  .data-table td {
    padding: 10px;
    border-bottom: 1px solid var(--border);
    color: var(--text-primary);
  }
  .data-table tr:hover {
    background: var(--bg-secondary);
  }
  .ip-table th:nth-child(1) { width: 22%; }
  .ip-table th:nth-child(2) { width: 35%; }
  .ip-table th:nth-child(3) { width: 10%; }
  .ip-table th:nth-child(4) { width: 23%; }
  .ip-table th:nth-child(5) { width: 10%; text-align: right; }

  .tabs-container {
    display: flex;
    gap: 12px;
    margin-bottom: 1.5rem;
    border-bottom: 2px solid var(--border);
    padding-bottom: 8px;
  }
  .tab-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 600;
    padding: 8px 16px;
    cursor: pointer;
    border-radius: 8px;
    transition: 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tab-btn:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }
  .tab-btn.active {
    background: var(--accent);
    color: #fff;
  }
  .tab-badge {
    background: rgba(0,0,0,0.2);
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 700;
  }
  .tab-btn.active .tab-badge {
    background: rgba(255,255,255,0.25);
  }
  .badge {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: var(--bg-secondary);
    display: inline-block;
  }
  .badge.critical { background: var(--red-bg); color: var(--red); }
  .badge.high { background: var(--orange-bg); color: var(--orange); }

  .pagination-container {
    display: flex; 
    justify-content: space-between; 
    align-items: center; 
    margin-top: 1rem; 
    padding-top: 1rem; 
    border-top: 1px solid var(--border);
  }
  .page-btn {
    cursor: pointer;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    color: var(--text-primary);
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    transition: 0.2s;
  }
  .page-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  .page-btn:not(:disabled):hover {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
</style>

<div class="page-container">
  <div class="page-title">
    <i class="ti ti-building"></i> Internal Threats Monitor (Faculty)
  </div>

  <div class="filter-panel" style="display:flex; flex-wrap:wrap; gap:15px; align-items:center;">
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="font-size: 13px; font-weight: 500;"><i class="ti ti-search"></i> ค้นหาไอพี:</span>
      <input type="text" placeholder="ระบุ IP..." bind:value={searchTopIP} class="select-box" style="width: 180px; min-width:unset; padding:6px 10px;">
    </div>
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="font-size: 13px; font-weight: 500;"><i class="ti ti-school"></i> เลือกคณะ / ส่วนงาน:</span>
      <select class="select-box" bind:value={selectedFacultyCode} style="min-width: unset; padding:6px 10px;">
        <option value="ALL">-- ดูทุกคณะ / ทุกหน่วยงาน (ALL) --</option>
        {#each dynamicFaculties as fac}
          <option value={fac.code}>{fac.code === 'UNASSIGNED' ? '[ทั่วไป] ส่วนกลาง / ไม่ระบุสังกัด' : `[${fac.code}] ${fac.name}`}</option>
        {/each}
      </select>
    </div>
    <div style="flex-grow: 1;"></div>

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

  <!-- SECTION: Attacks Found -->
  <div class="section-title" style="margin-top: 2.5rem;">
    <i class="ti ti-target" style="color: var(--red)"></i> พบเจอการโจมตี (Attacks Found)
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
        {#each paginatedEvents as event}
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
        {#if paginatedEvents.length === 0}
          <tr>
            <td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">
              ไม่พบข้อมูลการโจมตีจากไอพีภายใน (หรือคณะที่เลือก)
            </td>
          </tr>
        {/if}
      </tbody>
    </table>

    <!-- Pagination for Attacks Found -->
    {#if filteredEvents.length > 0}
      <div class="pagination-container">
        <div style="font-size:12px; color:var(--text-muted);">Showing {paginatedEvents.length} of {filteredEvents.length} events</div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="page-btn" on:click={prevEventPage} disabled={currentEventPage === 1}>Prev</button>
          <span style="font-size:12px; font-weight:600; padding:0 8px;">Page {currentEventPage} of {totalEventPages}</span>
          <button class="page-btn" on:click={nextEventPage} disabled={currentEventPage === totalEventPages}>Next</button>
        </div>
      </div>
    {/if}
  </div>

  <!-- SECTION: IP Database -->
  <div class="section-title" style="margin-top: 3rem;">
    <i class="ti ti-map-2" style="color: var(--accent)"></i> ไอพีที่มีอยู่ในระบบ (System IP Records)
  </div>
  
  <div class="data-panel" style="padding-bottom: 0.5rem; margin-bottom: 1rem;">
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size: 13px; font-weight: 500;"><i class="ti ti-search"></i> ค้นหาจากไอพี:</span>
        <input type="text" placeholder="ระบุ IP หรือ CIDR..." bind:value={searchBottomIP} class="select-box" style="width: 180px; min-width:unset; padding:6px 10px;">
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <span style="font-size:12px; font-weight:600; color:var(--text-muted);">TYPE:</span>
        {#each ['ALL', 'LAN', 'WiFi', 'Server', 'FTTX', 'Eduroam'] as t}
          <button on:click={() => { selectedType = t; currentFacPage = 1; currentDeptPage = 1; }} 
                  style="background:{selectedType === t ? 'var(--green)' : 'var(--bg-secondary)'}; 
                         color:{selectedType === t ? '#000' : 'var(--text-primary)'}; 
                         padding:4px 10px; border-radius:6px; 
                         border:1px solid {selectedType === t ? 'var(--green)' : 'var(--border)'}; 
                         font-size:11px; cursor:pointer;">
            {t}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Tabs UI -->
  <div class="tabs-container">
    <button class="tab-btn {activeTab === 'faculties' ? 'active' : ''}" on:click={() => activeTab = 'faculties'}>
      <i class="ti ti-school"></i> กลุ่มคณะ / วิทยาลัย (Faculties)
      <span class="tab-badge">{facultyRecords.length}</span>
    </button>
    <button class="tab-btn {activeTab === 'departments' ? 'active' : ''}" on:click={() => activeTab = 'departments'}>
      <i class="ti ti-briefcase"></i> หน่วยงาน (Departments)
      <span class="tab-badge">{deptRecords.length}</span>
    </button>
    <button class="tab-btn {activeTab === 'general' ? 'active' : ''}" on:click={() => activeTab = 'general'}>
      <i class="ti ti-apps"></i> ทั่วไป (General)
      <span class="tab-badge">{generalRecords.length}</span>
    </button>
  </div>

  <!-- Faculties Table -->
  {#if activeTab === 'faculties'}
    <div class="data-panel">
      {#if facultyRecords.length > 0}
        <table class="data-table ip-table">
          <thead>
            <tr>
              <th>IP Range / CIDR</th>
              <th>Faculty Name</th>
              <th>Type</th>
              <th>Description</th>
              <th style="text-align:right;">Action</th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedFac as conf}
              <tr>
                <td style="font-family: monospace; font-weight:600; color:var(--accent);">{conf.Route}</td>
                <td>{conf['Faculty/Dept']}</td>
                <td><span class="badge" style="border: 1px solid var(--border)">{conf.Type || conf.type || '-'}</span></td>
                <td style="color:var(--text-secondary); max-width:250px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title={conf.Description}>{conf.Description || '-'}</td>
                <td style="text-align:right;">
                  {#if hasMatch(conf.Route)}
                    <a href="/dashboard/investigate?ip={conf.Route.split('/')[0].split('.').slice(0,3).join('.')}" class="badge" style="background:var(--red-bg); color:var(--red); border:1px solid var(--red); text-decoration:none;">
                      <i class="ti ti-target"></i> Investigate
                    </a>
                  {:else}
                    <span style="font-size:11px; color:var(--text-muted);"><i class="ti ti-check"></i> Safe</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>

        <div class="pagination-container">
          <div style="font-size:12px; color:var(--text-muted);">Showing {paginatedFac.length} of {facultyRecords.length} records</div>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="page-btn" on:click={prevFacPage} disabled={currentFacPage === 1}>Prev</button>
            <span style="font-size:12px; font-weight:600; padding:0 8px;">Page {currentFacPage} of {totalFacPages}</span>
            <button class="page-btn" on:click={nextFacPage} disabled={currentFacPage === totalFacPages}>Next</button>
          </div>
        </div>
      {:else}
        <div style="text-align: center; color: var(--text-muted); padding: 3rem;">
           ไม่พบข้อมูลกลุ่มคณะที่ตรงกับตัวกรอง
        </div>
      {/if}
    </div>
  {/if}

  <!-- Departments Table -->
  {#if activeTab === 'departments'}
    <div class="data-panel">
      {#if deptRecords.length > 0}
        <table class="data-table ip-table">
          <thead>
            <tr>
              <th>IP Range / CIDR</th>
              <th>Department Name</th>
              <th>Type</th>
              <th>Description</th>
              <th style="text-align:right;">Action</th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedDept as conf}
              <tr>
                <td style="font-family: monospace; font-weight:600; color:var(--accent);">{conf.Route}</td>
                <td>{conf['Faculty/Dept']}</td>
                <td><span class="badge" style="border: 1px solid var(--border)">{conf.Type || conf.type || '-'}</span></td>
                <td style="color:var(--text-secondary); max-width:250px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title={conf.Description}>{conf.Description || '-'}</td>
                <td style="text-align:right;">
                  {#if hasMatch(conf.Route)}
                    <a href="/dashboard/investigate?ip={conf.Route.split('/')[0].split('.').slice(0,3).join('.')}" class="badge" style="background:var(--red-bg); color:var(--red); border:1px solid var(--red); text-decoration:none;">
                      <i class="ti ti-target"></i> Investigate
                    </a>
                  {:else}
                    <span style="font-size:11px; color:var(--text-muted);"><i class="ti ti-check"></i> Safe</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>

        <div class="pagination-container">
          <div style="font-size:12px; color:var(--text-muted);">Showing {paginatedDept.length} of {deptRecords.length} records</div>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="page-btn" on:click={prevDeptPage} disabled={currentDeptPage === 1}>Prev</button>
            <span style="font-size:12px; font-weight:600; padding:0 8px;">Page {currentDeptPage} of {totalDeptPages}</span>
            <button class="page-btn" on:click={nextDeptPage} disabled={currentDeptPage === totalDeptPages}>Next</button>
          </div>
        </div>
      {:else}
        <div style="text-align: center; color: var(--text-muted); padding: 3rem;">
           ไม่พบข้อมูลหน่วยงานที่ตรงกับตัวกรอง
        </div>
      {/if}
    </div>
  {/if}

  <!-- General Table -->
  {#if activeTab === 'general'}
    <div class="data-panel">
      {#if generalRecords.length > 0}
        <table class="data-table ip-table">
          <thead>
            <tr>
              <th>IP Range / CIDR</th>
              <th>Faculty Name</th>
              <th>Type</th>
              <th>Description</th>
              <th style="text-align:right;">Action</th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedGen as conf}
              <tr>
                <td style="font-family: monospace; font-weight:600; color:var(--accent);">{conf.Route}</td>
                <td><span style="color:var(--text-muted);font-style:italic;">ไม่ระบุชื่อ (-/—)</span></td>
                <td><span class="badge" style="border: 1px solid var(--border)">{conf.Type || conf.type || '-'}</span></td>
                <td style="color:var(--text-secondary); max-width:250px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title={conf.Description}>{conf.Description === '—' || !conf.Description ? '-' : conf.Description}</td>
                <td style="text-align:right;">
                  {#if hasMatch(conf.Route)}
                    <a href="/dashboard/investigate?ip={conf.Route.split('/')[0].split('.').slice(0,3).join('.')}" class="badge" style="background:var(--red-bg); color:var(--red); border:1px solid var(--red); text-decoration:none;">
                      <i class="ti ti-target"></i> Investigate
                    </a>
                  {:else}
                    <span style="font-size:11px; color:var(--text-muted);"><i class="ti ti-check"></i> Safe</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>

        <div class="pagination-container">
          <div style="font-size:12px; color:var(--text-muted);">Showing {paginatedGen.length} of {generalRecords.length} records</div>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="page-btn" on:click={prevGenPage} disabled={currentGenPage === 1}>Prev</button>
            <span style="font-size:12px; font-weight:600; padding:0 8px;">Page {currentGenPage} of {totalGenPages}</span>
            <button class="page-btn" on:click={nextGenPage} disabled={currentGenPage === totalGenPages}>Next</button>
          </div>
        </div>
      {:else}
        <div style="text-align: center; color: var(--text-muted); padding: 3rem;">
           ไม่พบข้อมูลไอพีกลุ่มทั่วไป
        </div>
      {/if}
    </div>
  {/if}
</div>
