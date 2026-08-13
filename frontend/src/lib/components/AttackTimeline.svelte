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
      Attack Timeline —
      <span class="timeline-ip">{ip}</span>
      <span class="timeline-count">{filteredEvents.length} events</span>
    </div>
    <div class="timeline-legend">
      <span class="tl-dot" style="background:#ef4444"></span><span class="tl-lbl">Critical</span>
      <span class="tl-dot" style="background:#f97316"></span><span class="tl-lbl">High</span>
      <span class="tl-dot" style="background:#f59e0b"></span><span class="tl-lbl">Medium</span>
      <span class="tl-dot" style="background:#6b7280"></span><span class="tl-lbl">Low</span>
    </div>
  </div>

  <!-- Horizontal Scroll Timeline -->
  <div class="timeline-scroll">
    <div class="timeline-track">
      <!-- Axis line -->
      <div class="timeline-axis"></div>

      {#each timelineEvents as e, i}
      {@const color = e.severity==='critical'?'#ef4444':e.severity==='high'?'#f97316':e.severity==='medium'?'#f59e0b':'#6b7280'}
      <div class="timeline-node" style="--idx:{i};">
        <!-- Dot on axis -->
        <div class="tnode-dot" style="background:{color};box-shadow:0 0 8px {color}66;"></div>
        <!-- Label card (alternates above/below) -->
        <div class="tnode-card {i % 2 === 0 ? 'above' : 'below'}">
          <!-- Split by comma or space if formatted string -->
          <div class="tnode-time">{(formatEventTime(e.timeStr || e.time || e.createdAt)).split(', ').pop() || '-'}</div>
          <div class="tnode-type" style="color:{color}">{e.type}</div>
        </div>
        <!-- Connector line -->
        <div class="tnode-line {i % 2 === 0 ? 'up' : 'down'}"></div>
      </div>
      {/each}

    </div>
  </div>

  <!-- Quick Summary Row -->
  <div class="timeline-summary">
    <span>📅 First seen: <strong>{formatEventTime(timelineEvents[timelineEvents.length-1]?.timeStr || timelineEvents[timelineEvents.length-1]?.createdAt)}</strong></span>
    <span>⏱ Last seen: <strong>{formatEventTime(timelineEvents[0]?.timeStr || timelineEvents[0]?.createdAt)}</strong></span>
    <span>🔴 Critical: <strong style="color:#ef4444">{filteredEvents.filter(e=>e.severity==='critical').length}</strong></span>
    <span>🟠 High: <strong style="color:#f97316">{filteredEvents.filter(e=>e.severity==='high').length}</strong></span>
    <span>🌍 Country: <strong>{filteredEvents[0]?.country || 'Unknown'}</strong></span>
  </div>
</div>
{/if}

<style>
  .timeline-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px; /* Slightly smaller radius for inner display */
    overflow: hidden;
    margin: 16px 0;
  }
  .timeline-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap; gap: 8px;
  }
  .timeline-title {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; font-weight: 700; color: var(--text-primary);
  }
  .timeline-title i { color: var(--green); font-size: 18px; }
  .timeline-ip {
    font-family: 'JetBrains Mono', monospace;
    color: var(--green); font-size: 13px;
  }
  .timeline-count {
    font-size: 11px; color: var(--text-muted);
    background: var(--bg-secondary);
    padding: 2px 8px; border-radius: 10px;
  }
  .timeline-legend {
    display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--text-muted);
  }
  .tl-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .tl-lbl { margin-right: 4px; }

  .timeline-scroll {
    overflow-x: auto; overflow-y: hidden;
    padding: 0 16px;
    scrollbar-width: thin;
  }
  .timeline-track {
    position: relative;
    display: flex;
    align-items: center;
    height: 160px;
    min-width: max-content;
    gap: 0;
    padding: 0 8px;
  }
  .timeline-axis {
    position: absolute;
    left: 0; right: 0;
    top: 50%;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--border) 5%, var(--border) 95%, transparent);
    transform: translateY(-50%);
  }
  .timeline-node {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 80px;
    height: 160px;
    flex-shrink: 0;
    animation: fadeInNode 0.3s ease calc(var(--idx) * 40ms) both;
  }
  @keyframes fadeInNode { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none} }

  .tnode-dot {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 10px; height: 10px;
    border-radius: 50%;
    border: 2px solid var(--bg-panel);
    z-index: 2;
    transition: transform 0.15s;
  }
  .timeline-node:hover .tnode-dot { transform: translateY(-50%) scale(1.5); }

  .tnode-card {
    position: absolute;
    left: 50%; transform: translateX(-50%);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 6px;
    width: 72px;
    text-align: center;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .tnode-card.above { top: 8px; }
  .tnode-card.below { bottom: 8px; }
  .timeline-node:hover .tnode-card { border-color: var(--green); box-shadow: 0 0 8px rgba(29,158,117,0.2); }

  .tnode-time { font-size: 9px; color: var(--text-muted); font-family: monospace; }
  .tnode-type { font-size: 9px; font-weight: 600; line-height: 1.2; margin-top: 2px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

  .tnode-line {
    position: absolute;
    left: 50%;
    width: 1px;
    background: var(--border);
  }
  .tnode-line.up { top: 50px; bottom: calc(50% + 6px); }
  .tnode-line.down { top: calc(50% + 6px); bottom: 50px; }

  .timeline-summary {
    display: flex; gap: 20px; flex-wrap: wrap;
    padding: 10px 16px;
    border-top: 1px solid var(--border);
    font-size: 12px; color: var(--text-secondary);
    background: var(--bg-secondary);
  }
  .timeline-summary strong { color: var(--text-primary); }
</style>
