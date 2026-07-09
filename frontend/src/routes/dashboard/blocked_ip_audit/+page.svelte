<script lang="ts">
  import { onMount } from 'svelte';
  import { roleStore } from '../../../stores/events';
  
  let blockedList: any[] = [];
  let searchText = '';

  // Pagination
  let currentPage = 1;
  const itemsPerPage = 30;

  async function fetchBlockedIPs() {
    try {
      const res = await fetch('/api/attacks/blocked-ips');
      const data = await res.json();
      blockedList = data;
    } catch (e) {
      console.error("Error fetching blocked IPs", e);
    }
  }

  async function unblockIP(ip: string) {
    try {
      const res = await fetch('/api/attacks/unblock-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip })
      });
      if (res.ok) {
        await fetchBlockedIPs();
      }
    } catch (err) {
      console.error(err);
    }
  }

  onMount(() => {
    fetchBlockedIPs();
    // Poll every 5 seconds
    const interval = setInterval(fetchBlockedIPs, 5000);
    return () => clearInterval(interval);
  });

  $: filteredList = blockedList.filter(b => 
    !searchText || b.ip.toLowerCase().includes(searchText.toLowerCase())
  );

  $: totalPages = Math.ceil(filteredList.length / itemsPerPage) || 1;
  // Ensure currentPage is within bounds
  $: {
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
  }
  
  $: paginatedList = filteredList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  function prevPage() {
    if (currentPage > 1) currentPage--;
  }

  function nextPage() {
    if (currentPage < totalPages) currentPage++;
  }
</script>

<div style="display:flex;flex-direction:column;gap:14px;padding-bottom:2rem">

  <!-- Header -->
  <div class="ds-card-head">
    <span class="ds-card-title"><i class="ti ti-ban"></i> Blocked IP Audit</span>
  </div>

  <!-- Filter Bar -->
  <div class="ds-filters">
    <div class="ds-search">
      <i class="ti ti-search"></i>
      <input type="text" bind:value={searchText} placeholder="e.g. 192.168.1.1">
    </div>
    <button class="ds-btn primary" on:click={fetchBlockedIPs}>
      <i class="ti ti-refresh"></i> Refresh
    </button>
  </div>

  <!-- Table Card -->
  <div class="ds-card" style="padding:0;overflow:hidden">
    <p class="table-note">* Real-time blocked IP list from Firewall/WAF.</p>
    <div class="ds-table-wrap">
      <table class="ds-table">
        <thead>
          <tr>
            <th>Time Blocked</th>
            <th>Source IP</th>
            <th>Country</th>
            <th>Attack Type</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {#each paginatedList as b}
          <tr>
            <td>{new Date(b.blockedAt || b.timestamp).toLocaleString('en-GB')}</td>
            <td class="ds-mono" style="font-weight: 600;">{b.ip}</td>
            <td>
              {#if b.attackData && b.attackData.country}
                {b.attackData.country}
              {:else}
                <span style="color:var(--text-muted)">-</span>
              {/if}
            </td>
            <td>
              {#if b.attackData && b.attackData.type}
                {b.attackData.type}
              {:else}
                <span style="color:var(--text-muted)">Manual Block</span>
              {/if}
            </td>
            <td>
              {#if b.attackData && b.attackData.severity}
                <span class="ds-badge {b.attackData.severity}">{b.attackData.severity}</span>
              {:else}
                <span style="color:var(--text-muted)">-</span>
              {/if}
            </td>
            <td><span class="ds-badge red">Blocked</span></td>
            <td>
              {#if $roleStore === 'admin'}
              <button class="ds-btn sm btn-unblock" on:click={() => unblockIP(b.ip)}>
                <i class="ti ti-unlock"></i> Unblock
              </button>
              {:else}
              <span style="font-size: 11px; color: var(--text-muted);">Admin Only</span>
              {/if}
            </td>
          </tr>
          {/each}
          {#if paginatedList.length === 0}
          <tr><td colspan="7" class="ds-empty">No blocked IPs</td></tr>
          {/if}
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
    <div class="ds-pagination">
      <div class="ds-pagination-info">
        <span class="ds-pagination-btns">
          <button class="ds-page-btn" on:click={prevPage} disabled={currentPage === 1}>
            <i class="ti ti-chevron-left"></i> Previous
          </button>
          <span class="ds-page-info">Page {currentPage} of {totalPages}</span>
          <button class="ds-page-btn" on:click={nextPage} disabled={currentPage === totalPages}>
            Next <i class="ti ti-chevron-right"></i>
          </button>
        </span>
      </div>
    </div>
    {/if}
  </div>

</div>

<style>
  .table-note {
    font-size: 11px;
    color: var(--text-muted);
    padding: 0.75rem 1rem 0;
    margin: 0;
  }

  .btn-unblock {
    color: var(--green);
    background: var(--green-bg);
    border-color: rgba(46, 204, 113, 0.4);
  }
  .btn-unblock:hover {
    background: var(--green);
    color: white;
  }
</style>
