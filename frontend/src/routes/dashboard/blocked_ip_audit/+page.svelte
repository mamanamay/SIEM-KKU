<script lang="ts">
  import { onMount } from 'svelte';
  import { roleStore } from '../../../stores/events';
  import OrgBadge from '../../../lib/components/OrgBadge.svelte';
  
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

  import PageHeader from '../../../lib/components/PageHeader.svelte';

  // ── Manual Block ──────────────────────────────────────────────────────────
  let manualBlockIp = '';
  let manualBlockReason = '';
  let isBlocking = false;
  let blockError = '';

  async function blockManualIP() {
    const ip = manualBlockIp.trim();
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) { blockError = 'รูปแบบ IP ไม่ถูกต้อง (เช่น 192.168.1.1)'; return; }
    blockError = '';
    isBlocking = true;
    try {
      const res = await fetch('/api/attacks/block-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, reason: manualBlockReason || 'Manual Block by Admin' })
      });
      if (res.ok) {
        manualBlockIp = '';
        manualBlockReason = '';
        await fetchBlockedIPs();
      } else {
        const d = await res.json();
        blockError = d.message || 'Block ไม่สำเร็จ';
      }
    } catch { blockError = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'; }
    isBlocking = false;
  }

  // ── Confirm Unblock Modal ─────────────────────────────────────────────────
  let confirmUnblockIp: string | null = null;
  function confirmUnblock(ip: string) { confirmUnblockIp = ip; }
  async function doUnblock() {
    if (!confirmUnblockIp) return;
    await unblockIP(confirmUnblockIp);
    confirmUnblockIp = null;
  }

</script>
<svelte:head><title>Blocked IP Audit - KKUSIEM</title></svelte:head>

<div style="display:flex;flex-direction:column;gap:14px;padding-bottom:2rem">

  <PageHeader title="Blocked IP Audit" description="Review and manage historically blocked external IPs." icon="ti-ban" />

  <!-- ── Manual Block Form (Admin only) ────────────────────────────── -->
  {#if $roleStore === 'admin'}
  <div class="ds-card" style="padding: 16px;">
    <div class="ds-card-head" style="margin-bottom: 12px;">
      <span class="ds-card-title"><i class="ti ti-shield-plus"></i> Manual Block IP</span>
    </div>
    <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end;">
      <div style="flex: 1; min-width: 160px;">
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">IP Address *</div>
        <input class="ds-input" type="text" bind:value={manualBlockIp}
          placeholder="เช่น 192.168.1.100"
          on:keydown={(e) => e.key === 'Enter' && blockManualIP()}
        />
      </div>
      <div style="flex: 2; min-width: 200px;">
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">เหตุผลในการบล็อก</div>
        <input class="ds-input" type="text" bind:value={manualBlockReason}
          placeholder="เช่น Suspicious activity, Port scan detected"
          on:keydown={(e) => e.key === 'Enter' && blockManualIP()}
        />
      </div>
      <div style="display: flex; align-items: flex-end; padding-bottom: 0;">
        <button class="ds-btn danger" on:click={blockManualIP} disabled={isBlocking || !manualBlockIp.trim()}>
          <i class="ti ti-ban"></i> {isBlocking ? 'Blocking...' : 'Block IP'}
        </button>
      </div>
    </div>
    {#if blockError}
      <div style="margin-top: 8px; font-size: 12px; color: var(--red);"><i class="ti ti-alert-circle"></i> {blockError}</div>
    {/if}
  </div>
  {/if}

  <!-- Filter Bar -->
  <div class="ds-filters" style="justify-content: space-between;">
    <div style="display: flex; gap: 10px;">
      <div class="ds-search">
        <i class="ti ti-search"></i>
        <input type="text" bind:value={searchText} placeholder="e.g. 192.168.1.1">
      </div>
      <button class="ds-btn primary" on:click={fetchBlockedIPs}>
        <i class="ti ti-refresh"></i> Refresh
      </button>
    </div>
  </div>

  <!-- Table Card -->
  <div class="ds-card" style="padding:0;overflow:hidden">
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
            <td class="ds-mono">{new Date(b.blockedAt || b.timestamp).toLocaleString('en-GB')}</td>
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
              <button class="ds-btn sm btn-unblock" on:click={() => confirmUnblock(b.ip)}>
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

<!-- Confirm Unblock Modal -->
{#if confirmUnblockIp}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-overlay" on:click={() => confirmUnblockIp = null} role="dialog" aria-modal="true">
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="confirm-modal" on:click|stopPropagation>
    <div style="font-size: 24px; color: var(--orange); margin-bottom: 12px;"><i class="ti ti-alert-triangle"></i></div>
    <div style="font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">ยืนยันการ Unblock IP</div>
    <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5;">
      คุณแน่ใจหรือไม่ว่าต้องการปลดบล็อก IP <strong>{confirmUnblockIp}</strong>?<br>
      IP นี้จะสามารถเชื่อมต่อระบบได้อีกครั้ง
    </div>
    <div style="display: flex; gap: 10px; justify-content: flex-end;">
      <button class="ds-btn" style="background: var(--bg-secondary); color: var(--text-primary);" on:click={() => confirmUnblockIp = null}>ยกเลิก</button>
      <button class="ds-btn btn-unblock" on:click={doUnblock}><i class="ti ti-unlock"></i> ยืนยัน Unblock</button>
    </div>
  </div>
</div>
{/if}

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
    color: var(--text-primary);
  }

  .ds-input {
    width: 100%;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }
  .ds-input:focus { border-color: var(--green); }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    animation: fadeIn 0.15s ease;
  }
  .confirm-modal {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 28px 32px;
    max-width: 420px;
    width: 90%;
    box-shadow: 0 24px 48px rgba(0,0,0,0.5);
    animation: slideUp 0.2s cubic-bezier(.175,.885,.32,1.275);
    text-align: center;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
</style>

