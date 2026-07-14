<script lang="ts">
  import { onMount } from 'svelte';
  import { roleStore } from '../../../stores/events';

  let activeTab = 'users';
  
  // === User Management State ===
  let users: any[] = [];
  let newUsername = '';
  let newPassword = '';
  let newRole = 'guest';
  let userMsg = '';
  let userErr = '';
  let userLoading = false;

  // === Login Audit State ===
  let sessions: any[] = [];
  let sessionLoading = true;
  let currentPage = 1;
  const itemsPerPage = 20;
  let sessionFilter = '';

  // === System Config State ===
  let sessionTimeout = 60;
  let enableToastNotify = true;
  let enableSoundAlert = false;
  let configSaved = false;

  onMount(() => {
    if ($roleStore !== 'admin') return;
    loadUsers();
    loadSessions();
    loadConfig();
  });

  // ---------- User Management ----------
  async function loadUsers() {
    userLoading = true;
    try {
      const res = await fetch('/api/auth/users');
      if (res.ok) users = await res.json();
    } catch(e) {}
    userLoading = false;
  }

  async function createUser() {
    userMsg = ''; userErr = '';
    if (!newUsername.trim() || !newPassword.trim()) { userErr = 'กรุณากรอก Username และ Password'; return; }
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole })
      });
      const data = await res.json();
      if (res.ok) {
        userMsg = `✓ สร้างบัญชี "${newUsername}" สำเร็จ`;
        newUsername = ''; newPassword = ''; newRole = 'guest';
        await loadUsers();
      } else {
        userErr = data.message || 'เกิดข้อผิดพลาด';
      }
    } catch(e) { userErr = 'Network error'; }
  }

  async function deleteUser(username: string) {
    if (!confirm(`ยืนยันการลบบัญชี "${username}" ?`)) return;
    try {
      const res = await fetch(`/api/auth/users/${username}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) { await loadUsers(); }
      else { alert(data.message || 'ไม่สามารถลบได้'); }
    } catch(e) { alert('Network error'); }
  }

  // ---------- Login Audit ----------
  async function loadSessions() {
    sessionLoading = true;
    try {
      const res = await fetch('/api/auth/sessions');
      if (res.ok) sessions = await res.json();
    } catch(e) {}
    sessionLoading = false;
    currentPage = 1;
  }

  $: filteredSessions = sessions.filter(s =>
    !sessionFilter || s.username.toLowerCase().includes(sessionFilter.toLowerCase()) || s.ipAddress?.includes(sessionFilter)
  );
  $: totalPages = Math.max(1, Math.ceil(filteredSessions.length / itemsPerPage));
  $: {
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
  }
  $: pagedSessions = filteredSessions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // ---------- System Config ----------
  function loadConfig() {
    sessionTimeout = parseInt(localStorage.getItem('cfg_session_timeout') || '60');
    enableToastNotify = localStorage.getItem('cfg_toast') !== 'false';
    enableSoundAlert = localStorage.getItem('cfg_sound') === 'true';
  }
  function saveConfig() {
    localStorage.setItem('cfg_session_timeout', sessionTimeout.toString());
    localStorage.setItem('cfg_toast', enableToastNotify.toString());
    localStorage.setItem('cfg_sound', enableSoundAlert.toString());
    configSaved = true;
    setTimeout(() => configSaved = false, 3000);
  }

  const tabs = [
    { id: 'users',  label: 'User Management', icon: 'ti-users' },
    { id: 'audit',  label: 'Login Audit',      icon: 'ti-history' },
    { id: 'config', label: 'System Config',    icon: 'ti-adjustments' },
    { id: 'about',  label: 'About System',     icon: 'ti-info-circle' },
  ];
</script>

<svelte:head>
  <title>Settings - KKUSIEM Command Center</title>
</svelte:head>

<div class="ds-page">
  <!-- Page Header -->
  <div class="ds-page-header">
    <div>
      <h1 class="ds-page-title"><i class="ti ti-settings"></i> System Settings</h1>
      <div class="ds-page-subtitle">Administration panel — accessible by Admin only</div>
    </div>
  </div>

  {#if $roleStore !== 'admin'}
    <div class="ds-card" style="text-align:center; padding: 5rem 2rem;">
      <i class="ti ti-lock" style="font-size:3.5rem; color: var(--red); display:block; margin-bottom:1rem;"></i>
      <div style="font-size:1.2rem; font-weight:700; color:var(--red); margin-bottom:.5rem;">Access Denied</div>
      <div style="color:var(--text-muted); font-size:13px;">You do not have permission to view System Settings.</div>
    </div>
  {:else}
    <!-- Tab Navigation -->
    <div class="tab-nav">
      {#each tabs as tab}
        <button
          class="tab-btn {activeTab === tab.id ? 'active' : ''}"
          on:click={() => activeTab = tab.id}
        >
          <i class="ti {tab.icon}"></i>
          <span>{tab.label}</span>
        </button>
      {/each}
    </div>

    <!-- ═══════════════════ TAB: User Management ═══════════════════ -->
    {#if activeTab === 'users'}
      <div class="two-col">
        <!-- Create Form -->
        <div class="ds-card">
          <div class="ds-card-head">
            <div class="ds-card-title"><i class="ti ti-user-plus"></i> Create New Account</div>
          </div>
          {#if userMsg}<div class="msg success">{userMsg}</div>{/if}
          {#if userErr}<div class="msg error">{userErr}</div>{/if}
          <form on:submit|preventDefault={createUser} class="form-stack">
            <div class="field">
              <label>Username</label>
              <input type="text" bind:value={newUsername} placeholder="e.g. john.doe" class="input-field" />
            </div>
            <div class="field">
              <label>Password</label>
              <input type="password" bind:value={newPassword} placeholder="Min 6 characters" class="input-field" />
            </div>
            <div class="field">
              <label>Role</label>
              <select bind:value={newRole} class="ds-select">
                <option value="guest">🔵 Guest — View Only</option>
                <option value="admin">🔴 Admin — Full Access</option>
              </select>
            </div>
            <div class="role-hint {newRole}">
              {#if newRole === 'admin'}
                <i class="ti ti-shield-check"></i> Admin สามารถเข้าถึงทุกเมนูและจัดการบัญชีได้
              {:else}
                <i class="ti ti-eye"></i> Guest สามารถดูข้อมูลได้เท่านั้น ไม่สามารถแก้ไขได้
              {/if}
            </div>
            <button type="submit" class="ds-btn primary full-w">
              <i class="ti ti-plus"></i> Create Account
            </button>
          </form>
        </div>

        <!-- User List -->
        <div class="ds-card" style="padding:0; overflow:hidden;">
          <div class="ds-card-head" style="padding:16px 20px; border-bottom:1px solid var(--border);">
            <div class="ds-card-title"><i class="ti ti-list"></i> Active Accounts ({users.length})</div>
            <button class="ds-btn sm" on:click={loadUsers}><i class="ti ti-refresh"></i></button>
          </div>
          {#if userLoading}
            <div class="ds-empty" style="padding:3rem;">Loading...</div>
          {:else}
            <div class="ds-table-wrap">
              <table class="ds-table">
                <thead><tr><th>#</th><th>Username</th><th>Role</th><th>Action</th></tr></thead>
                <tbody>
                  {#each users as u, i}
                    <tr>
                      <td class="ds-mono" style="color:var(--text-muted);">{i + 1}</td>
                      <td>
                        <div class="user-row">
                          <div class="avatar {u.role}">{u.username[0].toUpperCase()}</div>
                          <strong>{u.username}</strong>
                        </div>
                      </td>
                      <td>
                        <span class="ds-badge {u.role === 'admin' ? 'blue' : 'gray'}">
                          <i class="ti {u.role === 'admin' ? 'ti-shield' : 'ti-eye'}"></i>
                          {u.role}
                        </span>
                      </td>
                      <td>
                        {#if u.username !== 'admin'}
                          <button class="ds-btn danger sm" on:click={() => deleteUser(u.username)}>
                            <i class="ti ti-trash"></i> Delete
                          </button>
                        {:else}
                          <span class="protected-label"><i class="ti ti-lock"></i> Protected</span>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                  {#if users.length === 0}
                    <tr><td colspan="4"><div class="ds-empty">No accounts found</div></td></tr>
                  {/if}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>

    <!-- ═══════════════════ TAB: Login Audit ═══════════════════ -->
    {:else if activeTab === 'audit'}
      <div class="ds-card" style="padding:0; overflow:hidden;">
        <div class="ds-card-head" style="padding:16px 20px; border-bottom:1px solid var(--border);">
          <div class="ds-card-title"><i class="ti ti-history"></i> Login Audit Log ({filteredSessions.length})</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <div class="ds-search" style="min-width:200px;">
              <i class="ti ti-search"></i>
              <input type="text" bind:value={sessionFilter} placeholder="Search username or IP..." on:input={() => currentPage = 1} />
            </div>
            <button class="ds-btn sm" on:click={loadSessions}><i class="ti ti-refresh"></i> Refresh</button>
          </div>
        </div>
        {#if sessionLoading}
          <div class="ds-empty" style="padding:3rem;">Loading audit log...</div>
        {:else}
          <div class="ds-table-wrap">
            <table class="ds-table">
              <thead><tr>
                <th>#</th><th>Date &amp; Time</th><th>Username</th><th>Role</th><th>IP Address</th>
              </tr></thead>
              <tbody>
                {#each pagedSessions as s, i}
                  <tr>
                    <td class="ds-mono" style="color:var(--text-muted);">{(currentPage - 1) * itemsPerPage + i + 1}</td>
                    <td class="ds-mono">{new Date(s.timestamp).toLocaleString('en-GB')}</td>
                    <td><strong>{s.username}</strong></td>
                    <td>
                      <span class="ds-badge {s.role === 'admin' ? 'blue' : 'orange'}">
                        {s.role}
                      </span>
                    </td>
                    <td class="ds-mono">{s.ipAddress || '—'}</td>
                  </tr>
                {/each}
                {#if filteredSessions.length === 0}
                  <tr><td colspan="5"><div class="ds-empty" style="padding:2rem;">
                    <i class="ti ti-database-off"></i> No login records found
                  </div></td></tr>
                {/if}
              </tbody>
            </table>
          </div>
          {#if totalPages > 1}
            <div class="ds-pagination">
              <div class="ds-pagination-info">Showing {pagedSessions.length} of {filteredSessions.length} records — Page {currentPage} of {totalPages}</div>
              <div class="ds-pagination-btns">
                <button class="ds-page-btn" on:click={() => currentPage--} disabled={currentPage === 1}>
                  <i class="ti ti-chevron-left"></i> Prev
                </button>
                <span class="ds-page-info">{currentPage} / {totalPages}</span>
                <button class="ds-page-btn" on:click={() => currentPage++} disabled={currentPage === totalPages}>
                  Next <i class="ti ti-chevron-right"></i>
                </button>
              </div>
            </div>
          {/if}
        {/if}
      </div>

    <!-- ═══════════════════ TAB: System Config ═══════════════════ -->
    {:else if activeTab === 'config'}
      <div class="config-grid">
        <!-- Session & Security -->
        <div class="ds-card">
          <div class="ds-card-head">
            <div class="ds-card-title"><i class="ti ti-lock"></i> Session &amp; Security</div>
          </div>
          <div class="config-section">
            <div class="config-row">
              <div class="config-label">
                <div class="config-name">Auto Logout Timeout</div>
                <div class="config-desc">ระยะเวลา (นาที) ที่ระบบจะล็อกเอาต์อัตโนมัติเมื่อไม่มีการใช้งาน</div>
              </div>
              <div class="config-control">
                <input type="number" bind:value={sessionTimeout} min="5" max="480" class="input-field" style="width:90px; text-align:center;" />
                <span style="font-size:12px; color:var(--text-muted);">minutes</span>
              </div>
            </div>
            <hr class="ds-divider" />
            <div class="config-row">
              <div class="config-label">
                <div class="config-name">Current Session Info</div>
                <div class="config-desc">ข้อมูลการเข้าสู่ระบบครั้งปัจจุบัน</div>
              </div>
              <div style="text-align:right;">
                <span class="ds-badge blue"><i class="ti ti-user"></i> admin</span>
                <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Localhost</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Notifications -->
        <div class="ds-card">
          <div class="ds-card-head">
            <div class="ds-card-title"><i class="ti ti-bell"></i> Notifications</div>
          </div>
          <div class="config-section">
            <div class="config-row">
              <div class="config-label">
                <div class="config-name">Toast Popup Alerts</div>
                <div class="config-desc">แสดง popup เมื่อตรวจพบการโจมตีใหม่</div>
              </div>
              <label class="toggle">
                <input type="checkbox" bind:checked={enableToastNotify} />
                <span class="slider"></span>
              </label>
            </div>
            <hr class="ds-divider" />
            <div class="config-row">
              <div class="config-label">
                <div class="config-name">Sound Alert</div>
                <div class="config-desc">เล่นเสียงเมื่อมีการโจมตีระดับ Critical</div>
              </div>
              <label class="toggle">
                <input type="checkbox" bind:checked={enableSoundAlert} />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <div style="grid-column: 1/-1; display:flex; justify-content:flex-end; gap:10px; align-items:center;">
          {#if configSaved}
            <span style="color:var(--green); font-size:13px; font-weight:600;"><i class="ti ti-check"></i> บันทึกการตั้งค่าแล้ว</span>
          {/if}
          <button class="ds-btn primary" on:click={saveConfig}>
            <i class="ti ti-device-floppy"></i> Save Configuration
          </button>
        </div>
      </div>

    <!-- ═══════════════════ TAB: About System ═══════════════════ -->
    {:else if activeTab === 'about'}
      <div class="about-grid">
        <!-- System Info -->
        <div class="ds-card">
          <div class="ds-card-head">
            <div class="ds-card-title"><i class="ti ti-radar"></i> KKUSIEM Platform</div>
          </div>
          <div class="about-hero">
            <div class="about-logo"><i class="ti ti-radar"></i></div>
            <div class="about-name">KKU KKUSIEM SIEM</div>
            <div class="about-version">Version 2.0.0</div>
          </div>
          <div class="info-rows">
            <div class="info-row"><span>Platform</span><strong>NestJS + SvelteKit</strong></div>
            <div class="info-row"><span>Database</span><strong>SQLite (TypeORM)</strong></div>
            <div class="info-row"><span>Realtime</span><strong>Socket.IO WebSocket</strong></div>
            <div class="info-row"><span>Deployment</span><strong>Docker + Nginx</strong></div>
          </div>
        </div>

        <!-- Feature List -->
        <div class="ds-card">
          <div class="ds-card-head">
            <div class="ds-card-title"><i class="ti ti-list-check"></i> Active Modules</div>
          </div>
          <div class="module-list">
            {#each [
              { icon: 'ti-radar', name: 'SIEM Dashboard', status: 'active', desc: 'Realtime attack overview' },
              { icon: 'ti-chart-pie', name: 'Analyst Center', status: 'active', desc: 'Attacker pattern analysis' },
              { icon: 'ti-list-search', name: 'Security Logs', status: 'active', desc: 'Multi-source log viewer' },
              { icon: 'ti-alert-triangle', name: 'Alerts & SOAR', status: 'active', desc: 'Automated response rules' },
              { icon: 'ti-zoom-in', name: 'Threat Investigation', status: 'active', desc: 'IP deep-dive analysis' },
              { icon: 'ti-grid-dots', name: 'MITRE ATT&CK', status: 'active', desc: 'Tactic mapping matrix' },
              { icon: 'ti-database-search', name: 'CVE Database', status: 'active', desc: 'Vulnerability lookup' },
              { icon: 'ti-shield-x', name: 'IP Block Audit', status: 'active', desc: 'Firewall rule management' },
            ] as mod}
              <div class="module-item">
                <div class="module-icon"><i class="ti {mod.icon}"></i></div>
                <div class="module-info">
                  <div class="module-name">{mod.name}</div>
                  <div class="module-desc">{mod.desc}</div>
                </div>
                <span class="ds-badge green"><i class="ti ti-check"></i> Active</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  /* ── Tab Navigation ──────────────────────────────── */
  .tab-nav {
    display: flex;
    gap: 6px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 6px;
    flex-wrap: wrap;
  }
  .tab-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border: none;
    background: transparent;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }
  .tab-btn i { font-size: 16px; }
  .tab-btn:hover { background: var(--bg-secondary); color: var(--text-primary); }
  .tab-btn.active { background: var(--green); color: #fff; box-shadow: 0 2px 10px rgba(29,158,117,0.3); }

  /* ── Layout Grids ────────────────────────────────── */
  .two-col {
    display: grid;
    grid-template-columns: 360px 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

  .config-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media (max-width: 900px) { .config-grid { grid-template-columns: 1fr; } }

  .about-grid {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 900px) { .about-grid { grid-template-columns: 1fr; } }

  /* ── Form ────────────────────────────────────────── */
  .form-stack { display: flex; flex-direction: column; gap: 14px; }
  .field label { display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
  .input-field {
    width: 100%;
    padding: 9px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 13px;
    color: var(--text-primary);
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s;
  }
  .input-field:focus { border-color: var(--green); }
  .full-w { width: 100%; justify-content: center; }

  .role-hint {
    font-size: 12px;
    padding: 8px 12px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .role-hint.admin { background: var(--blue-bg); color: var(--blue); }
  .role-hint.guest { background: var(--bg-secondary); color: var(--text-secondary); }

  .msg { padding: 10px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; margin-bottom: 4px; }
  .msg.success { background: var(--green-bg); color: var(--green); }
  .msg.error { background: var(--red-bg); color: var(--red); }

  /* ── User Table ──────────────────────────────────── */
  .user-row { display: flex; align-items: center; gap: 10px; }
  .avatar {
    width: 30px; height: 30px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 800; flex-shrink: 0;
  }
  .avatar.admin { background: var(--blue-bg); color: var(--blue); }
  .avatar.guest { background: var(--bg-secondary); color: var(--text-secondary); }
  .protected-label { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }

  /* ── Config ──────────────────────────────────────── */
  .config-section { display: flex; flex-direction: column; gap: 0; }
  .config-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; }
  .config-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
  .config-desc { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
  .config-control { display: flex; align-items: center; gap: 8px; }

  /* Toggle Switch */
  .toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
    background: var(--border); border-radius: 24px; transition: 0.3s;
    border: 1px solid var(--border);
  }
  .slider:before {
    position: absolute; content: '';
    width: 18px; height: 18px; left: 3px; bottom: 2px;
    background: white; border-radius: 50%; transition: 0.3s;
  }
  .toggle input:checked + .slider { background: var(--green); }
  .toggle input:checked + .slider:before { transform: translateX(19px); }

  /* ── About ───────────────────────────────────────── */
  .about-hero { text-align: center; padding: 24px 0 20px; }
  .about-logo {
    width: 64px; height: 64px; border-radius: 18px;
    background: var(--green-bg); color: var(--green);
    display: flex; align-items: center; justify-content: center;
    font-size: 32px; margin: 0 auto 12px;
  }
  .about-name { font-size: 18px; font-weight: 800; color: var(--text-primary); }
  .about-version { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
  .info-rows { display: flex; flex-direction: column; border-top: 1px solid var(--border); margin-top: 8px; }
  .info-row { display: flex; justify-content: space-between; align-items: center; padding: 11px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
  .info-row span { color: var(--text-muted); }

  .module-list { display: flex; flex-direction: column; gap: 2px; }
  .module-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .module-item:last-child { border-bottom: none; }
  .module-icon {
    width: 32px; height: 32px; border-radius: 8px;
    background: var(--green-bg); color: var(--green);
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; flex-shrink: 0;
  }
  .module-info { flex: 1; }
  .module-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
  .module-desc { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
</style>
