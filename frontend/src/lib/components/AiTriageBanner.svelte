<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  
  export let events: any[] = [];
  
  let triageResult: any = null;
  let isChecking = false;
  let blockLoading = false;
  let errorMsg = '';
  let intervalId: any;

  const dispatch = createEventDispatcher();

  async function checkTriage() {
    if (!events || events.length === 0 || isChecking) return;
    
    isChecking = true;
    try {
      const geminiKey = localStorage.getItem('cfg_gemini_key') || '';
      // Send the last 50 events to avoid huge payloads
      const recentEvents = [...events].reverse().slice(0, 50);

      const res = await fetch('/api/attacks/auto-triage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'x-gemini-key': geminiKey
        },
        body: JSON.stringify({ events: recentEvents })
      });

      if (!res.ok) throw new Error('Failed to fetch triage');
      const data = await res.json();
      triageResult = data.triage;
    } catch (e: any) {
      console.error('Triage Check Error:', e);
    } finally {
      isChecking = false;
    }
  }

  async function blockTargetIp() {
    if (!triageResult?.targetIp) return;
    
    blockLoading = true;
    errorMsg = '';
    
    try {
      const res = await fetch('/api/attacks/block-ip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ ip: triageResult.targetIp })
      });
      
      const data = await res.json();
      
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to block IP');
      }
      
      alert(`✅ บล็อก IP ${triageResult.targetIp} สำเร็จเรียบร้อยแล้ว`);
      triageResult = null; // Dismiss banner
      dispatch('ipBlocked');
    } catch (e: any) {
      errorMsg = e.message;
    } finally {
      blockLoading = false;
    }
  }

  // React to new events
  $: if (events.length > 0 && !triageResult && !intervalId) {
     checkTriage();
  }

  onMount(() => {
    // Check every 30 seconds
    intervalId = setInterval(checkTriage, 30000);
  });

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
  });
</script>

<style>
  .triage-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-radius: 12px;
    margin-bottom: 24px;
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.05) 100%);
    border: 1px solid rgba(239, 68, 68, 0.3);
    box-shadow: 0 4px 15px rgba(239, 68, 68, 0.05);
    animation: slideDown 0.4s ease-out;
  }

  .triage-banner.high {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.05) 100%);
    border-color: rgba(245, 158, 11, 0.3);
  }

  .triage-content {
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }

  .triage-icon {
    font-size: 28px;
    color: var(--danger);
    background: rgba(239, 68, 68, 0.1);
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: pulse 2s infinite;
  }
  
  .triage-banner.high .triage-icon {
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.1);
  }

  .triage-text h3 {
    margin: 0 0 4px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--danger);
  }
  
  .triage-banner.high .triage-text h3 {
    color: #d97706;
  }

  .triage-text p {
    margin: 0;
    font-size: 14px;
    color: #4b5563;
  }

  .triage-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .btn-block {
    background: var(--danger);
    color: var(--text-primary);
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
  }

  .btn-block:hover {
    background: #dc2626;
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(239, 68, 68, 0.3);
  }

  .btn-block:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
  }

  .btn-dismiss {
    background: transparent;
    border: 1px solid #d1d5db;
    color: #4b5563;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-dismiss:hover {
    background: var(--bg-hover);
  }

  .error-msg {
    color: var(--danger);
    font-size: 12px;
    margin-top: 4px;
    position: absolute;
  }

  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
    70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
    100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>

{#if triageResult}
  <div class="triage-banner {triageResult.severity === 'high' ? 'high' : ''}">
    <div class="triage-content">
      <div class="triage-icon">
        <i class="ti ti-shield-half-filled"></i>
      </div>
      <div class="triage-text">
        <h3>⚡ AI Auto-Triage: Threat Detected</h3>
        <p><strong>IP: {triageResult.targetIp}</strong> — {triageResult.reason}</p>
        {#if errorMsg}
          <div class="error-msg">{errorMsg}</div>
        {/if}
      </div>
    </div>
    <div class="triage-actions">
      <button class="btn-dismiss" on:click={() => triageResult = null}>Dismiss</button>
      <button class="btn-block" on:click={blockTargetIp} disabled={blockLoading}>
        {#if blockLoading}
          <i class="ti ti-loader-2 spin"></i> Blocking...
        {:else}
          <i class="ti ti-shield-lock"></i> One-Click Block
        {/if}
      </button>
    </div>
  </div>
{/if}
