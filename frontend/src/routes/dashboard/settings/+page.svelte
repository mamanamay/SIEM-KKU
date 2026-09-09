<script lang="ts">
  import { onMount } from 'svelte';
  import { roleStore } from '../../../stores/events';

  let activeTab = 'users';

  // === User Management State ===
  let users: any[] = [];
  let newUsername = '';
  let newPassword = '';
  let newRole = 'guest';
  let newIsSso = false;
  let showNewPassword = false;
  let userMsg = '';
  let userErr = '';
  let userLoading = false;

  // Password visibility per-user (map of username -> boolean)
  let visiblePasswords: Record<string, boolean> = {};

  // === Edit Password Modal ===
  let editModal: { open: boolean; username: string; newPw: string; showPw: boolean; loading: boolean; msg: string; err: string } = {
    open: false, username: '', newPw: '', showPw: false, loading: false, msg: '', err: ''
  };

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
  let cfgScorecardUrl = '';
  let cfgScorecardKey = '';
  let cfgIpSyncUrl = '';
  let cfgIpSyncKey = '';
  let cfgGeminiKey = '';

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
      const res = await apiFetch('/api/auth/users');
      if (res.ok) users = await res.json();
    } catch(e) {}
    userLoading = false;
  }

  async function createUser() {
    userMsg = ''; userErr = '';
    if (!newUsername.trim()) { userErr = 'กรุณากรอก Username'; return; }
    if (!newIsSso && !newPassword.trim()) { userErr = 'กรุณากรอก Password'; return; }
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole, isSso: newIsSso })
      });
      const data = await res.json();
      if (res.ok) {
        userMsg = `✓ สร้างบัญชี "${newUsername}" สำเร็จ`;
        newUsername = ''; newPassword = ''; newRole = 'guest'; showNewPassword = false; newIsSso = false;
        await loadUsers();
      } else {
        userErr = data.message || 'เกิดข้อผิดพลาด';
      }
    } catch(e) { userErr = 'Network error'; }
  }

  async function deleteUser(username: string) {
    if (!confirm(`ยืนยันการลบบัญชี "${username}" ?`)) return;
    try {
      const res = await apiFetch(`/api/auth/users/${username}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) { await loadUsers(); }
      else { alert(data.message || 'ไม่สามารถลบได้'); }
    } catch(e) { alert('Network error'); }
  }

  function togglePasswordVisibility(username: string) {
    visiblePasswords = { ...visiblePasswords, [username]: !visiblePasswords[username] };
  }

  // ── Edit Password Modal ──
  function openEditModal(username: string) {
    editModal = { open: true, username, newPw: '', showPw: false, loading: false, msg: '', err: '' };
  }
  function closeEditModal() {
    editModal = { ...editModal, open: false };
  }
  async function submitPasswordChange() {
    editModal.msg = ''; editModal.err = '';
    if (!editModal.newPw.trim() || editModal.newPw.length < 4) {
      editModal.err = 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร'; return;
    }
    editModal.loading = true;
    try {
      const res = await apiFetch(`/api/auth/users/${editModal.username}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: editModal.newPw })
      });
      const data = await res.json();
      if (res.ok) {
        editModal.msg = data.message;
        await loadUsers();
        setTimeout(() => closeEditModal(), 1500);
      } else {
        editModal.err = data.message || 'เกิดข้อผิดพลาด';
      }
    } catch(e) { editModal.err = 'Network error'; }
    editModal.loading = false;
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
    cfgScorecardUrl = localStorage.getItem('cfg_scorecard_url') || 'https://10.101.118.184:4333/dashboard';
    cfgScorecardKey = localStorage.getItem('cfg_scorecard_key') || '4c25eebe1323386cca6319b3b4516d3f';
    cfgIpSyncUrl = localStorage.getItem('cfg_ip_sync_url') || '';
    cfgIpSyncKey = localStorage.getItem('cfg_ip_sync_key') || '';
    cfgGeminiKey = localStorage.getItem('cfg_gemini_key') || '';
  }
  function saveConfig() {
    localStorage.setItem('cfg_session_timeout', sessionTimeout.toString());
    localStorage.setItem('cfg_toast', enableToastNotify.toString());
    localStorage.setItem('cfg_sound', enableSoundAlert.toString());
    localStorage.setItem('cfg_scorecard_url', cfgScorecardUrl);
    localStorage.setItem('cfg_scorecard_key', cfgScorecardKey);
    localStorage.setItem('cfg_ip_sync_url', cfgIpSyncUrl);
    localStorage.setItem('cfg_ip_sync_key', cfgIpSyncKey);
    localStorage.setItem('cfg_gemini_key', cfgGeminiKey);
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
  <title>KKUSIEM</title>
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

              <!--</div>
<!-- Password Edit Modal -->
      {#if editModal.open}
        <div class="modal-overlay" on:click|self={closeEditModal}>
          <div class="modal-box">
            <div class="modal-head">
              <div class="modal-title"><i class="ti ti-key"></i> เปลี่ยนรหัสผ่าน</div>
              <button class="modal-close" on:click={closeEditModal}><i class="ti ti-x"></i></button>
            </div>
            <div class="modal-body">
              <div class="modal-user-chip">
                <div class="avatar admin">{editModal.username[0]?.toUpperCase()}</div>
                <span>{editModal.username}</span>
              </div>
              {#if editModal.msg}<div class="msg success">{editModal.msg}</div>{/if}
              {#if editModal.err}<div class="msg error">{editModal.err}</div>{/if}
              <div class="field">
                <label>รหัสผ่านใหม่</label>
                <div class="pw-wrap">
                  {#if editModal.showPw}
                    <input type="text" bind:value={editModal.newPw} class="input-field" placeholder="กรอกรหัสผ่านใหม่" autofocus />
                  {:else}
                    <input type="password" bind:value={editModal.newPw} class="input-field" placeholder="กรอกรหัสผ่านใหม่" autofocus />
                  {/if}
                  <button type="button" class="pw-eye" on:click={() => editModal.showPw = !editModal.showPw}>
                    <i class="ti {editModal.showPw ? 'ti-eye-off' : 'ti-eye'}"></i>
                  </button>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="ds-btn sm" on:click={closeEditModal}>ยกเลิก</button>
              <button class="ds-btn primary" on:click={submitPasswordChange} disabled={editModal.loading}>
                {#if editModal.loading}<span class="mini-spin"></span>{/if}
                <i class="ti ti-check"></i> บันทึกรหัสผ่าน
              </button>
            </div>
          </div>
        </div>
      {/if}

      <div class="two-col">
        <!-- Create Form -->
        <div class="ds-card">
          <div class="ds-card-head">
            <div class="ds-card-title"><i class="ti ti-user-plus"></i> Create New Account</div>
          </div>
          <label class="sso-whitelist-note toggle-box" class:active={newIsSso}>
            <input type="checkbox" bind:checked={newIsSso} style="display:none;" />
            <div class="sso-icon">
              <i class="ti {newIsSso ? 'ti-shield-check' : 'ti-shield-lock'}"></i>
            </div>
            <div>
              <strong>KKU SSO Whitelist</strong><br>
              <span>{newIsSso ? 'ผูกบัญชีด้วย KKU SSO (ไม่ต้องตั้งรหัสผ่าน)' : 'ใช้งาน KKU SSO เปิดตัวเลือกนี้'}</span>
            </div>
            <div class="toggle-switch">
              <div class="switch-track"></div>
              <div class="switch-thumb"></div>
            </div>
          </label>
          {#if userMsg}<div class="msg success">{userMsg}</div>{/if}
          {#if userErr}<div class="msg error">{userErr}</div>{/if}
          <form on:submit|preventDefault={createUser} class="form-stack">
            <div class="field">
              <label>Username <span class="label-hint">(Email เต็ม — สำหรับผูกกับ SSO)</span></label>
              <input type="text" bind:value={newUsername} placeholder="e.g. user@anydomain.com" class="input-field" style="padding-right:12px;" />
            </div>
            {#if !newIsSso}
            <div class="field">
              <label>Password <span class="label-hint">(สำหรับล็อกอินแบบปกติ)</span></label>
              <div class="pw-wrap">
                {#if showNewPassword}
                  <input type="text" bind:value={newPassword} placeholder="Min 4 characters" class="input-field" />
                {:else}
                  <input type="password" bind:value={newPassword} placeholder="Min 4 characters" class="input-field" />
                {/if}
                <button type="button" class="pw-eye" on:click={() => showNewPassword = !showNewPassword}>
                  <i class="ti {showNewPassword ? 'ti-eye-off' : 'ti-eye'}"></i>
                </button>
              </div>
            </div>
            {/if}
            <div class="field">
              <label>Role</label>
              <select bind:value={newRole} class="ds-select">
                                <option value="admin">?? Admin - Full Access</option>
                
                <option value="analyst">?? Analyst L1 (Junior)</option>
                
                
                <option value="guest">?? Guest</option>
              </select>
            </div>
            <div class="role-hint {newRole}">
              {#if newRole === 'admin'}
                <i class="ti ti-shield-check"></i> Admin เข้าถึงทุกเมนูและจัดการบัญชีได้
              {:else}
                <i class="ti ti-eye"></i> Guest ดูข้อมูลได้เท่านั้น ไม่สามารถแก้ไขได้
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
                <thead><tr><th>#</th><th>Username</th><th>Role</th><th>Password</th><th>Action</th></tr></thead>
                <tbody>
                  {#each users as u, i}
                    <tr>
                      <td class="ds-mono" style="color:var(--text-muted);">{i + 1}</td>
                      <td>
                        <div class="user-row">
                          <div class="avatar {u.role}">{u.username[0].toUpperCase()}</div>
                          <div>
                            <strong>{u.username}</strong>
                            {#if u.isSso}
                              <div class="sso-tag"><i class="ti ti-brand-oauth"></i> SSO</div>
                            {/if}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span class="ds-badge {u.role === 'admin' ? 'blue' : 'gray'}">
                          <i class="ti {u.role === 'admin' ? 'ti-shield' : 'ti-eye'}"></i>
                          {u.role}
                        </span>
                      </td>
                      <td class="pw-cell">
                        {#if u.isSso}
                          <span class="sso-pw-label"><i class="ti ti-brand-oauth"></i> SSO Managed</span>
                        {:else}
                          <div class="pw-reveal-wrap">
                            <code class="pw-value">
                              {visiblePasswords[u.username] ? (u.passwordHash || '—') : '••••••••'}
                            </code>
                            <button
                              type="button"
                              class="pw-eye-sm"
                              title={visiblePasswords[u.username] ? 'ซ่อน' : 'แสดงรหัสผ่าน'}
                              on:click|stopPropagation={() => togglePasswordVisibility(u.username)}
                            >
                              <i class="ti {visiblePasswords[u.username] ? 'ti-eye-off' : 'ti-eye'}"></i>
                            </button>
                          </div>
                        {/if}
                      </td>
                      <td>
                        <div class="action-btns">
                          {#if !u.isSso}
                            <button class="ds-btn sm" title="เปลี่ยนรหัสผ่าน" on:click={() => openEditModal(u.username)}>
                              <i class="ti ti-key"></i>
                            </button>
                          {/if}
                          {#if u.username !== 'admin'}
                            <button class="ds-btn danger sm" title="ลบบัญชี" on:click={() => deleteUser(u.username)}>
                              <i class="ti ti-trash"></i>
                            </button>
                          {:else}
                            <span class="protected-label"><i class="ti ti-lock"></i> Protected</span>
                          {/if}
                        </div>
                      </td>
                    </tr>
                  {/each}
                  {#if users.length === 0}
                    <tr><td colspan="5"><div class="ds-empty">No accounts found</div></td></tr>
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

        <!-- External APIs -->
        <div class="ds-card">
          <div class="ds-card-head">
            <div class="ds-card-title"><i class="ti ti-api"></i> External Integrations</div>
          </div>
          <div class="config-section">
            <div class="config-row" style="flex-direction: column; align-items: stretch; gap: 8px;">
              <div class="config-label">
                <div class="config-name">Scorecard API URL</div>
                <div class="config-desc">Endpoint หรือ URL ของระบบ Scorecard (ถ้ามี)</div>
              </div>
              <input type="text" bind:value={cfgScorecardUrl} class="input-field" placeholder="https://api.example.com/v1/scorecard" />
            </div>
            <hr class="ds-divider" />
            <div class="config-row" style="flex-direction: column; align-items: stretch; gap: 8px;">
              <div class="config-label">
                <div class="config-name">Scorecard API Key</div>
                <div class="config-desc">Token หรือ Key สำหรับยืนยันตัวตนกับ API (ถ้ามี)</div>
              </div>
              <input type="password" bind:value={cfgScorecardKey} class="input-field" placeholder="API Key" />
            </div>
            <hr class="ds-divider" />
            <div class="config-row" style="flex-direction: column; align-items: stretch; gap: 8px;">
              <div class="config-label">
                <div class="config-name">Google Gemini AI API Key</div>
                <div class="config-desc">API Key สำหรับใช้งาน SOC AI Analyst (เช่น AIzaSy...)</div>
              </div>
              <input type="password" bind:value={cfgGeminiKey} class="input-field" placeholder="Gemini API Key" />
            </div>
          </div>
        </div>

        <div class="ds-card">
          <div class="ds-card-head">
            <div class="ds-card-title"><i class="ti ti-sitemap"></i> Network IP Sync API</div>
          </div>
          <div class="config-section">
            <div class="config-row" style="flex-direction: column; align-items: stretch; gap: 8px;">
              <div class="config-label">
                <div class="config-name">API Endpoint URL</div>
                <div class="config-desc">ตั้งค่า API สำหรับดึงข้อมูล IP ของคณะและหน่วยงานจากมหาวิทยาลัย</div>
              </div>
              <input type="text" bind:value={cfgIpSyncUrl} class="input-field" placeholder="https://api.kku.ac.th/v1/network/subnets" />
            </div>
            <hr class="ds-divider" />
            <div class="config-row" style="flex-direction: column; align-items: stretch; gap: 8px;">
              <div class="config-label">
                <div class="config-name">Authentication Token (Optional)</div>
                <div class="config-desc">Bearer Token หรือ API Key สำหรับการเชื่อมต่อ</div>
              </div>
              <input type="password" bind:value={cfgIpSyncKey} class="input-field" placeholder="API Key" />
            </div>
            <hr class="ds-divider" />
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-size: 13px; font-weight: 600; color: var(--text-primary);">สถานะการ Sync ล่าสุด</div>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">รอการเชื่อมต่อ (Mock Mode) - อัปเดตล่าสุด: ยังไม่มีการเชื่อมต่อ</div>
              </div>
              <button class="ds-btn sm" on:click={() => alert('ฟังก์ชันเชื่อมต่อจำลองการทำงาน (Mock)')}>
                <i class="ti ti-refresh"></i> Test Connection &amp; Sync
              </button>
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
  /* Hide browser default password reveal icon (Edge/Chrome on Windows) */
  :global(input[type="password"]::-ms-reveal),
  :global(input[type="password"]::-ms-clear) {
    display: none;
  }

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

  .sso-whitelist-note {
    display: flex;
    gap: 10px;
    align-items: center;
    background: rgba(29,158,117,0.06);
    border: 1px solid rgba(29,158,117,0.2);
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
    margin-bottom: 16px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .sso-whitelist-note:hover { background: rgba(29,158,117,0.1); }
  .sso-whitelist-note.active { background: rgba(29,158,117,0.15); border-color: var(--green); }
  .sso-whitelist-note .sso-icon i { color: var(--green); font-size: 20px; flex-shrink: 0; transition: all 0.2s; }
  .sso-whitelist-note strong { display: block; color: var(--green); font-size: 13px; margin-bottom: 2px; transition: all 0.2s; }
  
  .toggle-switch { margin-left: auto; position: relative; width: 36px; height: 20px; border-radius: 20px; background: var(--border); transition: all 0.3s; flex-shrink: 0; }
  .active .toggle-switch { background: var(--green); }
  .switch-thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: white; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: all 0.3s; }
  .active .switch-thumb { transform: translateX(16px); }

  /* ── Form ────────────────────────────────────────── */
  .form-stack { display: flex; flex-direction: column; gap: 14px; }
  .field label { display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
  .label-hint { font-size: 10px; font-weight: 400; text-transform: none; color: var(--text-muted); opacity: 0.7; }
  .input-field {
    width: 100%;
    padding: 9px 36px 9px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 13px;
    color: var(--text-primary);
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }
  .input-field:focus { border-color: var(--green); }
  .full-w { width: 100%; justify-content: center; }

  /* Password input with eye button */
  .pw-wrap { position: relative; display: flex; align-items: center; }
  .pw-wrap .input-field { padding-right: 38px; }
  .pw-eye {
    position: absolute;
    right: 8px;
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 16px;
    padding: 4px;
    display: flex;
    align-items: center;
    transition: color 0.2s;
  }
  .pw-eye:hover { color: var(--text-primary); }

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
  .action-btns { display: flex; gap: 6px; align-items: center; }

  /* SSO tag under username */
  .sso-tag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 600;
    color: #7c3aed;
    background: rgba(124,58,237,0.1);
    border-radius: 4px;
    padding: 1px 5px;
    margin-top: 2px;
  }

  /* Password column */
  .pw-cell { min-width: 140px; }
  .pw-reveal-wrap { display: flex; align-items: center; gap: 6px; }
  .pw-value {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 3px 8px;
    color: var(--text-primary);
    letter-spacing: 0.05em;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-block;
  }
  .pw-eye-sm {
    background: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 13px;
    padding: 3px 5px;
    display: flex;
    align-items: center;
    transition: all 0.2s;
    flex-shrink: 0;
    position: relative;
    z-index: 2;
  }
  .pw-eye-sm:hover { border-color: var(--green); color: var(--green); }
  .sso-pw-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: #7c3aed;
    background: rgba(124,58,237,0.08);
    border: 1px solid rgba(124,58,237,0.2);
    border-radius: 6px;
    padding: 3px 8px;
  }

  /* ── Password Edit Modal ──────────────────────────── */
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0,0,0,0.65);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: fadeIn 0.2s ease;
  }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  .modal-box {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 16px;
    width: 100%;
    max-width: 400px;
    box-shadow: 0 24px 48px rgba(0,0,0,0.5);
    animation: slideUp 0.25s cubic-bezier(.175,.885,.32,1.275);
    overflow: hidden;
  }
  @keyframes slideUp { from { transform: translateY(20px); opacity:0; } to { transform: translateY(0); opacity:1; } }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }
  .modal-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
  }
  .modal-title i { color: var(--green); font-size: 18px; }
  .modal-close {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 18px;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    transition: color 0.2s;
  }
  .modal-close:hover { color: var(--red); }
  .modal-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
  .modal-user-chip {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--bg-secondary);
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 16px 20px;
    border-top: 1px solid var(--border);
  }
  .mini-spin {
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    display: inline-block;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

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
