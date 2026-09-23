<script lang="ts">
  import { formatEventTime } from '../formatTime';

  export let event: any; // The IncidentObject

  $: timelineEvents = event?.attack_session?.timeline || [];
  $: totalEvents = event?.attack_session?.total_events || timelineEvents.length;
  $: firstSeen = event?.attack_session?.first_seen || '';
</script>

{#if timelineEvents.length > 0}
<div class="timeline-wrapper">
  <div class="timeline-stats">
    <span class="badge"><i class="ti ti-activity"></i> {totalEvents} รายการ (Events)</span>
    {#if firstSeen}
      <span class="text-muted" style="font-size:11px;">เริ่มเมื่อ: {formatEventTime(firstSeen)}</span>
    {/if}
  </div>

  <div class="timeline-scroll custom-scrollbar">
    <div class="timeline-track">
      {#each timelineEvents as e, i}
      <div class="timeline-node" style="--idx:{i};">
        {#if i !== timelineEvents.length - 1}
          <div class="tnode-line"></div>
        {/if}
        
        <div class="tnode-dot"></div>
        
        <div class="tnode-card">
          <div class="tnode-time">{(formatEventTime(e.timestamp))}</div>
          <div class="tnode-type">{e.source} : {e.action}</div>
          <div class="tnode-detail">{e.detail || ''}</div>
        </div>
      </div>
      {/each}
    </div>
  </div>
</div>
{/if}

<style>
  .timeline-wrapper {
    display: flex;
    flex-direction: column;
    max-height: 500px;
  }
  
  .timeline-stats {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 12px;
  }
  
  .badge {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
  }

  .timeline-scroll {
    overflow-y: auto; overflow-x: hidden;
    padding: 16px;
    flex: 1;
  }
  
  .custom-scrollbar::-webkit-scrollbar { width: 6px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

  .timeline-track {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .timeline-node {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 16px;
    animation: fadeInNode 0.3s ease calc(var(--idx) * 40ms) both;
  }
  @keyframes fadeInNode { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none} }

  .tnode-line {
    position: absolute;
    left: 4px;
    top: 14px;
    bottom: -16px;
    width: 2px;
    background: linear-gradient(to bottom, var(--border), rgba(0,255,255,0.05));
    z-index: 1;
  }

  .tnode-dot {
    position: relative;
    width: 10px; height: 10px;
    border-radius: 50%;
    border: 2px solid var(--bg-panel);
    background: var(--cyan);
    box-shadow: 0 0 8px rgba(0,255,255,0.4);
    z-index: 2;
    margin-top: 4px;
    flex-shrink: 0;
  }

  .tnode-card {
    flex: 1;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-left: 2px solid var(--border);
    border-radius: 6px;
    padding: 8px 12px;
    transition: all 0.2s;
  }
  .timeline-node:hover .tnode-card { 
    border-left-color: var(--cyan); 
    background: var(--bg-hover);
  }

  .tnode-time { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); margin-bottom: 4px; }
  .tnode-type { font-size: 12px; font-weight: 700; line-height: 1.2; text-shadow: 0 0 8px currentColor; color: var(--text-primary); text-transform: uppercase;}
  .tnode-detail { font-size: 11px; color: var(--text-secondary); margin-top: 4px; }

  .timeline-summary {
    display: flex; gap: 16px; flex-wrap: wrap; justify-content: space-between;
    padding: 10px 16px;
    border-top: 1px solid var(--border);
    font-size: 11px; color: var(--text-secondary);
    background: var(--bg-secondary);
  }
  .timeline-summary strong { color: var(--text-primary); }
</style>
