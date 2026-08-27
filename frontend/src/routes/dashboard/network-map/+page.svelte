<svelte:head>
  <title>Network Map - KKUSIEM</title>
</svelte:head>

<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  import { getFacultyForIP } from '../../../stores/faculties';
  import { isIpInCidr } from '../../../lib/utils/ip';
  // @ts-ignore
  import ipRecordsRaw from '$lib/data/ip_records.json';
  // --- Local State for Editing ---
  let editableRecords = [...ipRecordsRaw].map((r, i) => ({ ...r, _id: i })); 
  
  // We are using it for real now, so Admin is permanently true for this page
  let isAdmin = true; 

  // --- Modal State ---
  let showModal = false;
  let modalMode = 'ADD';
  let formData = { _id: -1, Route: '', 'Faculty/Dept': '', Type: 'LAN', Description: '' };

  // --- Delete Modal State ---
  let showDeleteModal = false;
  let recordToDelete: any = null;

  // --- Filter State ---
  let selectedFacultyCode = 'ALL';
  let searchTopIP = '';
  let searchBottomIP = '';
  let selectedType = 'ALL';
  let activeTab: 'all' | 'faculties' | 'departments' | 'general' = 'all';

  // Extract unique faculties dynamically from the current editableRecords
  $: dynamicFaculties = Array.from(new Set(editableRecords.map((r: any) => r['Faculty/Dept']).filter(Boolean))).map(name => {
    let code = String(name).split('—')[0].trim().toUpperCase();
    if (!code) code = 'UNASSIGNED';
    if (code === 'MS/KKBS') code = 'MS/KKBS';
    return { code, name: String(name) };
  });

  // Map events dynamically
  $: mappedEvents = $eventsStore.map(e => {
    return { ...e, faculty: getFacultyForIP(e.ip) };
  });

  $: filteredEvents = (() => {
    let base = selectedFacultyCode === 'ALL' 
      ? mappedEvents 
      : mappedEvents.filter(e => e.faculty && e.faculty.code === selectedFacultyCode);
    if (searchTopIP) base = base.filter(e => e.ip && e.ip.includes(searchTopIP));
    return base;
  })();

  $: facultyStats = (() => {
    if (selectedFacultyCode !== 'ALL') {
      const f = dynamicFaculties.find(x => x.code === selectedFacultyCode);
      return { total: filteredEvents.length, name: f ? f.name : 'Unknown' };
    }
    return { total: filteredEvents.length, name: 'ทุกคณะ / ส่วนงาน' };
  })();

  // --- Events Pagination ---
  let currentEventPage = 1;
  const eventsPerPage = 10;
  $: totalEventPages = Math.ceil(filteredEvents.length / eventsPerPage) || 1;
  $: { if (currentEventPage > totalEventPages) currentEventPage = Math.max(1, totalEventPages); }
  $: paginatedEvents = filteredEvents.slice((currentEventPage - 1) * eventsPerPage, currentEventPage * eventsPerPage);

  // --- IP Records Filtering & Pagination (using editableRecords) ---
  $: filteredRecords = editableRecords.filter((r: any) => {
    if (!r['Faculty/Dept'] && r['Faculty/Dept'] !== '') return false;
    
    // Search IP/Route
    if (searchBottomIP && (!r.Route || !r.Route.toLowerCase().includes(searchBottomIP.toLowerCase()))) return false;

    // Filter Type
    const rType = r.Type || r.type || 'LAN';
    if (selectedType !== 'ALL' && String(rType).toUpperCase() !== selectedType.toUpperCase()) return false;

    // Filter Faculty Code
    if (selectedFacultyCode !== 'ALL') {
      let rCode = String(r['Faculty/Dept']).split('—')[0].trim().toUpperCase();
      if (!rCode) rCode = 'UNASSIGNED';
      if (rCode !== selectedFacultyCode) return false;
    }
    return true;
  });

  // Separate into tabs
  $: facultyRecords = filteredRecords.filter((r: any) => {
    const name = String(r['Faculty/Dept'] || '');
    return name.includes('คณะ') || name.includes('วิทยาลัย');
  });

  $: generalRecords = filteredRecords.filter((r: any) => {
    const name = String(r['Faculty/Dept'] || '').trim();
    const desc = String(r.Description || '').trim();
    return (!name || name === '—') && (!desc || desc === '—');
  });

  $: deptRecords = filteredRecords.filter((r: any) => {
    const name = String(r['Faculty/Dept'] || '').trim();
    const desc = String(r.Description || '').trim();
    const isFac = name.includes('คณะ') || name.includes('วิทยาลัย');
    const isGen = (!name || name === '—') && (!desc || desc === '—');
    return !isFac && !isGen;
  });

  $: allRecords = filteredRecords;

  let currentAllPage = 1, currentFacPage = 1, currentDeptPage = 1, currentGenPage = 1;
  const ipPerPage = 20;

  // Pagination Logic for Tabs
  $: totalAllPages = Math.ceil(allRecords.length / ipPerPage) || 1;
  $: { if (currentAllPage > totalAllPages) currentAllPage = Math.max(1, totalAllPages); }
  $: paginatedAll = allRecords.slice((currentAllPage - 1) * ipPerPage, currentAllPage * ipPerPage);

  $: totalFacPages = Math.ceil(facultyRecords.length / ipPerPage) || 1;
  $: { if (currentFacPage > totalFacPages) currentFacPage = Math.max(1, totalFacPages); }
  $: paginatedFac = facultyRecords.slice((currentFacPage - 1) * ipPerPage, currentFacPage * ipPerPage);

  $: totalDeptPages = Math.ceil(deptRecords.length / ipPerPage) || 1;
  $: { if (currentDeptPage > totalDeptPages) currentDeptPage = Math.max(1, totalDeptPages); }
  $: paginatedDept = deptRecords.slice((currentDeptPage - 1) * ipPerPage, currentDeptPage * ipPerPage);

  $: totalGenPages = Math.ceil(generalRecords.length / ipPerPage) || 1;
  $: { if (currentGenPage > totalGenPages) currentGenPage = Math.max(1, totalGenPages); }
  $: paginatedGen = generalRecords.slice((currentGenPage - 1) * ipPerPage, currentGenPage * ipPerPage);


  // --- Actions ---
  function hasMatch(cidr: any) {
    if (!cidr || cidr === '0.0.0.0/0') return false;
    return $eventsStore.some(e => isIpInCidr(e.ip, cidr));
  }

  function openAddModal() {
    modalMode = 'ADD';
    formData = { _id: Date.now(), Route: '', 'Faculty/Dept': '', Type: 'LAN', Description: '' };
    showModal = true;
  }

  function openEditModal(record: any) {
    modalMode = 'EDIT';
    formData = { ...record };
    showModal = true;
  }

  function confirmDelete(record: any) {
    recordToDelete = record;
    showDeleteModal = true;
  }

  async function executeDelete() {
    if (!recordToDelete) return;
    editableRecords = editableRecords.filter(r => r._id !== recordToDelete._id);
    showDeleteModal = false;
    recordToDelete = null;
    await persistData();
  }

  let showSuccessPopup = false;
  let successMessage = '';

  async function saveRecord() {
    if (!formData.Route.trim()) { alert('Route/CIDR is required!'); return; }
    
    if (modalMode === 'ADD') {
      // Add to front
      editableRecords = [formData, ...editableRecords];
      successMessage = 'สร้าง IP ใหม่สำเร็จแล้ว';
    } else {
      // Update
      editableRecords = editableRecords.map(r => r._id === formData._id ? formData : r);
      successMessage = 'อัปเดต IP สำเร็จแล้ว';
    }
    showModal = false;
    await persistData();
    
    showSuccessPopup = true;
    setTimeout(() => showSuccessPopup = false, 3000);
  }

  async function persistData() {
    try {
      // Clean up internal _id before saving
      const dataToSave = editableRecords.map(({ _id, ...rest }) => rest);
      await fetch('/api/network-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave)
      });
    } catch (err) {
      console.error('Failed to save network map data', err);
    }
  }


