<script lang="ts">
  import { roleStore } from '../../../stores/events';
  export let usernameStore: any = null; // Passed from parent if needed, or local
  
  function getRoleInfo(r: string) {
    if (r === 'admin') return { label: 'Administrator', icon: 'ti-shield-lock' };
    if (r === 'analyst') return { label: 'Security Analyst', icon: 'ti-eyeglass' };
    return { label: 'Guest Observer', icon: 'ti-eye' };
  }
  
  let isSso = false;
  let profileForm = { firstname: 'System', lastname: 'Admin', email: 'admin@kku.ac.th' };
  let isSavingProfile = false;
  let isDirty = false;
  
  async function saveProfile() {
    isSavingProfile = true;
    await new Promise(r => setTimeout(r, 400));
    isDirty = false;
    isSavingProfile = false;
    alert('Profile updated successfully');
  }
</script>

<div class="content-header">
        <div class="content-header-icon" style="background: rgba(59,130,246,0.12); color: #3b82f6;">
          <i class="ti ti-user-circle"></i>
        </div>
        <div>
          <h2>My Profile</h2>
          <p>Manage your display name and contact information</p>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <span class="panel-label"><i class="ti ti-id-badge"></i> Identity</span>
        </div>
        <div class="panel-body">
          {#if isSso}
            <div class="info-banner">
              <i class="ti ti-info-circle"></i>
              Your profile is managed by <strong>KKU SSO</strong>. Contact IT to update your details.
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Display Name</label>
                <input class="st-input" type="text" value={profileForm.firstname + ' ' + profileForm.lastname} disabled />
              </div>
              <div class="form-group">
                <label>Email Address</label>
                <input class="st-input" type="email" value={profileForm.email} disabled />
              </div>
            </div>
          {:else}
            <div class="form-row">
              <div class="form-group">
                <label>First Name</label>
                <input class="st-input" type="text" bind:value={profileForm.firstname} on:input={() => isDirty = true} placeholder="First name" />
              </div>
              <div class="form-group">
                <label>Last Name</label>
                <input class="st-input" type="text" bind:value={profileForm.lastname} on:input={() => isDirty = true} placeholder="Last name" />
              </div>
            </div>
            <div class="form-group" style="margin-top: 12px;">
              <label>Email Address</label>
              <input class="st-input" type="email" bind:value={profileForm.email} on:input={() => isDirty = true} />
            </div>
            <div class="form-actions">
              <button class="btn-primary" on:click={saveProfile} disabled={isSavingProfile}>
                {#if isSavingProfile}<i class="ti ti-loader ti-spin"></i>{:else}<i class="ti ti-device-floppy"></i>{/if}
                Save Profile
              </button>
            </div>
          {/if}
        </div>
      </div>

      <div class="panel" style="margin-top: 16px;">
        <div class="panel-head">
          <span class="panel-label"><i class="ti ti-building-community"></i> Account Type</span>
        </div>
        <div class="panel-body">
          <div class="account-type-row">
            <div class="account-type-icon" style="{isSso ? 'background:rgba(59,130,246,0.12); color:#3b82f6;' : 'background:rgba(16,185,129,0.12); color:#10b981;'}">
              <i class="ti {isSso ? 'ti-building-university' : 'ti-lock'}"></i>
            </div>
            <div>
              <div style="font-weight: 600; font-size: 14px;">{isSso ? 'KKU SSO Account' : 'Local Account'}</div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                {isSso ? 'Authenticated via Khon Kaen University Single Sign-On' : 'Username and password managed locally'}
              </div>
            </div>
            <div style="margin-left: auto;">
              <span class="role-badge" style="background: rgba(99,102,241,0.12); color: #818cf8; border: 1px solid rgba(99,102,241,0.25);">
                {getRoleInfo($roleStore).label}
              </span>
            </div>
          </div>
        </div>
      </div>
    

    