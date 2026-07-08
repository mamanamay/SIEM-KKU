<script lang="ts">
  import { onMount } from 'svelte';
  import { roleStore } from '../../../stores/events';

  let users: any[] = [];
  let sessions: any[] = [];
  
  // Form State
  let newUsername = '';
  let newPassword = '';
  let newRole = 'guest';
  let message = '';
  let error = '';

  async function loadData() {
    try {
      const uRes = await fetch('/api/auth/users');
      if (uRes.ok) users = await uRes.json();
      
      const sRes = await fetch('/api/auth/sessions');
      if (sRes.ok) sessions = await sRes.json();
    } catch (err) {
      console.error(err);
    }
  }

  onMount(() => {
    if ($roleStore !== 'admin') {
      window.location.href = '/dashboard';
      return;
    }
    loadData();
  });

  async function handleCreateUser() {
    message = '';
    error = '';
    
    if (!newUsername || !newPassword) {
      error = 'Please fill in all fields';
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole })
      });
      
      const data = await res.json();
      if (res.ok) {
        message = 'User created successfully!';
        newUsername = '';
        newPassword = '';
        newRole = 'guest';
        loadData();
      } else {
        error = data.message || 'Failed to create user';
      }
    } catch (err) {
      error = 'Network error';
    }
  }

  async function deleteUser(username: string) {
    if (!confirm(`Are you sure you want to delete ${username}?`)) return;
    
    try {
      const res = await fetch(`/api/auth/users/${username}`, { method: 'DELETE' });
      const data = await res.json();
      
      if (res.ok) {
        loadData();
      } else {
        alert(data.message || 'Cannot delete user');
      }
    } catch (err) {
      alert('Network error');
    }
  }
</script>

<svelte:head>
  <title>User Management - Honeypot Command Center</title>
</svelte:head>

<div class="ds-page">
  <div class="ds-page-header">
    <div>
      <h1 class="ds-page-title"><i class="ti ti-users"></i> User Management</h1>
      <div class="ds-page-subtitle">Manage administrator and guest access accounts</div>
    </div>
  </div>

  <div class="grid-layout">
    <!-- Create User Form -->
    <div class="ds-card form-card">
      <div class="ds-card-head">
        <div class="ds-card-title"><i class="ti ti-user-plus"></i> Create New Account</div>
      </div>
      
      {#if message}
        <div class="alert alert-success">{message}</div>
      {/if}
      {#if error}
        <div class="alert alert-error">{error}</div>
      {/if}

      <form on:submit|preventDefault={handleCreateUser} class="form-container">
        <div class="form-group">
          <label>Username</label>
          <input type="text" bind:value={newUsername} class="ds-input" placeholder="Enter username" />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" bind:value={newPassword} class="ds-input" placeholder="Enter password" />
        </div>
        <div class="form-group">
          <label>Role</label>
          <select bind:value={newRole} class="ds-select">
            <option value="guest">Guest (View Only)</option>
            <option value="admin">Admin (Full Access)</option>
          </select>
        </div>
        <button type="submit" class="ds-btn primary w-full justify-center">
          <i class="ti ti-plus"></i> Create Account
        </button>
      </form>
    </div>

    <!-- User List -->
    <div class="ds-card">
      <div class="ds-card-head">
        <div class="ds-card-title"><i class="ti ti-list"></i> Active Accounts</div>
      </div>
      
      <div class="ds-table-wrap">
        <table class="ds-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each users as user}
              <tr>
                <td><strong>{user.username}</strong></td>
                <td>
                  <span class="ds-badge {user.role === 'admin' ? 'blue' : 'gray'}">
                    {user.role}
                  </span>
                </td>
                <td>
                  {#if user.username !== 'admin'}
                    <button class="ds-btn danger sm" on:click={() => deleteUser(user.username)}>
                      <i class="ti ti-trash"></i> Delete
                    </button>
                  {:else}
                    <span style="font-size: 11px; color: var(--text-muted);">System Default</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Login History -->
  <div class="ds-card mt-4">
    <div class="ds-card-head">
      <div class="ds-card-title"><i class="ti ti-history"></i> Login History</div>
    </div>
    
    <div class="ds-table-wrap" style="max-height: 400px; overflow-y: auto;">
      <table class="ds-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Username</th>
            <th>Role</th>
            <th>IP Address</th>
          </tr>
        </thead>
        <tbody>
          {#each sessions as session}
            <tr>
              <td class="ds-mono">{new Date(session.timestamp).toLocaleString('en-GB')}</td>
              <td><strong>{session.username}</strong></td>
              <td>
                <span class="ds-badge {session.role === 'admin' ? 'blue' : 'gray'}">
                  {session.role}
                </span>
              </td>
              <td class="ds-mono">{session.ipAddress}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

<style>
  .grid-layout {
    display: grid;
    grid-template-columns: 350px 1fr;
    gap: 16px;
  }
  
  @media (max-width: 900px) {
    .grid-layout { grid-template-columns: 1fr; }
  }

  .form-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form-group label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 6px;
  }

  .ds-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--text-primary);
    font-family: inherit;
    font-size: 13px;
    outline: none;
    transition: border-color 0.2s;
  }
  
  .ds-input:focus {
    border-color: var(--green);
  }

  .ds-select {
    width: 100%;
  }

  .w-full {
    width: 100%;
  }
  
  .justify-center {
    justify-content: center;
  }
  
  .mt-4 {
    margin-top: 16px;
  }

  .alert {
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 16px;
  }
  .alert-success { background: var(--green-bg); color: var(--green); }
  .alert-error { background: var(--red-bg); color: var(--red); }
</style>
