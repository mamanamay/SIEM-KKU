<svelte:head><title>System Settings - KKUSIEM</title></svelte:head>
<script lang="ts">
  import { onMount } from 'svelte';
  import { roleStore, usernameStore } from '../../../stores/events';
  import { get } from 'svelte/store';

  let activeTab = 'account';
  let isSaving = false;

  // Modals
  let show2FAModal = false;
  let showConfirmModal = false;
  let confirmAction: Function | null = null;
  let confirmTitle = '';
  let confirmDesc = '';
  let confirmDanger = false;

  // Account
    let webhookConfig = { slackUrl: "", teamsUrl: "", lineToken: "" };
  let showBackupModal = false;
  let generatedBackupCodes = [];
  let accountForm = { firstname: '', lastname: '', email: 'admin@kku.ac.th' };
  onMount(() => {
    const name = get(usernameStore) || 'System Admin';
    const parts = name.split(' ');
    accountForm.firstname = parts[0];
    accountForm.lastname = parts.slice(1).join(' ');
  });

  function saveProfile() {
    isSaving = true;
    setTimeout(() => {
      const fullName = `${accountForm.firstname} ${accountForm.lastname}`.trim();
      usernameStore.set(fullName);
      isSaving = false;
      alert('Profile updated! New reports will use this name.');
    }, 500);
  }

  // 2FA
  let twoFactorEnabled = false;
  let code2fa = ['', '', '', '', '', ''];
  
  function handle2FAInput(e: any, index: number) {
    const val = e.target.value.replace(/\D/g, '');
    code2fa[index] = val.slice(0, 1);
    if (val && index < 5) {
      document.getElementById('mfa-' + (index + 1))?.focus();
    }
  }
  function handle2FAKeyDown(e: KeyboardEvent, index: number) {
    if (e.key === 'Backspace' && !code2fa[index] && index > 0) {
      document.getElementById('mfa-' + (index - 1))?.focus();
    }
  }
    let qrCodeData = '';
  let setupMessage = '';
  let mfaSecret = '';

  async function start2FASetup() {
    isSaving = true;
    setupMessage = '';
    const un = localStorage.getItem('username') || 'admin';
    try {
      // 1. Init 2FA (Sets pre_auth_token cookie)
      const resInit = await fetch(`/api/auth/users/${un}/init-2fa`, { method: 'POST' });
      if (!resInit.ok) throw new Error('Failed to init 2FA');

      // 2. Get QR Code
      const resSetup = await fetch('/api/auth/2fa/setup', { method: 'POST' });
      if (!resSetup.ok) throw new Error('Failed to load QR Code');
      const setupData = await resSetup.json();
      
      qrCodeData = setupData.qrCodeDataUrl;
      mfaSecret = setupData.secret;
      show2FAModal = true;
    } catch(err: any) {
      alert('Error: ' + err.message);
    }
    isSaving = false;
  }

  async function verify2FA() {
    isSaving = true;
    const code = code2fa.join('');
    try {
      const res = await fetch('/api/auth/2fa/setup/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Invalid code');
      
      twoFactorEnabled = true;
      show2FAModal = false;
      code2fa = ['', '', '', '', '', ''];
      
      if (data.backupCodes && data.backupCodes.length > 0) {
        generatedBackupCodes = data.backupCodes;
        showBackupModal = true;
      } else {
        alert('2FA Enabled successfully!');
      }
    } catch(err: any) {
      alert('Error verifying code: ' + err.message);
      code2fa = ['', '', '', '', '', ''];
      document.getElementById('mfa-0')?.focus();
    }
    isSaving = false;
  }

  async function disable2FA() {
    if(!confirm('Are you sure you want to disable 2FA? This reduces your account security.')) return;
    const un = localStorage.getItem('username') || 'admin';
    try {
      const res = await fetch(`/api/auth/users/${un}/disable-2fa`, { method: 'POST' });
      if(res.ok) {
        twoFactorEnabled = false;
        alert('2FA has been disabled.');
      }
    } catch(err: any) {
      alert('Failed to disable 2FA');
    }
  }

  // System Configs
  let sysConfig = {
    retentionDays: 90,
    criticalThreshold: 85,
    autoBlockEnabled: true,
    alertEmail: 'soc@kku.ac.th',
    autoLogout: 30
  };

  function promptSaveConfig() {
    confirmTitle = 'Save System Configurations?';
    confirmDesc = 'These changes will affect how incidents are scored and retained across the platform.';
    confirmDanger = false;
    confirmAction = () => {
      isSaving = true;
      setTimeout(() => { isSaving = false; showConfirmModal = false; }, 600);
    };
    showConfirmModal = true;
  }

  // API Configs
  let apiConfig = {
    aiKey: 'kku-ai-secret-xyz-789',
    scorecardKey: 'sec-scorecard-live-112',
    networkMapApi: 'https://api.map.kku.ac.th/v1',
    aiApiUrl: '',
    scorecardApiUrl: ''
  };

  function promptSaveApi() {
    confirmTitle = 'Update API Integrations?';
    confirmDesc = 'These keys grant access to external KKU AI and mapping services.';
    confirmDanger = false;
    confirmAction = () => {
      isSaving = true;
      setTimeout(() => { isSaving = false; showConfirmModal = false; }, 600);
    };
    showConfirmModal = true;
  }

  // User Management
  let usersList = [
    { id: 1, name: 'Admin User', role: 'ADMIN', lastLogin: 'Just now', status: 'Active', type: 'Normal' },
    { id: 2, name: 'SOC Analyst', role: 'ANALYST', lastLogin: '2 hours ago', status: 'Active', type: 'KKU SSO' },
    { id: 3, name: 'Guest Viewer', role: 'VIEWER', lastLogin: '5 days ago', status: 'Inactive', type: 'Normal' }
  ];
  
  let newUser = { ssoWhitelist: false, username: '', password: '', role: 'VIEWER' };

  function promptDeleteUser(user: any) {
    confirmTitle = `Remove User ${user.name}?`;
    confirmDesc = `Are you sure you want to permanently delete this user? They will lose access to KKUSIEM immediately.`;
    confirmDanger = true;
    confirmAction = () => {
      isSaving = true;
      setTimeout(() => {
        usersList = usersList.filter(u => u.id !== user.id);
        isSaving = false;
        showConfirmModal = false;
      }, 500);
    };
    showConfirmModal = true;
  }

  function createUser() {
    if(!newUser.username) return alert('Username is required');
    usersList = [...usersList, {
      id: Date.now(),
      name: newUser.username.split('@')[0],
      role: newUser.role,
      lastLogin: 'Never',
      status: 'Active',
      type: newUser.ssoWhitelist ? 'KKU SSO' : 'Normal'
    }];
    newUser = { ssoWhitelist: false, username: '', password: '', role: 'VIEWER' };
    alert('User account created successfully!');
  }

  // Audit Trail
  let auditLogs = [
    { id: 'AD-991', user: 'Admin User', action: 'Modified System Config', resource: 'Thresholds', status: 'SUCCESS', ip: '10.0.0.5', time: new Date().toISOString(), type: 'Normal' },
    { id: 'AD-990', user: 'SOC Analyst', action: 'Executed Playbook', resource: 'Block IP', status: 'SUCCESS', ip: '10.0.0.12', time: new Date(Date.now() - 3600000).toISOString(), type: 'KKU SSO' },
    { id: 'AD-989', user: 'Unknown', action: 'Failed Login', resource: 'Authentication', status: 'FAILED', ip: '112.54.33.2', time: new Date(Date.now() - 7200000).toISOString(), type: 'Normal' }
  ];
