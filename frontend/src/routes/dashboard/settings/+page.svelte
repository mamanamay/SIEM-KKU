<script lang="ts">
  import { onMount } from 'svelte';
  import { roleStore } from '../../../stores/events';

  let activeTab = 'login_audit';
  let sessions: any[] = [];
  let loading = true;
  
  // Pagination
  let currentPage = 1;
  const itemsPerPage = 30;

  async function fetchSessions() {
    try {
      loading = true;
      const res = await fetch('/api/auth/sessions');
      if (res.ok) {
        sessions = await res.json();
      }
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if ($roleStore === 'admin') {
      fetchSessions();
    }
  });

  $: totalPages = Math.ceil(sessions.length / itemsPerPage) || 1;
  $: {
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
  }
  
  $: paginatedSessions = sessions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  function prevPage() { if (currentPage > 1) currentPage--; }
  function nextPage() { if (currentPage < totalPages) currentPage++; }

</script>

<div style="display:flex;flex-direction:column;gap:16px;padding-bottom:2rem;">
  <div class="ds-card-head">
    <div class="ds-card-title"><i class="ti ti-settings"></i> System Settings</div>
  </div>
  
  {#if $roleStore !== 'admin'}
    <div class="ds-card ds-empty" style="padding: 4rem;">
      <i class="ti ti-lock" style="font-size: 3rem; color: var(--red); margin-bottom: 1rem;"></i>
      <h2 style="font-size: 1.5rem; margin-bottom: 0.5rem; color: var(--red);">Access Denied</h2>
      <p>You do not have permission to view System Settings.</p>
    </div>
  {:else}
    <div class="ds-filters">
      <button class="ds-btn {activeTab === 'login_audit' ? 'primary' : ''}" on:click={() => activeTab = 'login_audit'}>
        <i class="ti ti-history"></i> Login Audit
      </button>
      <button class="ds-btn {activeTab === 'general' ? 'primary' : ''}" on:click={() => activeTab = 'general'}>
        <i class="ti ti-adjustments"></i> General Settings
      </button>
    </div>

    {#if activeTab === 'login_audit'}
      <div class="ds-card" style="padding: 0; overflow: hidden;">
        <div class="ds-card-head" style="padding: 16px; border-bottom: 1px solid var(--border);">
          <div class="ds-card-title">User Login Sessions</div>
          <button class="ds-btn primary" on:click={fetchSessions}>⟳ Refresh</button>
        </div>
        
        {#if loading}
          <div class="ds-empty">Loading audit log...</div>
        {:else}
          <div class="ds-table-wrap">
            <table class="ds-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {#each paginatedSessions as s}
                  <tr>
                    <td>{new Date(s.timestamp).toLocaleString('en-GB')}</td>
                    <td class="ds-text-primary" style="font-weight: 600;">{s.username}</td>
                    <td>
                      {#if s.role === 'admin'}
                        <span class="ds-badge blue">Admin</span>
                      {:else}
                        <span class="ds-badge orange">Guest</span>
                      {/if}
                    </td>
                    <td class="ds-mono">{s.ipAddress}</td>
                  </tr>
                {/each}
                {#if sessions.length === 0}
                  <tr><td colspan="4" class="ds-empty">No login sessions recorded yet.</td></tr>
                {/if}
              </tbody>
            </table>
          </div>
          
          <!-- Pagination Controls -->
          {#if totalPages > 1}
          <div class="ds-pagination">
            <div class="ds-pagination-info">Page {currentPage} of {totalPages}</div>
            <div class="ds-pagination-btns">
              <button class="ds-page-btn" on:click={prevPage} disabled={currentPage === 1}>
                <i class="ti ti-chevron-left"></i> Previous
              </button>
              <button class="ds-page-btn" on:click={nextPage} disabled={currentPage === totalPages}>
                Next <i class="ti ti-chevron-right"></i>
              </button>
            </div>
          </div>
          {/if}
        {/if}
      </div>
    {:else}
      <div class="ds-card ds-empty" style="padding: 4rem;">
        <i class="ti ti-settings" style="font-size: 3rem; opacity: 0.2; margin-bottom: 1rem;"></i>
        <p>General settings module is currently under development.</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  /* All specific styles migrated to ds-* global classes */
</style>
