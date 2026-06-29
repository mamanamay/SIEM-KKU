<script lang="ts">
  import { roleStore, connectionState } from '../../../stores/events';
</script>

<div class="settings-page">
  <div class="panel">
    <div class="panel-header">
      <div class="panel-title"><i class="ti ti-server"></i> System Status</div>
      <div class="subtitle">Real-time connection and services</div>
    </div>
    
    <div class="settings-list">
      <div class="setting-item">
        <div class="setting-icon"><i class="ti ti-plug-connected"></i></div>
        <div class="setting-info">
          <div class="setting-name">WebSocket Sync</div>
          <div class="setting-desc">Status of the real-time event listener to NestJS backend</div>
        </div>
        <div class="setting-status">
          {#if $connectionState}
            <span class="badge ok">Connected</span>
          {:else}
            <span class="badge danger">Disconnected</span>
          {/if}
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-icon"><i class="ti ti-shield"></i></div>
        <div class="setting-info">
          <div class="setting-name">SSH Honeypot (Cowrie)</div>
          <div class="setting-desc">Port 2222 listening for SSH Brute Force</div>
        </div>
        <div class="setting-status">
          <span class="badge ok">Running</span>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-icon"><i class="ti ti-database"></i></div>
        <div class="setting-info">
          <div class="setting-name">Database (PostgreSQL)</div>
          <div class="setting-desc">Persistent storage for attack events</div>
        </div>
        <div class="setting-status">
          <span class="badge ok">Online</span>
        </div>
      </div>
    </div>
  </div>

  <div class="panel mt-4">
    <div class="panel-header">
      <div class="panel-title"><i class="ti ti-users"></i> Account & Permissions</div>
      <div class="subtitle">Manage your current session</div>
    </div>
    
    <div class="account-box">
      <div class="account-avatar">
        <i class="ti ti-user-shield"></i>
      </div>
      <div class="account-details">
        <div class="account-role">Current Role: <strong>{$roleStore}</strong></div>
        <div class="account-perms">
          {#if $roleStore === 'admin'}
            You have full access to view, filter, and <strong>Export</strong> all threat logs.
          {:else}
            You have read-only access. You cannot export or manage threat logs. Login as <strong>admin</strong> for full access.
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
.settings-page { max-width: 800px; margin: 0 auto; }
.mt-4 { margin-top: 16px; }

.panel {
  background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 1.5rem;
  box-shadow: var(--shadow-sm); display: flex; flex-direction: column;
}
.panel-header { margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1rem; }
.panel-title { font-size: 15px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px; }
.panel-title i { color: var(--text-secondary); font-size: 18px; }
.subtitle { font-size: 12px; color: var(--text-secondary); margin-top: 4px; padding-left: 26px; }

.settings-list { display: flex; flex-direction: column; gap: 16px; }
.setting-item { display: flex; align-items: center; gap: 16px; padding: 12px; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border); }
.setting-icon { width: 40px; height: 40px; border-radius: 8px; background: var(--bg-panel); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 20px; color: var(--text-secondary); flex-shrink: 0; }
.setting-info { flex: 1; }
.setting-name { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.setting-desc { font-size: 11px; color: var(--text-secondary); }
.setting-status { flex-shrink: 0; }

.badge { font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 20px; }
.badge.ok { background: var(--green-bg); color: var(--green); border: 1px solid rgba(29,158,117,0.3); }
.badge.danger { background: var(--red-bg); color: var(--red); border: 1px solid rgba(163,45,45,0.3); }

.account-box { display: flex; gap: 16px; align-items: flex-start; padding: 16px; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border); }
.account-avatar { width: 48px; height: 48px; border-radius: 50%; background: var(--green-bg); color: var(--green); display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
.account-details { flex: 1; }
.account-role { font-size: 14px; color: var(--text-primary); margin-bottom: 8px; }
.account-role strong { text-transform: uppercase; color: var(--green); }
.account-perms { font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
.account-perms strong { color: var(--text-primary); }
</style>