</script>

<div class="settings-page">
  <div class="st-sidebar">
    <h2><i class="ti ti-settings"></i> Settings</h2>
    <div class="st-nav">
      <button class:active={activeTab === 'account'} on:click={() => activeTab = 'account'}><i class="ti ti-user"></i> My Account</button>
      <button class:active={activeTab === 'system'} on:click={() => activeTab = 'system'}><i class="ti ti-server"></i> System Configs</button>
      <button class:active={activeTab === 'api'} on:click={() => activeTab = 'api'}><i class="ti ti-api-app"></i> Configure API</button>
      <button class:active={activeTab === 'users'} on:click={() => activeTab = 'users'}><i class="ti ti-users"></i> Users & SSO</button>
      <button class:active={activeTab === 'audit'} on:click={() => activeTab = 'audit'}><i class="ti ti-clipboard-list"></i> Audit Trail</button>
    </div>
  </div>

  <div class="st-content custom-scrollbar">
    
    {#if activeTab === 'account'}
      <div class="st-panel">
        <div class="panel-head">
          <h3>Profile Details</h3>
          <p>Your personal information and report display name.</p>
        </div>
        <div class="panel-body">
          <div class="form-grid">
            <div class="form-group">
              <label>First Name</label>
              <input type="text" class="st-input" bind:value={accountForm.firstname} />
            </div>
            <div class="form-group">
              <label>Last Name</label>
              <input type="text" class="st-input" bind:value={accountForm.lastname} />
            </div>
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" class="st-input" bind:value={accountForm.email} />
            </div>
          </div>
          <div style="margin-top: 24px;">
            <button class="st-btn primary" on:click={saveProfile} disabled={isSaving}>
              {#if isSaving}<i class="ti ti-loader ti-spin"></i>{:else}<i class="ti ti-device-floppy"></i>{/if} Save Profile
            </button>
          </div>
        </div>
      </div>

      <div class="st-panel">
        <div class="panel-head">
          <h3>Two-Factor Authentication (2FA)</h3>
          <p>Add an extra layer of security to your account.</p>
        </div>
        <div class="panel-body">
          {#if twoFactorEnabled}
            <div class="badge green" style="margin-bottom: 12px; font-size: 14px; padding: 8px 12px;"><i class="ti ti-shield-check"></i> 2FA is Currently Enabled</div>
            <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 16px;">Your account is protected with Authenticator App codes.</p>
            <button class="st-btn outline" on:click={disable2FA}>Disable 2FA</button>
          {:else}
            <div class="badge red" style="margin-bottom: 12px; font-size: 14px; padding: 8px 12px;"><i class="ti ti-shield-x"></i> 2FA is Disabled</div>
            <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 16px;">We highly recommend enabling 2FA for administrative accounts.</p>
            <button class="st-btn primary" on:click={start2FASetup} disabled={isSaving}>Setup 2FA Now</button>
          {/if}
        </div>
      </div>
    {/if}

    {#if activeTab === 'system'}
      <div class="st-panel">
        <div class="panel-head">
          <h3>Global Event Settings</h3>
          <p>Configure how KKUSIEM handles and retains data.</p>
        </div>
        <div class="panel-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Data Retention (Days)</label>
              <input type="number" class="st-input" bind:value={sysConfig.retentionDays} />
            </div>
            <div class="form-group">
              <label>Critical Threat Threshold (Score)</label>
              <input type="number" class="st-input" bind:value={sysConfig.criticalThreshold} />
            </div>
            <div class="form-group">
              <label>SOC Alert Email Group</label>
              <input type="text" class="st-input" bind:value={sysConfig.alertEmail} />
            </div>
          </div>
          <div class="form-group checkbox-wrap" style="margin-top: 20px;">
            <input type="checkbox" id="autoblock" bind:checked={sysConfig.autoBlockEnabled} />
            <label for="autoblock">Enable Auto-Block via WAF Playbook for Critical Threats</label>
          </div>
        </div>
      </div>

      <div class="st-panel">
        <div class="panel-head">
          <h3 style="color:#10b981;"><i class="ti ti-lock"></i> SESSION & SECURITY</h3>
        </div>
        <div class="panel-body">
          <div class="form-group" style="flex-direction:row; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2); padding:20px; border-radius:8px; border:1px solid var(--border);">
            <div>
              <div style="font-weight:600; font-size:14px; color:#fff;">Auto Logout Timeout</div>
              <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">???????? (????) ??????????????????????????????????????????????</div>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
              <input type="number" class="st-input" style="width:80px; text-align:center;" bind:value={sysConfig.autoLogout} />
              <span style="color:var(--text-muted); font-size:13px;">minutes</span>
            </div>
          </div>
          <div style="margin-top: 24px;">
            <button class="st-btn primary" on:click={promptSaveConfig}>Save Configurations</button>
          </div>
        </div>
      </div>
    {/if}

          {#if activeTab === 'api'}
        <div class="st-panel" style="margin-bottom: 24px;">
          <div class="panel-head">
            <h3 style="color:#a855f7;"><i class="ti ti-api-app"></i> Platform Integrations</h3>
            <p>Manage external API keys and endpoints for intelligent analysis.</p>
          </div>
          <div class="panel-body">
            <div class="form-grid">
              <div class="form-group">
                <label>KKU AI Endpoint URL</label>
                <input type="text" class="st-input" bind:value={apiConfig.aiApiUrl} />
              </div>
              <div class="form-group">
                <label>KKU AI API Key</label>
                <input type="password" class="st-input" bind:value={apiConfig.aiKey} />
              </div>
              <div class="form-group">
                <label>Scorecard Endpoint URL</label>
                <input type="text" class="st-input" bind:value={apiConfig.scorecardApiUrl} />
              </div>
              <div class="form-group">
                <label>Scorecard API Key</label>
                <input type="password" class="st-input" bind:value={apiConfig.scorecardKey} />
              </div>
              <div class="form-group" style="grid-column: 1 / -1;">
                <label>IP Network Map Endpoint URL</label>
                <input type="text" class="st-input" bind:value={apiConfig.networkMapApi} />
              </div>
            </div>
          </div>
        </div>

        <div class="st-panel">
          <div class="panel-head">
            <h3 style="color:#3b82f6;"><i class="ti ti-bell-ringing"></i> Webhook Notifications</h3>
            <p>Send critical alerts and playbook results to your team's communication channels.</p>
          </div>
          <div class="panel-body">
            <div class="form-group" style="margin-bottom:20px;">
              <label><i class="ti ti-brand-slack" style="color:#e01e5a;"></i> Slack Webhook URL</label>
              <input type="text" class="st-input" bind:value={webhookConfig.slackUrl} />
            </div>
            <div class="form-group" style="margin-bottom:20px;">
              <label><i class="ti ti-brand-teams" style="color:#6264a7;"></i> Microsoft Teams Webhook URL</label>
              <input type="text" class="st-input" bind:value={webhookConfig.teamsUrl} />
            </div>
            <div class="form-group" style="margin-bottom:20px;">
              <label><i class="ti ti-message-circle" style="color:#00c300;"></i> LINE Notify Token</label>
              <input type="password" class="st-input" bind:value={webhookConfig.lineToken} />
            </div>
            <div style="margin-top: 24px;">
              <button class="st-btn primary" on:click={promptSaveApi}>Save Integrations</button>
            </div>
          </div>
        </div>
      {/if}


    {#if activeTab === 'users'}
      <div class="form-grid">
        <!-- New Account Form -->
        <div class="st-panel">
          <div class="panel-head">
            <h3 style="color:#10b981;"><i class="ti ti-user-plus"></i> CREATE NEW ACCOUNT</h3>
          </div>
          <div class="panel-body">
            
            <div style="background:rgba(16,185,129,0.05); border:1px solid rgba(16,185,129,0.2); border-radius:8px; padding:16px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div style="color:#10b981; font-weight:600; font-size:14px; margin-bottom:4px;"><i class="ti ti-shield"></i> KKU SSO Whitelist</div>
                <div style="font-size:11px; color:var(--text-muted);">?????? KKU SSO ???????????????</div>
              </div>
              <label class="switch">
                <input type="checkbox" bind:checked={newUser.ssoWhitelist}>
                <span class="slider round"></span>
              </label>
            </div>

            <div class="form-group" style="margin-bottom:16px;">
              <label>USERNAME <span style="color:var(--text-muted);font-weight:normal;">(Email ???? - ???????????? SSO)</span></label>
              <input type="text" class="st-input" placeholder="e.g. user@anydomain.com" bind:value={newUser.username} />
            </div>

            <div class="form-group" style="margin-bottom:16px;">
              <label>PASSWORD <span style="color:var(--text-muted);font-weight:normal;">(????????????????????)</span></label>
              <div style="position:relative;">
                <input type="password" class="st-input" style="width:100%;" placeholder="Min 4 characters" bind:value={newUser.password} disabled={newUser.ssoWhitelist} />
                <i class="ti ti-eye" style="position:absolute; right:12px; top:12px; color:var(--text-muted);"></i>
              </div>
            </div>

            <div class="form-group" style="margin-bottom:24px;">
              <label>ROLE</label>
              <select class="st-input" bind:value={newUser.role}>
                <option value="VIEWER">Guest � Minimal Access</option>
                <option value="ANALYST">Analyst � Read & Respond</option>
                <option value="ADMIN">Admin � Full Control</option>
              </select>
              <div style="margin-top:8px; background:rgba(0,0,0,0.2); border-radius:6px; padding:10px; font-size:12px; color:var(--text-muted);">
                {#if newUser.role === 'VIEWER'} <i class="ti ti-user"></i> Guest: ?????????????????????? ?????????????????? {/if}
                {#if newUser.role === 'ANALYST'} <i class="ti ti-user-check"></i> Analyst: ??????? Log ??????? Playbook ??? {/if}
                {#if newUser.role === 'ADMIN'} <i class="ti ti-user-exclamation"></i> Admin: ???????????????? {/if}
              </div>
            </div>

            <button class="st-btn primary" style="width:100%; background:#10b981; color:#fff;" on:click={createUser}>
              <i class="ti ti-plus"></i> Create Account
            </button>
          </div>
        </div>

        <!-- User List -->
        <div class="st-panel">
          <div class="panel-head">
            <h3>Registered Users</h3>
          </div>
          <div class="panel-body" style="padding: 0;">
            <table class="st-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {#each usersList as u}
                  <tr>
                    <td>
                      <div style="font-weight:600; color:#fff;">{u.name}</div>
                      <div style="font-size:11px; color:var(--text-muted);">Last: {u.lastLogin}</div>
                    </td>
                    <td><div class="badge blue">{u.role}</div></td>
                    <td>
                      {#if u.type === 'KKU SSO'}
                        <div class="badge green"><i class="ti ti-brand-google"></i> SSO</div>
                      {:else}
                        <div class="badge gray"><i class="ti ti-key"></i> Normal</div>
                      {/if}
                    </td>
                    <td>
                      <div style="display:flex; align-items:center; gap:6px;">
                        <div style="width:8px; height:8px; border-radius:50%; background:{u.status==='Active'?'#10b981':'#64748b'};"></div>
                        {u.status}
                      </div>
                    </td>
                    <td>
                      <button class="icon-btn" style="color:#ef4444;" on:click={() => promptDeleteUser(u)}><i class="ti ti-trash"></i></button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    {/if}

    {#if activeTab === 'audit'}
      <div class="st-panel">
        <div class="panel-head">
          <h3>System Audit Trail</h3>
          <p>Immutable log of administrative and platform actions.</p>
        </div>
        <div class="panel-body" style="padding: 0;">
          <table class="st-table">
            <thead>
              <tr>
                <th>Log ID / Time</th>
                <th>User / Login Type</th>
                <th>Action & Resource</th>
                <th>Source IP</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {#each auditLogs as log}
                <tr>
                  <td>
                    <div style="font-family:monospace; color:#fff;">{log.id}</div>
                    <div style="font-size:11px; color:var(--text-muted);">{new Date(log.time).toLocaleString()}</div>
                  </td>
                  <td>
                    <div style="font-weight:600;">{log.user}</div>
                    <div style="font-size:11px; color:var(--text-muted);">{log.type}</div>
                  </td>
                  <td>
                    <div style="color:#fff;">{log.action}</div>
                    <div style="font-size:12px; color:var(--text-muted);">Target: {log.resource}</div>
                  </td>
                  <td style="font-family:monospace;">{log.ip}</td>
                  <td>
                    <div class="badge {log.status === 'SUCCESS' ? 'green' : 'red'}">{log.status}</div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

  </div>
</div>

<!-- Modals -->
{#if show2FAModal}
  <div class="modal-overlay">
    <div class="modal-box">
      <div class="modal-icon"><i class="ti ti-scan" style="font-size: 40px; color: #fff;"></i></div>
      <h3>Configure Authenticator</h3>
      <p style="margin-bottom: 12px;">Scan the QR code with Google Authenticator or Authy.</p>
      
            <div class="qr-placeholder" style="margin-bottom: 20px; background: white; padding: 10px;">
        {#if qrCodeData}
          <img src={qrCodeData} alt="QR Code" style="width:100%; height:100%;" />
        {:else}
          <i class="ti ti-qrcode" style="font-size: 80px; opacity:0.8;"></i>
        {/if}
      </div>
      <div style="font-size:11px; font-family:monospace; color:var(--text-muted); margin-bottom:20px; letter-spacing:1px;">SECRET: {mfaSecret || 'LOADING...'}</div>

      
      <p style="font-size:12px;">Enter the 6-digit code to verify:</p>
      <div class="mfa-inputs" style="margin-bottom: 24px;">
        {#each code2fa as val, i}
          <input type="text" id={`mfa-${i}`} maxlength="1" bind:value={code2fa[i]} 
            on:input={(e) => handle2FAInput(e, i)}
            on:keydown={(e) => handle2FAKeyDown(e, i)} />
        {/each}
      </div>
      
      <div class="modal-actions">
        <button class="st-btn outline" on:click={() => show2FAModal = false}>Cancel</button>
        <button class="st-btn primary" on:click={verify2FA} disabled={isSaving}>
          {#if isSaving}Verifying...{:else}Verify & Enable{/if}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showConfirmModal}
  <div class="modal-overlay">
    <div class="modal-box">
      <div class="modal-icon {confirmDanger ? 'danger' : 'warning'}">
        <i class="ti {confirmDanger ? 'ti-alert-triangle' : 'ti-info-circle'}"></i>
      </div>
      <h3>{confirmTitle}</h3>
      <p>{confirmDesc}</p>
      <div class="modal-actions">
        <button class="st-btn outline" on:click={() => showConfirmModal = false}>Cancel</button>
        <button class="st-btn {confirmDanger ? 'danger' : 'primary'}" on:click={() => confirmAction && confirmAction()} disabled={isSaving}>
          {#if isSaving}<i class="ti ti-loader ti-spin"></i>{:else}Confirm{/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Switch Toggle CSS */
  .switch { position: relative; display: inline-block; width: 40px; height: 20px; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(255,255,255,0.2); transition: .4s; border-radius: 20px; }
  .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .4s; border-radius: 50%; }
  input:checked + .slider { background-color: #10b981; }
  input:checked + .slider:before { transform: translateX(20px); }

  .settings-page { display: flex; height: 100%; max-width: 1400px; margin: 0 auto; padding: 24px; gap: 32px; font-family: 'Inter', sans-serif; color: #e8eaf0; }
  .st-sidebar { width: 280px; flex-shrink: 0; }
  .st-sidebar h2 { font-size: 24px; font-weight: 700; margin-bottom: 24px; display: flex; align-items: center; gap: 10px; }
  .st-nav { display: flex; flex-direction: column; gap: 8px; }
  .st-nav button { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: transparent; border: none; border-radius: 8px; color: var(--text-muted, #9ca3af); font-size: 14px; font-weight: 600; text-align: left; cursor: pointer; transition: 0.2s; }
  .st-nav button:hover { background: rgba(255,255,255,0.05); color: #fff; }
  .st-nav button.active { background: rgba(59, 130, 246, 0.1); color: #3b82f6; border-left: 3px solid #3b82f6; }
  
  .st-content { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 24px; padding-right: 12px; }
  .st-panel { background: var(--bg-panel, #181b24); border: 1px solid var(--border, rgba(255,255,255,0.1)); border-radius: 12px; overflow: hidden; }
  .panel-head { padding: 20px 24px; border-bottom: 1px solid var(--border); }
  .panel-head h3 { margin: 0 0 4px; font-size: 18px; color: #fff; display:flex; align-items:center; gap:8px;}
  .panel-head p { margin: 0; font-size: 13px; color: var(--text-muted); }
  .panel-body { padding: 24px; }
  
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .form-group { display: flex; flex-direction: column; gap: 8px; }
  .form-group label { font-size: 11px; font-weight: 700; color: var(--text-secondary); letter-spacing:0.5px;}
  .st-input { padding: 10px 14px; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; color: #fff; font-size: 13px; outline: none; transition: 0.2s; }
  .st-input:focus { border-color: #3b82f6; }
  .checkbox-wrap { flex-direction: row; align-items: center; gap: 12px; }
  .checkbox-wrap input { width: 18px; height: 18px; }
  
  .st-btn { padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: 0.2s; border: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
  .st-btn.primary { background: #3b82f6; color: white; }
  .st-btn.primary:hover { background: #2563eb; }
  .st-btn.primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .st-btn.outline { background: transparent; border: 1px solid var(--border); color: #fff; }
  .st-btn.outline:hover { background: rgba(255,255,255,0.05); }
  .st-btn.danger { background: #ef4444; color: white; }
  .st-btn.danger:hover { background: #dc2626; }
  .icon-btn { background: transparent; border: none; cursor: pointer; font-size: 18px; color: var(--text-muted); padding: 4px; border-radius: 4px; transition:0.2s; }
  .icon-btn:hover { background: rgba(255,255,255,0.1); }
  
  .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; }
  .badge.green { background: rgba(16, 185, 129, 0.1); color: #10b981; }
  .badge.red { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  .badge.blue { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
  .badge.gray { background: rgba(255, 255, 255, 0.1); color: #9ca3af; }
  
  .st-table { width: 100%; border-collapse: collapse; text-align: left; }
  .st-table th { padding: 12px 24px; font-size: 11px; font-weight: 700; color: var(--text-muted); border-bottom: 1px solid var(--border); background: rgba(0,0,0,0.2); text-transform:uppercase; letter-spacing:0.5px;}
  .st-table td { padding: 14px 24px; font-size: 13px; border-bottom: 1px solid var(--border); }
  
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; }
  .modal-box { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 16px; padding: 32px; width: 400px; max-width: 90%; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.3); }
  .modal-icon { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 16px; }
  .modal-icon.warning { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
  .modal-icon.danger { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  .modal-box h3 { margin: 0 0 12px; font-size: 20px; }
  .modal-box p { margin: 0 0 24px; font-size: 14px; color: var(--text-muted); line-height: 1.5; }
  .modal-actions { display: flex; justify-content: center; gap: 12px; }
  
  .qr-placeholder { background: white; color: black; width: 150px; height: 150px; margin: 0 auto; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .mfa-inputs { display: flex; justify-content: center; align-items: center; gap: 8px; }
  .mfa-inputs input { width: 40px; height: 50px; border-radius: 8px; border: 1px solid var(--border); background: rgba(0,0,0,0.3); color: white; font-size: 24px; text-align: center; font-weight: bold; outline: none; transition: 0.2s; }
  .mfa-inputs input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
  
  .custom-scrollbar::-webkit-scrollbar { width: 6px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
</style>