</script>

<style>
  .page-container { padding: 1.5rem; max-width: 1400px; margin: 0 auto; color: var(--text-primary); }
  
  /* Header */
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
  .page-title { font-size: 1.5rem; font-weight: 700; display: flex; align-items: center; gap: 10px; }
  .page-title i { color: var(--accent); }
  
  /* Admin Tools */
  .admin-tools { display: flex; align-items: center; gap: 15px; }
  
  .btn-primary {
    background: var(--accent); color: var(--text-primary); border: none; padding: 8px 16px; border-radius: 6px;
    font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px;
    transition: 0.2s; box-shadow: 0 4px 10px rgba(0,212,255,0.3);
  }
  .btn-primary:hover { filter: brightness(1.2); transform: translateY(-1px); }

  /* Filters */
  .filter-panel { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 20px; display: flex; gap: 20px; align-items: center; flex-wrap: wrap; box-shadow: var(--shadow-sm); }
  .input-group { display: flex; align-items: center; gap: 8px; }
  .input-group label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
  .select-box, .text-box {
    background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-primary);
    padding: 8px 12px; border-radius: 6px; font-size: 13px; outline: none; transition: border 0.2s;
  }
  .select-box:focus, .text-box:focus { border-color: var(--accent); }
  .text-box { width: 220px; }

  /* Tabs */
  .tabs-container { display: flex; gap: 10px; margin-bottom: 15px; border-bottom: 2px solid var(--border); padding-bottom: 10px; }
  .tab-btn {
    background: transparent; border: none; color: var(--text-secondary); font-size: 14px; font-weight: 600;
    padding: 10px 20px; cursor: pointer; border-radius: 8px; transition: 0.2s; display: flex; align-items: center; gap: 8px;
  }
  .tab-btn:hover { background: var(--bg-secondary); color: var(--text-primary); }
  .tab-btn.active { background: rgba(0,212,255,0.15); color: var(--accent); border: 1px solid rgba(0,212,255,0.3); }
  .tab-badge { background: rgba(0,0,0,0.3); padding: 2px 8px; border-radius: 12px; font-size: 11px; }
  .tab-btn.active .tab-badge { background: var(--accent); color: var(--text-primary); }

  /* Table */
  .data-panel { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; padding: 0; box-shadow: var(--shadow-sm); overflow: hidden; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { text-align: left; padding: 14px 16px; border-bottom: 2px solid var(--border); color: var(--text-secondary); font-weight: 700; background: rgba(0,0,0,0.2); text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
  .data-table td { padding: 12px 16px; border-bottom: 1px solid var(--border); color: var(--text-primary); vertical-align: middle; }
  .data-table tr:hover { background: rgba(255,255,255,0.02); }
  
  .mono { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; color: var(--accent); }
  .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: var(--bg-secondary); display: inline-block; border: 1px solid var(--border); }
  .action-btn { background: transparent; border: 1px solid var(--border); color: var(--text-secondary); width: 30px; height: 30px; border-radius: 4px; cursor: pointer; transition: 0.2s; display: inline-flex; align-items: center; justify-content: center; }
  .action-btn:hover { background: var(--bg-secondary); color: var(--text-primary); }
  .action-btn.delete:hover { background: rgba(239,68,68,0.15); color: #ef4444; border-color: rgba(239,68,68,0.4); }
  .action-btn.edit:hover { background: rgba(59,130,246,0.15); color: #3b82f6; border-color: rgba(59,130,246,0.4); }

  /* Columns Widths */
  .ip-table th:nth-child(1) { width: 20%; }
  .ip-table th:nth-child(2) { width: 30%; }
  .ip-table th:nth-child(3) { width: 10%; }
  .ip-table th:nth-child(4) { width: 25%; }
  .ip-table th:nth-child(5) { width: 15%; text-align: right; }

  /* Pagination */
  .pagination { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(0,0,0,0.1); border-top: 1px solid var(--border); }
  .page-btn { cursor: pointer; background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; transition: 0.2s; }
  .page-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .page-btn:not(:disabled):hover { background: var(--accent); color: var(--text-primary); border-color: var(--accent); }

  /* Modal */
  .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; }
  .modal-content { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; width: 450px; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
  .modal-header { font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; }
  .modal-header i { font-size: 20px; color: var(--accent); }
  .modal-close { background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 20px; }
  .modal-close:hover { color: var(--text-primary); }
  
  .form-group { margin-bottom: 15px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
  .form-group input, .form-group select { width: 100%; box-sizing: border-box; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 25px; }
  .btn-cancel { background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border); padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: 0.2s; }
  .btn-cancel:hover { background: rgba(255,255,255,0.1); }
  
  /* Delete Modal Specific */
  .delete-modal-content { width: 400px; text-align: center; padding: 30px 20px; }
  .delete-icon-wrap { width: 60px; height: 60px; border-radius: 50%; background: rgba(239,68,68,0.1); color: #ef4444; font-size: 30px; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px; border: 1px solid rgba(239,68,68,0.3); }
  .delete-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 10px; }
  .delete-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 25px; }
  .delete-target { display: inline-block; background: rgba(0,0,0,0.3); padding: 6px 12px; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 14px; color: #ef4444; border: 1px dashed rgba(239,68,68,0.4); margin-top: 8px; }
  .btn-danger { background: #ef4444; color: #fff; border: none; padding: 8px 20px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s; box-shadow: 0 4px 10px rgba(239,68,68,0.3); }
  .btn-danger:hover { filter: brightness(1.1); transform: translateY(-1px); }
</style>

<div class="page-container">
  
  <div class="page-header">
    <div class="page-title"><i class="ti ti-network"></i> Network Map Database</div>
    <div class="admin-tools">
      <button class="btn-primary" on:click={openAddModal}>
        <i class="ti ti-plus"></i> เพิ่ม IP ใหม่
      </button>
    </div>
  </div>

  <!-- Master Filters -->
  <div class="filter-panel">
    <div class="input-group">
      <label><i class="ti ti-search"></i> Search Route/IP</label>
      <input type="text" placeholder="e.g. 192.168.1.0/24..." bind:value={searchBottomIP} class="text-box">
    </div>
    
    <div class="input-group">
      <label><i class="ti ti-school"></i> Filter by Faculty</label>
      <select class="select-box" bind:value={selectedFacultyCode} style="width: 250px;">
        <option value="ALL">-- All Faculties / Departments --</option>
        {#each dynamicFaculties as fac}
          <option value={fac.code}>{fac.code === 'UNASSIGNED' ? 'General / Unassigned' : `[${fac.code}] ${fac.name}`}</option>
        {/each}
      </select>
    </div>

    <div class="input-group">
      <label><i class="ti ti-tag"></i> Type</label>
      <div style="display:flex; gap:6px;">
        {#each ['ALL', 'LAN', 'WiFi', 'Server', 'FTTX', 'Eduroam'] as t}
          <button on:click={() => selectedType = t} 
                  class="badge" 
                  style="cursor:pointer; transition:0.2s; {selectedType === t ? 'background:var(--accent); color: var(--text-primary); border-color:var(--accent);' : ''}">
            {t}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="tabs-container">
    <button class="tab-btn {activeTab === 'all' ? 'active' : ''}" on:click={() => {activeTab = 'all'; currentAllPage = 1;}}>
      <i class="ti ti-list"></i> All
      <span class="tab-badge">{allRecords.length}</span>
    </button>
    <button class="tab-btn {activeTab === 'faculties' ? 'active' : ''}" on:click={() => {activeTab = 'faculties'; currentFacPage = 1;}}>
      <i class="ti ti-building-community"></i> Faculties
      <span class="tab-badge">{facultyRecords.length}</span>
    </button>
    <button class="tab-btn {activeTab === 'departments' ? 'active' : ''}" on:click={() => {activeTab = 'departments'; currentDeptPage = 1;}}>
      <i class="ti ti-briefcase"></i> Departments
      <span class="tab-badge">{deptRecords.length}</span>
    </button>
    <button class="tab-btn {activeTab === 'general' ? 'active' : ''}" on:click={() => {activeTab = 'general'; currentGenPage = 1;}}>
      <i class="ti ti-server-cog"></i> General / Infra
      <span class="tab-badge">{generalRecords.length}</span>
    </button>
  </div>

  <!-- Dynamic Table Rendering based on Tab -->
  <div class="data-panel">
    <table class="data-table ip-table">
      <thead>
        <tr>
          <th>Route / CIDR</th>
          <th>Entity Name</th>
          <th>Connection Type</th>
          <th>Description / Node</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <!-- Select correct array based on active tab -->
        {#each (activeTab === 'all' ? paginatedAll : activeTab === 'faculties' ? paginatedFac : activeTab === 'departments' ? paginatedDept : paginatedGen) as record (record._id)}
          <tr>
            <td class="mono">{record.Route}</td>
            <td>
              {#if (activeTab === 'general' || activeTab === 'all') && (!record['Faculty/Dept'] || record['Faculty/Dept'] === '—')}
                <span style="color:var(--text-muted); font-style:italic;">Unassigned</span>
              {:else}
                {record['Faculty/Dept']}
              {/if}
            </td>
            <td><span class="badge">{record.Type || record.type || '-'}</span></td>
            <td style="color:var(--text-secondary); max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title={record.Description}>
              {record.Description === '—' || !record.Description ? '-' : record.Description}
            </td>
            <td>
              <div style="display:flex; gap:6px; justify-content:flex-end; align-items:center;">
                {#if hasMatch(record.Route)}
                  <a href="/dashboard/investigate?ip={record.Route.split('/')[0].split('.').slice(0,3).join('.')}" 
                     class="badge" style="background:rgba(239,68,68,0.15); color:#ef4444; border-color:#ef4444; text-decoration:none; margin-right:8px;">
                    <i class="ti ti-target"></i> ALERT
                  </a>
                {/if}
                
                {#if isAdmin}
                  <button class="action-btn edit" on:click={() => openEditModal(record)} title="Edit">
                    <i class="ti ti-pencil"></i>
                  </button>
                  <button class="action-btn delete" on:click={() => confirmDelete(record)} title="Delete">
                    <i class="ti ti-trash"></i>
                  </button>
                {:else}
                  <span style="font-size:11px; color:var(--text-muted);"><i class="ti ti-lock"></i> Read Only</span>
                {/if}
              </div>
            </td>
          </tr>
        {/each}
        {#if (activeTab === 'all' && allRecords.length === 0) || (activeTab === 'faculties' && facultyRecords.length === 0) || (activeTab === 'departments' && deptRecords.length === 0) || (activeTab === 'general' && generalRecords.length === 0)}
          <tr>
            <td colspan="5" style="text-align: center; padding: 40px; color: var(--text-muted);">
              <i class="ti ti-box-off" style="font-size: 32px; display: block; margin-bottom: 10px;"></i>
              No records found matching current filters.
            </td>
          </tr>
        {/if}
      </tbody>
    </table>

    <!-- Generic Pagination Footer -->
    {#if activeTab === 'all' && allRecords.length > 0}
      <div class="pagination">
        <div style="font-size:12px; color:var(--text-muted);">Showing {paginatedAll.length} of {allRecords.length} records</div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="page-btn" on:click={() => { if(currentAllPage > 1) currentAllPage--; }} disabled={currentAllPage === 1}>Prev</button>
          <span style="font-size:12px; font-weight:600; padding:0 8px;">Page {currentAllPage} of {totalAllPages}</span>
          <button class="page-btn" on:click={() => { if(currentAllPage < totalAllPages) currentAllPage++; }} disabled={currentAllPage === totalAllPages}>Next</button>
        </div>
      </div>
    {:else if activeTab === 'faculties' && facultyRecords.length > 0}
      <div class="pagination">
        <div style="font-size:12px; color:var(--text-muted);">Showing {paginatedFac.length} of {facultyRecords.length} records</div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="page-btn" on:click={() => { if(currentFacPage > 1) currentFacPage--; }} disabled={currentFacPage === 1}>Prev</button>
          <span style="font-size:12px; font-weight:600; padding:0 8px;">Page {currentFacPage} of {totalFacPages}</span>
          <button class="page-btn" on:click={() => { if(currentFacPage < totalFacPages) currentFacPage++; }} disabled={currentFacPage === totalFacPages}>Next</button>
        </div>
      </div>
    {:else if activeTab === 'departments' && deptRecords.length > 0}
      <div class="pagination">
        <div style="font-size:12px; color:var(--text-muted);">Showing {paginatedDept.length} of {deptRecords.length} records</div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="page-btn" on:click={() => { if(currentDeptPage > 1) currentDeptPage--; }} disabled={currentDeptPage === 1}>Prev</button>
          <span style="font-size:12px; font-weight:600; padding:0 8px;">Page {currentDeptPage} of {totalDeptPages}</span>
          <button class="page-btn" on:click={() => { if(currentDeptPage < totalDeptPages) currentDeptPage++; }} disabled={currentDeptPage === totalDeptPages}>Next</button>
        </div>
      </div>
    {:else if activeTab === 'general' && generalRecords.length > 0}
      <div class="pagination">
        <div style="font-size:12px; color:var(--text-muted);">Showing {paginatedGen.length} of {generalRecords.length} records</div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="page-btn" on:click={() => { if(currentGenPage > 1) currentGenPage--; }} disabled={currentGenPage === 1}>Prev</button>
          <span style="font-size:12px; font-weight:600; padding:0 8px;">Page {currentGenPage} of {totalGenPages}</span>
          <button class="page-btn" on:click={() => { if(currentGenPage < totalGenPages) currentGenPage++; }} disabled={currentGenPage === totalGenPages}>Next</button>
        </div>
      </div>
    {/if}
  </div>

</div>

<!-- Admin Modal (Add/Edit) -->
{#if showModal}
  <div class="modal-overlay">
    <div class="modal-content">
      <div class="modal-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <i class={modalMode === 'ADD' ? 'ti ti-plus' : 'ti ti-pencil'}></i> 
          {modalMode === 'ADD' ? 'Add New Route' : 'Edit Route'}
        </div>
        <button class="modal-close" on:click={() => showModal = false}><i class="ti ti-x"></i></button>
      </div>

      <div class="form-group">
        <label>IP Route / CIDR <span style="color:#ef4444">*</span></label>
        <input type="text" bind:value={formData.Route} placeholder="e.g. 10.0.0.0/24" class="text-box" style="font-family:'JetBrains Mono'; font-size:14px;">
      </div>

      <div class="form-group">
        <label>Entity Name (Faculty/Dept)</label>
        <input type="text" bind:value={formData['Faculty/Dept']} placeholder="e.g. คณะวิทยาศาสตร์" class="text-box">
      </div>

      <div class="form-group" style="display:flex; gap:15px;">
        <div style="flex:1;">
          <label>Connection Type</label>
          <select bind:value={formData.Type} class="select-box">
            <option value="LAN">LAN</option>
            <option value="WiFi">WiFi</option>
            <option value="Server">Server</option>
            <option value="FTTX">FTTX</option>
            <option value="Eduroam">Eduroam</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label>Description (Optional)</label>
        <input type="text" bind:value={formData.Description} placeholder="e.g. อาคาร A ชั้น 2" class="text-box">
      </div>

      <div class="modal-actions">
        <button class="btn-cancel" on:click={() => showModal = false}>Cancel</button>
        <button class="btn-primary" on:click={saveRecord}><i class="ti ti-device-floppy"></i> Save Record</button>
      </div>
    </div>
  </div>
{/if}

<!-- Custom Delete Modal -->
{#if showDeleteModal && recordToDelete}
  <div class="modal-overlay" on:click={() => showDeleteModal = false}>
    <div class="modal-content delete-modal-content" on:click|stopPropagation>
      <div class="delete-icon-wrap">
        <i class="ti ti-alert-triangle"></i>
      </div>
      <div class="delete-title">Delete IP Route</div>
      <div class="delete-desc">
        Are you sure you want to permanently delete this route? This action cannot be undone.
        <br>
        <span class="delete-target">{recordToDelete.Route}</span>
      </div>
      
      <div style="display: flex; justify-content: center; gap: 12px; margin-top: 10px;">
        <button class="btn-cancel" on:click={() => showDeleteModal = false}>Cancel</button>
        <button class="btn-danger" on:click={executeDelete}><i class="ti ti-trash"></i> Yes, Delete</button>
      </div>
    </div>
  </div>
{/if}

<!-- Success Popup Toast -->
{#if showSuccessPopup}
  <div style="position: fixed; bottom: 24px; right: 24px; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 10px; z-index: 9999; animation: slideIn 0.3s ease-out;">
    <i class="ti ti-circle-check" style="font-size: 20px;"></i>
    <span style="font-weight: 600; font-size: 14px;">{successMessage}</span>
  </div>
  <style>
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  </style>
{/if}
