<script lang="ts">
  import { onMount } from 'svelte';

  import { roleStore, usernameStore } from '../../../stores/events';
  import SecuritySettings from './SecuritySettings.svelte';

  let activeTab = 'personal';

  let enableToastNotify = true;
  let sessionTimeout = 30;
  
  let users: any[] = [
    { username: 'admin', role: 'admin', ssoProvider: null, totpEnabled: true, passwordDecrypted: 'Secret123!' },
    { username: 'analyst1', role: 'user', ssoProvider: 'azure', totpEnabled: false, passwordDecrypted: 'N/A' },
  ];
  let userLoading = false;
  
  let pwModal = { open: false, user: null as any, newPassword: '', msg: '', msgType: '', loading: false };
  function openPasswordModal(u: any) {
    pwModal = { open: true, user: u, newPassword: '', msg: '', msgType: '', loading: false };
  }
  async function savePassword() {
    pwModal.loading = true;
    await new Promise(r => setTimeout(r, 600));
    pwModal.loading = false;
    pwModal.msg = 'Password updated successfully';
    pwModal.msgType = 'success';
    setTimeout(() => { pwModal.open = false; }, 1500);
  }

  let resetModal = { open: false, user: null as any, msg: '', msgType: '', loading: false, sent: false };
  function openResetModal(u: any) {
    resetModal = { open: true, user: u, msg: '', msgType: '', loading: false, sent: false };
  }
  async function sendResetEmail() {
    resetModal.loading = true;
    resetModal.msg = '';
    await new Promise(r => setTimeout(r, 1200)); // Simulate email sending API
    resetModal.loading = false;
    resetModal.sent = true;
    resetModal.msg = 'Secure reset link sent successfully via SES.';
    resetModal.msgType = 'success';
    setTimeout(() => { resetModal.open = false; }, 2000);
  }
  function loadUsers() {
    userLoading = true; setTimeout(() => userLoading = false, 500);
  }

  let sessionFilter = '';
  let sessionLoading = false;
  let filteredSessions: any[] = [
    { createdAt: Date.now(), username: 'admin', ip: '192.168.1.10', userAgent: 'Chrome', success: true }
  ];
  let paginatedSessions: any[] = [];
  let currentPage = 1;
  let totalPages = 1;
  function formatEventTime(t: number) { return new Date(t).toLocaleString(); }
  function loadSessions() {
    sessionLoading = true; setTimeout(() => { paginatedSessions = filteredSessions; sessionLoading = false; }, 500);
  }
  function prevPage() { if (currentPage > 1) currentPage--; }
  function nextPage() { if (currentPage < totalPages) currentPage++; }
  onMount(() => {
    paginatedSessions = filteredSessions;
  });

  let cfgScorecardUrl = '';
  let cfgScorecardKey = '';
  let cfgIpSyncUrl = '';
  let cfgIpSyncKey = '';
  let cfgGeminiKey = '';
  let apiTestStatus = {
    scorecard: { loading: false, msg: '' },
    ipsync: { loading: false, msg: '' },
    gemini: { loading: false, msg: '' }
  };
  function testApiConnection(type: string) {
    apiTestStatus[type as keyof typeof apiTestStatus].loading = true;
    setTimeout(() => {
      apiTestStatus[type as keyof typeof apiTestStatus].loading = false;
      apiTestStatus[type as keyof typeof apiTestStatus].msg = 'Connected successfully';
    }, 1000);
  }

  let configSaved = false;
  function saveConfig() {
    configSaved = true;
    setTimeout(() => configSaved = false, 3000);
  }

  let toasts: any[] = [];
  
  let confirmModal = {
    open: false, title: '', desc: '', type: 'primary',
    onConfirm: () => {}, onCancel: () => { confirmModal.open = false; }
  };
</script>
<svelte:head><title>System Settings - KKUSIEM</title></svelte:head>

