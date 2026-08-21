<script lang="ts">
  import { eventsStore } from '../../stores/events';
  import { formatEventTime } from '../formatTime';

  export let ip: string = '';

  // Filter events for this specific IP and sort them by newest first
  $: filteredEvents = $eventsStore.filter(e => e.ip === ip).sort((a, b) => {
    const tsA = a.timestampMs || new Date(a.createdAt || Date.now()).getTime();
    const tsB = b.timestampMs || new Date(b.createdAt || Date.now()).getTime();
    return tsB - tsA;
  });

  $: timelineEvents = filteredEvents.slice(0, 30);
</script>

{#if filteredEvents.length > 0}
<div class="timeline-card">
  <div class="timeline-header">
    <div class="timeline-title">
      <i class="ti ti-timeline"></i>
      Attack Kill-Chain
      <span class="timeline-count">{filteredEvents.length} events</span>
    </div>
  </div>

  <!-- Vertical Scroll Timeline -->
  <div class="timeline-scroll">
    <div class="timeline-track">
      {#each timelineEvents as e, i}
      {@const color = e.severity==='critical'?'var(--red)':e.severity==='high'?'var(--orange)':e.severity==='medium'?'var(--yellow)':'var(--blue)'}
      <div class="timeline-node" style="--idx:{i};">
        <!-- Vertical Line connecting nodes -->
        {#if i !== timelineEvents.length - 1}
          <div class="tnode-line"></div>
        {/if}
        
        <!-- Dot -->
        <div class="tnode-dot" style="background:{color}; box-shadow:0 0 8px {color}66;"></div>
        
        <!-- Content Card -->
        <div class="tnode-card">
          <div class="tnode-time">{(formatEventTime(e.timeStr || e.time || e.createdAt))}</div>
          <div class="tnode-type" style="color:{color}">{e.type}</div>
          <div class="tnode-detail">{e.detail || ''}</div>
        </div>
      </div>
      {/each}
    </div>
  </div>

  <div class="timeline-summary">
    <span>First seen: <strong>{formatEventTime(timelineEvents[timelineEvents.length-1]?.timeStr || timelineEvents[timelineEvents.length-1]?.createdAt)}</strong></span>
    <span>🔴 <strong style="color:var(--red)">{filteredEvents.filter(e=>e.severity==='critical').length}</strong></span>
    <span>🟠 <strong style="color:var(--orange)">{filteredEvents.filter(e=>e.severity==='high').length}</strong></span>
  </div>
</div>
{/if}

<style>
  .timeline-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    margin: 16px 0;
    display: flex;
    flex-direction: column;
    max-height: 400px;
  }
  .timeline-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
  }
  .timeline-title {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; font-weight: 700; color: var(--text-primary);
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .timeline-title i { color: var(--cyan); font-size: 18px; }
  .timeline-count {
    font-size: 10px; color: var(--cyan);
    background: rgba(0, 240, 255, 0.1);
    border: 1px solid rgba(0, 240, 255, 0.3);
    padding: 2px 8px; border-radius: 10px;
  }

  .timeline-scroll {
    overflow-y: auto; overflow-x: hidden;
    padding: 16px;
    flex: 1;
    scrollbar-width: thin;
  }
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
  .tnode-type { font-size: 12px; font-weight: 700; line-height: 1.2; text-shadow: 0 0 8px currentColor; }
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
