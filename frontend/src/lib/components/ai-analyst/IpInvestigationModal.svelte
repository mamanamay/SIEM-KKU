<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  export let show = false;
  export let ip = '';
  export let data: any = null; // AiInvestigation object
  export let isLoading = false;
  
  const dispatch = createEventDispatcher();
  
  function close() { show = false; dispatch('close'); }
  
  function getRiskColor(level: string) {
    if (level === 'Critical') return 'var(--red)';
    if (level === 'High') return 'var(--orange)';
    if (level === 'Medium') return 'var(--yellow)';
    return 'var(--green)';
  }
</script>

{#if show}
  <div class="modal-overlay" on:click={close}>
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <div class="title"><i class="ti ti-search"></i> IP Investigation: {ip}</div>
        <button class="close-btn" on:click={close}><i class="ti ti-x"></i></button>
      </div>
      
      <div class="modal-body">
        {#if isLoading}
          <div class="loading-state">
            <i class="ti ti-loader ti-spin"></i>
            <div>AI is investigating {ip}... gathering logs and context.</div>
          </div>
        {:else if !data}
          <div class="empty-state">No investigation data found.</div>
        {:else}
          <div class="invest-grid">
            <div class="panel p-profile">
              <h4>IP Profile</h4>
              <div class="info-row"><span>Country:</span> <strong>{data.country || 'Unknown'}</strong></div>
              <div class="info-row"><span>First Seen:</span> <strong>{data.firstSeen}</strong></div>
              <div class="info-row"><span>Last Seen:</span> <strong>{data.lastSeen}</strong></div>
              <div class="info-row"><span>Total Events:</span> <strong>{data.totalEvents}</strong></div>
            </div>
            
            <div class="panel p-risk">
              <h4>AI Assessment</h4>
              <div class="risk-badge" style="background: {getRiskColor(data.riskLevel)}">
                Risk: {data.riskLevel} (Score: {data.riskScore})
              </div>
              <div class="conf-badge">Confidence: {data.confidence}</div>
              <div class="fp-text"><strong>False Positive Check:</strong> {data.falsePositivePossibility}</div>
            </div>
          </div>
          
          <div class="panel p-behavior mt-4">
            <h4>Behavior Analysis</h4>
            <p>{@html data.behaviorSummary.replace(/\n/g, '<br/>')}</p>
          </div>
          
          <div class="panel p-attacks mt-4">
            <h4>Attack Activity</h4>
            <div class="tags">
              {#each data.attackTypes as type}
                <span class="tag type">{type.name} ({type.count})</span>
              {/each}
            </div>
            <div class="mt-2"><strong>Targets:</strong> {data.targets.join(', ')}</div>
          </div>
          
          <div class="panel p-next mt-4">
            <h4>Next Steps</h4>
            <ul>
              {#each data.nextSteps as step}
                <li>{step}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 999; display: flex; align-items: center; justify-content: center; }
  .modal-content { background: var(--bg-panel); width: 800px; max-width: 95%; max-height: 90vh; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
  .modal-header { padding: 16px 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: var(--bg-body); }
  .title { font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 8px; color: var(--text-muted); }
  .close-btn { background: none; border: none; font-size: 20px; cursor: pointer; color: var(--text-muted); }
  .modal-body { padding: 24px; overflow-y: auto; flex: 1; }
  .loading-state { text-align: center; padding: 40px; color: var(--text-muted); }
  .loading-state i { font-size: 32px; margin-bottom: 16px; color: #3b82f6; }
  
  .invest-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .panel { border: 1px solid var(--border); border-radius: 8px; padding: 16px; background: var(--bg-panel); }
  h4 { margin: 0 0 12px 0; font-size: 14px; color: var(--text-muted); border-bottom: 1px solid var(--border); padding-bottom: 8px; }
  .info-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
  .info-row span { color: var(--text-muted); }
  .risk-badge { display: inline-block; padding: 6px 12px; border-radius: 6px; color: var(--text-primary); font-weight: 700; font-size: 14px; margin-bottom: 8px; }
  .conf-badge { font-size: 12px; color: var(--text-muted); margin-bottom: 12px; }
  .fp-text { font-size: 13px; line-height: 1.5; color: var(--text-muted); }
  .mt-2 { margin-top: 8px; }
  .mt-4 { margin-top: 16px; }
  .tags { display: flex; flex-wrap: wrap; gap: 8px; }
  .tag { padding: 4px 10px; border-radius: 100px; font-size: 12px; background: var(--bg-secondary); border: 1px solid var(--border); }
  ul { margin: 0; padding-left: 20px; font-size: 13px; color: var(--text-muted); line-height: 1.6; }
</style>