<div class="settings-layout">
  <aside class="settings-sidebar">
    <div class="sidebar-header">
      <i class="ti ti-settings"></i>
      <div>
        <h3>Command Center</h3>
        <p>SOC Platform Settings</p>
      </div>
    </div>
    
    <div class="sidebar-nav custom-scrollbar">
      <div class="nav-group">Personal</div>
      <button class="nav-item {activeTab === 'personal' ? 'active' : ''}" on:click={() => activeTab = 'personal'}>
        <i class="ti ti-user-circle"></i> My Account
      </button>

      <div class="nav-group">Team & Access</div>
      <button class="nav-item {activeTab === 'team' ? 'active' : ''}" on:click={() => activeTab = 'team'}>
        <i class="ti ti-users"></i> Users & Roles
      </button>

      <div class="nav-group">SOC Configurations</div>
      <button class="nav-item {activeTab === 'detection' ? 'active' : ''}" on:click={() => activeTab = 'detection'}>
        <i class="ti ti-radar"></i> Detection & Intel
      </button>
      <button class="nav-item {activeTab === 'soar' ? 'active' : ''}" on:click={() => activeTab = 'soar'}>
        <i class="ti ti-bolt"></i> SOAR & Automations
      </button>
      <button class="nav-item {activeTab === 'ai' ? 'active' : ''}" on:click={() => activeTab = 'ai'}>
        <i class="ti ti-brain"></i> AI Analyst Settings
      </button>

      <div class="nav-group">System</div>
      <button class="nav-item {activeTab === 'audit' ? 'active' : ''}" on:click={() => activeTab = 'audit'}>
        <i class="ti ti-clipboard-list"></i> Audit & Compliance
      </button>
      <button class="nav-item {activeTab === 'health' ? 'active' : ''}" on:click={() => activeTab = 'health'}>
        <i class="ti ti-heartbeat"></i> Platform Health
      </button>
    </div>
  </aside>

  <main class="settings-content custom-scrollbar">
    <div class="content-wrapper">
      
      {#if activeTab === 'personal'}
        <div class="tab-header">
          <h2>My Account</h2>
          <p>Manage your personal preferences, profile, and security settings.</p>
        </div>
        <div class="config-grid">
          <div class="ds-card">
            <div class="ds-card-head">
              <div class="ds-card-title"><i class="ti ti-user-edit"></i> Profile & Theme</div>
            </div>
            <div class="config-section">
              
              <div class="config-row">
                <div class="config-label">
                  <div class="config-name">Toast Popup Alerts</div>
                  <div class="config-desc">เปิดแจ้งเตือน Popup เมื่อมี Attack เข้ามาใหม่ (Live Alert)</div>
                </div>
                <label class="toggle">
                  <input type="checkbox" bind:checked={enableToastNotify} />
                  <span class="slider"></span>
                </label>
              </div>
            </div>
          </div>
          <SecuritySettings />
        </div>

      {:else if activeTab === 'team'}
        <div class="tab-header">
          <h2>Users & Advanced RBAC</h2>
          <p>Manage SOC team members and granular role-based access control (RBAC).</p>
        </div>
        <div class="ds-card">
          {#if userLoading}
            <div class="ds-empty" style="padding:3rem;">Loading...</div>
          {:else}
            <div class="ds-table-wrap">
              <table class="ds-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Permissions</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {#each users as u, i}
                    <tr>
                      <td>
                        <div class="user-row">
                          <div class="avatar {u.role}">{u.username.charAt(0).toUpperCase()}</div>
                          <div>
                            <strong>{u.username}</strong>
                            {#if u.ssoProvider}
                              <br/><span class="sso-tag"><i class="ti ti-brand-windows"></i> {u.ssoProvider} SSO</span>
                            {/if}
                          </div>
                        </div>
                      </td>
                      <td>
                        <select class="input-field" style="width:120px; padding:4px 8px;">
                          <option selected={u.role === 'admin'}>Admin (Tier 3)</option>
                          <option selected={u.role === 'user'}>Analyst (Tier 1)</option>
                        </select>
                      </td>
                      
                      <td>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                          <label style="font-size:11px; display:flex; align-items:center; gap:6px;">
                            <input type="checkbox" checked={true} disabled={u.role === 'admin'} /> View Logs & Dashboards
                          </label>
                          <label style="font-size:11px; display:flex; align-items:center; gap:6px;">
                            <input type="checkbox" checked={true} disabled={u.role === 'admin'} /> Threat Hunting & Query
                          </label>
                          <label style="font-size:11px; display:flex; align-items:center; gap:6px;">
                            <input type="checkbox" checked={u.role === 'admin'} /> Execute SOAR Actions
                          </label>
                          <label style="font-size:11px; display:flex; align-items:center; gap:6px;">
                            <input type="checkbox" checked={u.role === 'admin'} /> Manage Network Map
                          </label>
                          <label style="font-size:11px; display:flex; align-items:center; gap:6px;">
                            <input type="checkbox" checked={u.role === 'admin'} disabled={u.role === 'admin'} /> Edit System Configs
                          </label>
                          <label style="font-size:11px; display:flex; align-items:center; gap:6px;">
                            <input type="checkbox" checked={u.role === 'admin'} disabled={u.role === 'admin'} /> Manage Users & Roles
                          </label>
                        </div>
                      </td>
                      <td>
                        <div class="action-btns">
                          {#if !u.ssoProvider}
                            <button class="ds-btn sm" title="Reset Password" on:click={() => openResetModal(u)}>
                              <i class="ti ti-mail-forward"></i> Reset PW
                            </button>
                          {/if}
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>

{:else if activeTab === 'detection'}
        <div class="tab-header">
          <h2>Integration & Connectors Hub</h2>
          <p>Connect KKUSIEM to external security tools, threat intelligence, and enterprise services.</p>
        </div>
        
        <div class="integration-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div class="ds-card app-card">
            <div class="app-card-head" style="padding: 20px; display:flex; gap:16px; align-items:center; border-bottom:1px solid var(--border);">
              <div class="app-icon" style="width:48px; height:48px; background:rgba(59, 130, 246, 0.1); color:#3b82f6; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:24px;">
                <i class="ti ti-shield-search"></i>
              </div>
              <div>
                <h3 style="margin:0; font-size:15px; color:var(--text-primary);">VirusTotal</h3>
                <p style="margin:4px 0 0 0; font-size:12px; color:var(--text-muted);">Threat Intelligence API</p>
              </div>
              <div style="margin-left:auto;"><span class="ds-badge green">Connected</span></div>
            </div>
            <div class="app-card-body" style="padding: 16px 20px;">
              <button class="ds-btn sm" style="width:100%; justify-content:center;">Configure Settings</button>
            </div>
          </div>
          
          <div class="ds-card app-card">
            <div class="app-card-head" style="padding: 20px; display:flex; gap:16px; align-items:center; border-bottom:1px solid var(--border);">
              <div class="app-icon" style="width:48px; height:48px; background:rgba(244, 63, 94, 0.1); color:#f43f5e; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:24px;">
                <i class="ti ti-firewall"></i>
              </div>
              <div>
                <h3 style="margin:0; font-size:15px; color:var(--text-primary);">PaloAlto PAN-OS</h3>
                <p style="margin:4px 0 0 0; font-size:12px; color:var(--text-muted);">Next-Gen Firewall</p>
              </div>
              <div style="margin-left:auto;"><span class="ds-badge gray">Not Configured</span></div>
            </div>
            <div class="app-card-body" style="padding: 16px 20px;">
              <button class="ds-btn sm primary" style="width:100%; justify-content:center;">Install Connector</button>
            </div>
          </div>

          <div class="ds-card app-card">
            <div class="app-card-head" style="padding: 20px; display:flex; gap:16px; align-items:center; border-bottom:1px solid var(--border);">
              <div class="app-icon" style="width:48px; height:48px; background:rgba(16, 185, 129, 0.1); color:#10b981; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:24px;">
                <i class="ti ti-brand-slack"></i>
              </div>
              <div>
                <h3 style="margin:0; font-size:15px; color:var(--text-primary);">Slack Webhooks</h3>
                <p style="margin:4px 0 0 0; font-size:12px; color:var(--text-muted);">SOC Alert Notifications</p>
              </div>
              <div style="margin-left:auto;"><span class="ds-badge green">Connected</span></div>
            </div>
            <div class="app-card-body" style="padding: 16px 20px;">
              <button class="ds-btn sm" style="width:100%; justify-content:center;">Configure Settings</button>
            </div>
          </div>
          
          <div class="ds-card app-card">
            <div class="app-card-head" style="padding: 20px; display:flex; gap:16px; align-items:center; border-bottom:1px solid var(--border);">
              <div class="app-icon" style="width:48px; height:48px; background:rgba(168, 85, 247, 0.1); color:#a855f7; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:24px;">
                <i class="ti ti-users"></i>
              </div>
              <div>
                <h3 style="margin:0; font-size:15px; color:var(--text-primary);">Active Directory</h3>
                <p style="margin:4px 0 0 0; font-size:12px; color:var(--text-muted);">LDAP / SSO Login</p>
              </div>
              <div style="margin-left:auto;"><span class="ds-badge gray">Not Configured</span></div>
            </div>
            <div class="app-card-body" style="padding: 16px 20px;">
              <button class="ds-btn sm primary" style="width:100%; justify-content:center;">Install Connector</button>
            </div>
          </div>
        </div>

{:else if activeTab === 'soar'}
        <div class="tab-header">
          <h2>SOAR & Automations</h2>
          <p>Manage automated responses, session security, and network enforcement.</p>
        </div>
        <div class="config-grid">
          
          <div class="ds-card">
            <div class="ds-card-head">
              <div class="ds-card-title"><i class="ti ti-lock-access"></i> Analyst Session</div>
            </div>
            <div class="config-section">
              <div class="config-row">
                <div class="config-label">
                  <div class="config-name">Auto Logout Timeout</div>
                  <div class="config-desc">กำหนดเวลา (นาที) ที่จะบังคับออกจากระบบหากไม่มีการใช้งาน (Security Policy)</div>
                </div>
                <div class="config-control">
                  <input type="number" bind:value={sessionTimeout} min="5" max="480" class="input-field" style="width:90px; text-align:center;" />
                  <span style="font-size:12px; color:var(--text-muted);">minutes</span>
                </div>
              </div>
            </div>
          </div>

          <div class="ds-card">
            <div class="ds-card-head">
              <div class="ds-card-title"><i class="ti ti-sitemap"></i> Network Enforcement (IP Sync)</div>
            </div>
            <div class="config-section">
              <div class="config-row" style="flex-direction: column; align-items: stretch; gap: 8px;">
                <div class="config-label">
                  <div class="config-name">API Endpoint URL</div>
                  <div class="config-desc">ตั้งค่า API สำหรับดึงข้อมูล IP ของเครื่องเป้าหมายจาก Network Switch / Firewall</div>
                </div>
                <input type="text" bind:value={cfgIpSyncUrl} class="input-field" placeholder="https://api.kku.ac.th/v1/network/subnets" />
                <input type="password" bind:value={cfgIpSyncKey} class="input-field" placeholder="Bearer Token (Optional)" style="margin-top: 4px;" />
              </div>
              <hr class="ds-divider" />
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size:12px; color:var(--text-muted);">{apiTestStatus.ipsync.msg || 'Sync Disabled'}</span>
                <button class="ds-btn sm" on:click={() => testApiConnection('ipsync')} disabled={apiTestStatus.ipsync.loading}>
                  {#if apiTestStatus.ipsync.loading}
                    <span class="mini-spin"></span> Testing...
                  {:else}
                    <i class="ti ti-refresh"></i> Test & Sync
                  {/if}
                </button>
              </div>
            </div>
          </div>
          
          <div style="grid-column: 1/-1; display:flex; justify-content:flex-end; gap:10px; align-items:center; margin-top: 10px;">
            {#if configSaved}
              <span style="color:var(--green); font-size:13px; font-weight:600;"><i class="ti ti-check"></i> บันทึกการตั้งค่าระบบเรียบร้อย</span>
            {/if}
            <button class="ds-btn primary" on:click={saveConfig}>
              <i class="ti ti-device-floppy"></i> Save Configurations
            </button>
          </div>
        </div>

      {:else if activeTab === 'ai'}
        <div class="tab-header">
          <h2>AI Analyst Settings</h2>
          <p>Configure Gemini LLM and adjust prompt templates for automated investigations.</p>
        </div>
        <div class="config-grid">
          <div class="ds-card">
            <div class="ds-card-head">
              <div class="ds-card-title"><i class="ti ti-brain"></i> Gemini Integration</div>
            </div>
            <div class="config-section">
              <div class="config-row" style="flex-direction: column; align-items: stretch; gap: 8px;">
                <div class="config-label">
                  <div class="config-name">Google Gemini AI API Key</div>
                  <div class="config-desc">API Key สำหรับใช้งาน SOC AI Analyst (ขึ้นต้นด้วย AIzaSy...)</div>
                </div>
                <input type="password" bind:value={cfgGeminiKey} class="input-field" placeholder="Gemini API Key" />
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                  <span style="font-size:12px; color:var(--text-muted);">
                    {apiTestStatus.gemini.msg || 'AI Analysis Disabled'}
                  </span>
                  <button class="ds-btn sm" on:click={() => testApiConnection('gemini')} disabled={apiTestStatus.gemini.loading}>
                    {#if apiTestStatus.gemini.loading}
                      <span class="mini-spin"></span> Verifying...
                    {:else}
                      <i class="ti ti-plug"></i> Verify Token
                    {/if}
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div class="ds-card">
            <div class="ds-card-head">
              <div class="ds-card-title"><i class="ti ti-message-chatbot"></i> Prompt Engineering</div>
            </div>
            <div class="config-section">
              <div class="config-row">
                <div class="config-label">
                  <div class="config-name">Base System Prompt</div>
                  <div class="config-desc">คำสั่งตั้งต้นสำหรับปรับบุคลิกและรูปแบบ Report ของ AI (Coming Soon)</div>
                </div>
                <button class="ds-btn sm" disabled>Edit Prompts</button>
              </div>
            </div>
          </div>
          
          <div style="grid-column: 1/-1; display:flex; justify-content:flex-end; gap:10px; align-items:center; margin-top: 10px;">
            {#if configSaved}
              <span style="color:var(--green); font-size:13px; font-weight:600;"><i class="ti ti-check"></i> บันทึกการตั้งค่าระบบเรียบร้อย</span>
            {/if}
            <button class="ds-btn primary" on:click={saveConfig}>
              <i class="ti ti-device-floppy"></i> Save Configurations
            </button>
          </div>
        </div>

      {:else if activeTab === 'audit'}
        <div class="tab-header">
          <h2>Audit & Compliance</h2>
          <p>Review system access logs and analyst actions for accountability.</p>
        </div>
        <div class="ds-card" style="padding:0; overflow:hidden;">
          <div class="ds-card-head" style="padding:16px 20px; border-bottom:1px solid var(--border);">
            <div class="ds-card-title"><i class="ti ti-history"></i> Login Audit Log ({filteredSessions.length})</div>
            <div style="display:flex; gap:8px; align-items:center;">
              <div class="ds-search" style="min-width:200px; display:flex; align-items:center; gap:8px; background:var(--bg-deep); border:1px solid var(--border); padding:6px 12px; border-radius:6px;">
                <i class="ti ti-search" style="color:var(--text-muted);"></i>
                <input type="text" bind:value={sessionFilter} placeholder="Search user or IP..." on:input={() => currentPage = 1} style="background:transparent; border:none; outline:none; color:var(--text-primary); font-size:12px; width:100%;" />
              </div>
              <button class="ds-btn sm" on:click={loadSessions}><i class="ti ti-refresh"></i> Refresh</button>
            </div>
          </div>
          {#if sessionLoading}
            <div class="ds-empty" style="padding:3rem;">Loading audit log...</div>
          {:else}
            <div class="ds-table-wrap">
              <table class="ds-table">
                <thead><tr><th>Time</th><th>User</th><th>IP Address</th><th>User Agent</th><th>Status</th></tr></thead>
                <tbody>
                  {#each paginatedSessions as s}
                    <tr>
                      <td style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted);">{formatEventTime(s.createdAt)}</td>
                      <td style="font-weight:600; font-size:13px; color:var(--text-primary);">{s.username}</td>
                      <td style="font-family:var(--font-mono); font-size:12px; color:var(--text-muted);">{s.ip}</td>
                      <td style="font-size:11px; color:var(--text-muted); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title={s.userAgent}>{s.userAgent}</td>
                      <td>
                        <span class="ds-badge {s.success ? 'green' : 'red'}">
                          {#if s.success}<i class="ti ti-check"></i> Success{:else}<i class="ti ti-x"></i> Failed{/if}
                        </span>
                      </td>
                    </tr>
                  {/each}
                  {#if paginatedSessions.length === 0}
                    <tr><td colspan="5" class="ds-empty">No login records found</td></tr>
                  {/if}
                </tbody>
              </table>
            </div>
            {#if totalPages > 1}
              <div class="ds-pagination">
                <button on:click={prevPage} disabled={currentPage === 1}><i class="ti ti-chevron-left"></i></button>
                <span>{currentPage} / {totalPages}</span>
                <button on:click={nextPage} disabled={currentPage === totalPages}><i class="ti ti-chevron-right"></i></button>
              </div>
            {/if}
          {/if}
        </div>

      {:else if activeTab === 'health'}
        <div class="tab-header">
          <h2>SIEM Platform Health & Storage</h2>
          <p>Monitor system metrics, disk usage for log retention, and ingestion rates.</p>
        </div>
        
        <div class="health-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 20px;">
          <!-- CPU -->
          <div class="ds-card" style="padding: 20px; text-align: center;">
            <h4 style="margin:0 0 10px 0; color:var(--text-muted); font-size:12px; text-transform:uppercase;">CPU Usage</h4>
            <div style="font-size:32px; font-weight:800; color:#10b981;">24%</div>
            <div style="width:100%; height:4px; background:var(--bg-deep); margin-top:10px; border-radius:2px;">
              <div style="width:24%; height:100%; background:#10b981; border-radius:2px;"></div>
            </div>
          </div>
          <!-- RAM -->
          <div class="ds-card" style="padding: 20px; text-align: center;">
            <h4 style="margin:0 0 10px 0; color:var(--text-muted); font-size:12px; text-transform:uppercase;">Memory (RAM)</h4>
            <div style="font-size:32px; font-weight:800; color:#f59e0b;">68%</div>
            <div style="width:100%; height:4px; background:var(--bg-deep); margin-top:10px; border-radius:2px;">
              <div style="width:68%; height:100%; background:#f59e0b; border-radius:2px;"></div>
            </div>
          </div>
          <!-- Disk -->
          <div class="ds-card" style="padding: 20px; text-align: center;">
            <h4 style="margin:0 0 10px 0; color:var(--text-muted); font-size:12px; text-transform:uppercase;">Disk Storage (Logs)</h4>
            <div style="font-size:32px; font-weight:800; color:#f43f5e;">89%</div>
            <div style="width:100%; height:4px; background:var(--bg-deep); margin-top:10px; border-radius:2px;">
              <div style="width:89%; height:100%; background:#f43f5e; border-radius:2px;"></div>
            </div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:8px;">Warning: 90-day retention at risk</div>
          </div>
        </div>

        <div class="ds-card" style="margin-bottom: 20px;">
          <div class="ds-card-head">
            <div class="ds-card-title"><i class="ti ti-activity"></i> Log Ingestion Rate (EPS)</div>
          </div>
          <div class="ds-card-body" style="padding: 20px; display:flex; align-items:center; gap:30px;">
            <div style="flex-shrink:0;">
              <div style="font-size:42px; font-weight:900; color:var(--color-cyan);">1,245</div>
              <div style="font-size:12px; font-weight:600; color:var(--text-muted); text-transform:uppercase;">Events Per Second</div>
            </div>
            <div style="flex:1; height:60px; display:flex; align-items:flex-end; gap:4px;">
              <!-- Mock Bar Chart -->
              <div style="width:10%; height:40%; background:rgba(6, 182, 212, 0.4); border-radius:4px 4px 0 0;"></div>
              <div style="width:10%; height:60%; background:rgba(6, 182, 212, 0.5); border-radius:4px 4px 0 0;"></div>
              <div style="width:10%; height:30%; background:rgba(6, 182, 212, 0.4); border-radius:4px 4px 0 0;"></div>
              <div style="width:10%; height:80%; background:rgba(6, 182, 212, 0.7); border-radius:4px 4px 0 0;"></div>
              <div style="width:10%; height:90%; background:rgba(6, 182, 212, 0.9); border-radius:4px 4px 0 0;"></div>
              <div style="width:10%; height:50%; background:rgba(6, 182, 212, 0.4); border-radius:4px 4px 0 0;"></div>
              <div style="width:10%; height:75%; background:rgba(6, 182, 212, 0.6); border-radius:4px 4px 0 0;"></div>
              <div style="width:10%; height:100%; background:var(--color-cyan); border-radius:4px 4px 0 0;"></div>
            </div>
          </div>
        </div>

        <div class="ds-card">
          <div class="about-hero" style="padding:20px;">
            <div class="about-logo"><i class="ti ti-radar"></i></div>
            <div class="about-name">KKUSIEM Security Platform</div>
            <div class="about-version">Enterprise SOC Edition v2.0.0</div>
            <div class="info-rows" style="margin-top:20px;">
              <div class="info-row"><span>Platform Core</span><strong>NestJS + SvelteKit</strong></div>
              <div class="info-row"><span>Database</span><strong>SQLite (TypeORM)</strong></div>
              <div class="info-row"><span>Realtime</span><strong>Socket.IO WebSocket</strong></div>
            </div>
          </div>
        </div>
      {/if}
    </div>

  </main>
</div>

{#if pwModal.open}
  <div class="modal-overlay" on:click={() => pwModal.open = false}>
    <div class="modal-box" on:click|stopPropagation>
      <div class="modal-head">
        <div class="modal-title"><i class="ti ti-key"></i> Edit Password</div>
        <button class="modal-close" on:click={() => pwModal.open = false}><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body">
        <div class="modal-user-chip">
          <div class="avatar {pwModal.user.role}">{pwModal.user.username.charAt(0).toUpperCase()}</div>
          {pwModal.user.username}
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:6px;">New Password</label>
          <input type="text" bind:value={pwModal.newPassword} class="input-field" placeholder="Enter new strong password" />
        </div>
        {#if pwModal.msg}
          <div class="msg {pwModal.msgType}">{pwModal.msg}</div>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="ds-btn sm" on:click={() => pwModal.open = false}>Cancel</button>
        <button class="ds-btn sm primary" on:click={savePassword} disabled={pwModal.loading}>
          {#if pwModal.loading}<span class="mini-spin"></span>{/if} Save Password
        </button>
      </div>
    </div>
  </div>
{/if}

{#if resetModal.open}
  <div class="modal-overlay" on:click={() => resetModal.open = false}>
    <div class="modal-box" on:click|stopPropagation>
      <div class="modal-head">
        <div class="modal-title"><i class="ti ti-mail-forward"></i> Send Password Reset Link</div>
        <button class="modal-close" on:click={() => resetModal.open = false}><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px; color:var(--text-muted); line-height:1.5;">
          You are about to send a password reset link to the following user. They will receive an email with instructions.
        </p>
        <div class="modal-user-chip" style="background:var(--bg-deep);">
          <div class="avatar {resetModal.user.role}">{resetModal.user.username.charAt(0).toUpperCase()}</div>
          <div style="display:flex; flex-direction:column;">
            <span>{resetModal.user.username}</span>
            <span style="font-size:11px; color:var(--text-muted); font-weight:normal;">{resetModal.user.username}@security.local</span>
          </div>
        </div>
        
        <div style="background:rgba(59, 130, 246, 0.05); border:1px solid rgba(59, 130, 246, 0.2); padding:12px; border-radius:8px;">
          <label style="display:block; font-size:11px; font-weight:700; color:#3b82f6; text-transform:uppercase; margin-bottom:4px;">Sender Details (Official)</label>
          <div style="font-size:13px; color:var(--text-primary);">
            <strong>From:</strong> SOC Command Center &lt;no-reply@soc-siem.local&gt;
          </div>
          <div style="font-size:13px; color:var(--text-primary); margin-top:4px;">
            <strong>Subject:</strong> Action Required: Password Reset Request
          </div>
        </div>

        {#if resetModal.msg}
          <div class="msg {resetModal.msgType}">{resetModal.msg}</div>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="ds-btn sm" on:click={() => resetModal.open = false} disabled={resetModal.loading}>Cancel</button>
        <button class="ds-btn sm primary" style={resetModal.sent ? "background:#10b981; border-color:#10b981; color:#fff;" : ""} on:click={sendResetEmail} disabled={resetModal.loading || resetModal.sent}>
          {#if resetModal.loading}
            <span class="mini-spin"></span> Sending...
          {:else if resetModal.sent}
            <i class="ti ti-check"></i> Sent Successfully
          {:else}
            <i class="ti ti-send"></i> Send Email
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<div class="toast-container">
  {#each toasts as t (t.id)}
    <div class="toast {t.type}">
      <i class="ti {t.type === 'success' ? 'ti-check' : t.type === 'error' ? 'ti-x' : 'ti-info-circle'}"></i>
      <span>{t.msg}</span>
    </div>
  {/each}
</div>

<style>
  .settings-layout { display: grid; grid-template-columns: 260px 1fr; gap: 0; height: 100%; background: var(--bg-deep); border: 1px solid var(--border); border-radius: var(--radius-xl); overflow: hidden; }
  .settings-sidebar { background: var(--bg-panel); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
  .sidebar-header { padding: 24px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; }
  .sidebar-header i { font-size: 28px; color: var(--color-cyan); }
  .sidebar-header h3 { margin: 0; font-size: 16px; font-weight: 800; color: var(--text-primary); }
  .sidebar-header p { margin: 2px 0 0 0; font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .sidebar-nav { flex: 1; overflow-y: auto; padding: 16px 12px; display: flex; flex-direction: column; gap: 4px; }
  .nav-group { font-size: 10px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin: 16px 0 4px 8px; }
  .nav-group:first-child { margin-top: 0; }
  .nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: transparent; border: none; border-radius: 8px; color: var(--text-secondary); font-size: 13px; font-weight: 600; cursor: pointer; text-align: left; transition: all 0.2s; }
  .nav-item i { font-size: 16px; color: var(--text-muted); transition: 0.2s; }
  .nav-item:hover { background: var(--bg-surface-hover); color: var(--text-primary); }
  .nav-item:hover i { color: var(--color-cyan); }
  .nav-item.active { background: rgba(6, 182, 212, 0.1); color: var(--color-cyan); }
  .nav-item.active i { color: var(--color-cyan); }
  .settings-content { background: var(--bg-deep); overflow-y: auto; padding: 32px 40px; }
  .content-wrapper { max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }
  .tab-header { margin-bottom: 8px; }
  .tab-header h2 { margin: 0; font-size: 22px; font-weight: 800; color: var(--text-primary); }
  .tab-header p { margin: 4px 0 0 0; font-size: 13px; color: var(--text-muted); }
  .config-grid, .about-grid { display: flex; flex-direction: column; gap: 20px; }
  .ds-card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
  .ds-card-head { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
  .ds-card-title { font-size: 14px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 8px; }
  .ds-card-title i { color: var(--color-cyan); font-size: 16px; }
  .config-section { display: flex; flex-direction: column; gap: 0; padding: 0 20px; }
  .config-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; }
  .config-name { font-size: 13px; font-weight: 700; color: var(--text-primary); }
  .config-desc { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
  .config-control { display: flex; align-items: center; gap: 8px; }
  .ds-divider { border: 0; border-top: 1px solid var(--border); margin: 0; }
  .input-field { background: var(--bg-deep); border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; color: var(--text-primary); font-size: 13px; outline: none; width: 100%; transition: 0.2s; box-sizing: border-box; }
  .input-field:focus { border-color: var(--color-cyan); box-shadow: 0 0 0 2px rgba(6, 182, 212, 0.2); }
  .ds-btn { background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; }
  .ds-btn:hover:not([disabled]) { background: var(--bg-surface-hover); border-color: var(--text-muted); }
  .ds-btn[disabled] { opacity: 0.5; cursor: not-allowed; }
  .ds-btn.sm { padding: 6px 12px; font-size: 12px; }
  .ds-btn.primary { background: var(--color-cyan); color: #000; border-color: var(--color-cyan); }
  .ds-btn.primary:hover:not([disabled]) { box-shadow: 0 0 12px rgba(6, 182, 212, 0.4); }
  .toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: var(--border); border-radius: 24px; transition: 0.3s; border: 1px solid var(--border); }
  .slider:before { position: absolute; content: ''; width: 18px; height: 18px; left: 3px; bottom: 2px; background: white; border-radius: 50%; transition: 0.3s; }
  .toggle input:checked + .slider { background: var(--color-cyan); border-color: var(--color-cyan); }
  .toggle input:checked + .slider:before { transform: translateX(19px); }
  .ds-table-wrap { overflow-x: auto; }
  .ds-table { width: 100%; border-collapse: collapse; text-align: left; }
  .ds-table th { padding: 12px 20px; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; border-bottom: 1px solid var(--border); background: var(--bg-surface); }
  .ds-table td { padding: 12px 20px; font-size: 13px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  .ds-table tr:hover td { background: var(--bg-surface-hover); }
  .ds-empty { padding: 40px; text-align: center; color: var(--text-muted); font-size: 13px; font-style: italic; }
  .user-row { display: flex; align-items: center; gap: 12px; }
  .avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; }
  .avatar.admin { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
  .avatar.user, .avatar.guest { background: var(--bg-surface); color: var(--text-secondary); border: 1px solid var(--border); }
  .sso-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; color: #a855f7; background: rgba(168, 85, 247, 0.1); border-radius: 4px; padding: 2px 6px; margin-top: 4px; }
  .sso-pw-label { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #a855f7; }
  .ds-badge { padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; }
  .ds-badge.green { background: rgba(16, 185, 129, 0.1); color: #10b981; }
  .ds-badge.red { background: rgba(244, 63, 94, 0.1); color: #f43f5e; }
  .ds-badge.blue { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
  .ds-badge.gray { background: var(--bg-surface); color: var(--text-muted); border: 1px solid var(--border); }
  .pw-reveal-wrap { display: flex; align-items: center; gap: 8px; }
  .pw-value { font-family: var(--font-mono); font-size: 12px; background: var(--bg-deep); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; color: var(--text-primary); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pw-eye-sm { background: none; border: 1px solid var(--border); border-radius: 6px; color: var(--text-muted); cursor: pointer; padding: 4px 6px; transition: 0.2s; }
  .pw-eye-sm:hover { color: var(--color-cyan); border-color: var(--color-cyan); }
  .ds-pagination { display: flex; justify-content: center; align-items: center; gap: 16px; padding: 16px; border-top: 1px solid var(--border); }
  .ds-pagination button { background: none; border: none; color: var(--text-primary); cursor: pointer; font-size: 16px; }
  .ds-pagination button[disabled] { opacity: 0.3; cursor: not-allowed; }
  .ds-pagination span { font-size: 12px; font-weight: 700; color: var(--text-muted); }
  .modal-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 20px; animation: fadeIn 0.2s; }
  .modal-box { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; width: 100%; max-width: 400px; box-shadow: 0 24px 48px rgba(0,0,0,0.5); overflow: hidden; }
  .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
  .modal-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; color: var(--text-primary); }
  .modal-title i { color: var(--color-cyan); font-size: 18px; }
  .modal-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; padding: 4px; transition: 0.2s; }
  .modal-close:hover { color: var(--color-rose); }
  .modal-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
  .modal-user-chip { display: flex; align-items: center; gap: 10px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; font-size: 14px; font-weight: 600; color: var(--text-primary); }
  .modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 20px; border-top: 1px solid var(--border); background: var(--bg-surface); }
  .mini-spin { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  .msg { padding: 10px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; }
  .msg.success { background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); }
  .msg.error { background: rgba(244, 63, 94, 0.1); color: #f43f5e; border: 1px solid rgba(244, 63, 94, 0.2); }
  .about-hero { text-align: center; padding: 32px 0 24px; }
  .about-logo { width: 72px; height: 72px; border-radius: 20px; background: rgba(6, 182, 212, 0.1); color: var(--color-cyan); display: flex; align-items: center; justify-content: center; font-size: 36px; margin: 0 auto 16px; border: 1px solid rgba(6, 182, 212, 0.2); }
  .about-name { font-size: 20px; font-weight: 800; color: var(--text-primary); }
  .about-version { font-size: 13px; font-weight: 600; color: var(--text-muted); margin-top: 4px; }
  .info-rows { display: flex; flex-direction: column; border-top: 1px solid var(--border); margin-top: 16px; }
  .info-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-bottom: 1px solid var(--border); font-size: 13px; }
  .info-row span { color: var(--text-muted); }
  .module-list { display: flex; flex-direction: column; }
  .module-item { display: flex; align-items: center; gap: 16px; padding: 16px 20px; border-bottom: 1px solid var(--border); }
  .module-item:last-child { border-bottom: none; }
  .module-icon { width: 40px; height: 40px; border-radius: 10px; background: rgba(6, 182, 212, 0.1); color: var(--color-cyan); display: flex; align-items: center; justify-content: center; font-size: 20px; border: 1px solid rgba(6, 182, 212, 0.2); flex-shrink: 0; }
  .module-info { flex: 1; }
  .module-name { font-size: 14px; font-weight: 700; color: var(--text-primary); }
  .module-desc { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
  .custom-scrollbar::-webkit-scrollbar { width: 6px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
</style>
