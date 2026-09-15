<svelte:head><title>SOAR Triage - KKUSIEM</title></svelte:head>
<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  import { formatEventTime } from '../../../lib/formatTime';
  
  let events: any[] = [];
  eventsStore.subscribe(val => { events = val; });
  
  // Search & Filter
  let searchQuery = '';
  let searchTime = '';
  let exactMatchMode = false;
  let severityFilter = 'all';

  // Handle URL params for direct linking
  import { onMount } from 'svelte';
  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const ip = params.get('ip');
    const time = params.get('time');
    if (ip || time) {
      if (ip) searchQuery = ip;
      if (time) searchTime = time;
      exactMatchMode = true;
      setTimeout(() => {
        if (filteredEvents.length > 0) selectEvent(filteredEvents[0]);
      }, 100);
    }
  });

  $: filteredEvents = events.filter((e: any) => {
    if (exactMatchMode) return e.ip === searchQuery && String(e.time || e.createdAt) === searchTime;
    const matchSearch = (e.ip || '').toLowerCase().includes(searchQuery.toLowerCase()) || (e.type || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchSeverity = severityFilter === 'all' ? true : e.severity === severityFilter;
    return matchSearch && matchSeverity;
  });
  
  let selectedEvent: any = null;
  function selectEvent(e: any) { selectedEvent = e; }
  
  let isActionRunning = false;
  let actionResult = '';
  
  function executePlaybook(action: string) {
    if (!selectedEvent) return;
    isActionRunning = true;
    actionResult = `Initiating ${action} for ${selectedEvent.ip}...`;
    
    setTimeout(() => {
      actionResult = `${action} completed successfully on ${selectedEvent.ip}.`;
      isActionRunning = false;
    }, 1500);
  }

  function clearExactMatch() {
    exactMatchMode = false;
    searchQuery = '';
    searchTime = '';
    const url = new URL(window.location.href);
    url.searchParams.delete('ip');
    url.searchParams.delete('time');
    window.history.pushState({}, '', url);
  }

  import { callKKUAI } from '../../../lib/utils/kkuai';

  let aiFindingCve = false;
  async function scanCveWithAI() {
    if (!selectedEvent) return;
    
    aiFindingCve = true;
    try {
      const prompt = `Analyze this security event and identify the most likely CVE associated with it. 
Event Data: ${JSON.stringify(selectedEvent)}
Respond ONLY with the CVE ID (e.g., CVE-2023-1234) if you are confident. If it's a generic attack, respond with NONE.`;
      
      const res = await callKKUAI('', [
        { role: 'system', content: 'You are an expert vulnerability analyst. You must identify specific CVEs from attack logs.' },
        { role: 'user', content: prompt }
      ]);
      
      const match = res.match(/CVE-\d{4}-\d{4,}/);
      if (match) {
        selectedEvent.cve = { id: match[0], name: 'AI Identified Vulnerability', score: 'N/A' };
        events = [...events];
      } else {
        alert("AI could not confidently identify a specific CVE for this event.");
      }
    } catch (e: any) {
      alert("AI Scan failed: " + e.message);
    } finally {
      aiFindingCve = false;
    }
  }

  let aiGeneratingBrief = false;
  let aiExplanation = '';

  async function generateAiBriefing() {
    if (!selectedEvent) return;
    
    aiGeneratingBrief = true;
    try {
      const prompt = `Analyze this security event and provide a comprehensive Incident Workflow:
1. Explain what this attack is and how it works (in Thai).
2. What is the risk/impact if successful?
3. Recommended SOAR workflow steps to contain and eradicate this threat.
Event Data: ${JSON.stringify(selectedEvent)}`;

      const res = await callKKUAI('', [
        { role: 'system', content: 'You are an elite SOC Analyst. Provide response formatted with HTML tags like <strong>, <ul>, <li> for readability, without markdown codeblocks.' },
        { role: 'user', content: prompt }
      ]);
      aiExplanation = res;
      // Attach to event so the Export Report can include it!
      selectedEvent.aiAnalysis = res;
    } catch (e: any) {
      alert("AI Workflow Generation failed: " + e.message);
    } finally {
      aiGeneratingBrief = false;
    }
  }
</script>

<div class="soar-triage">
  <!-- COL 1: Incident Queue -->
  <div class="col-list">
    <div class="list-header">
      <div style="font-size: 16px; font-weight: 700; color: #fff;">Incident Queue</div>
      <div style="font-size: 12px; color: var(--text-muted);">{filteredEvents.length} events found</div>
    </div>
    
    <div class="list-filters">
      {#if exactMatchMode}
        <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(59,130,246,0.1); padding:8px 12px; border-radius:8px; border:1px solid #3b82f6;">
          <div style="font-size:12px; color:#3b82f6;">Exact Match: {searchQuery}</div>
          <button style="background:transparent; border:none; color:#3b82f6; cursor:pointer;" on:click={clearExactMatch}><i class="ti ti-x"></i></button>
        </div>
      {:else}
        <input type="text" placeholder="Search IP or Type..." bind:value={searchQuery} />
        <select bind:value={severityFilter}>
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
        </select>
      {/if}
    </div>

    <div class="queue-items custom-scrollbar">
      {#each filteredEvents as event}
        <div class="q-item" class:selected={selectedEvent === event} on:click={() => selectEvent(event)}>
          <div class="q-header">
            <span class="q-type">{event.type}</span>
            <span class="q-sev {event.severity}">{event.severity.toUpperCase()}</span>
          </div>
          <div class="q-ip"><i class="ti ti-network"></i> {event.ip}</div>
          <div class="q-time">{formatEventTime(event.time || event.createdAt)}</div>
        </div>
      {/each}
      {#if filteredEvents.length === 0}
        <div style="padding:20px; text-align:center; color:var(--text-muted); font-size:12px;">No incidents match filters.</div>
      {/if}
    </div>
  </div>

  <!-- COL 2: Correlation & Details -->
  <div class="col-main custom-scrollbar">
    {#if selectedEvent}
      <!-- TOP: Correlation Flow -->
      <div class="main-top">
        <h3 class="panel-title">SIEM Correlation Flow</h3>
        <div class="flow-container">
          
          <div class="flow-node">
            <div class="fn-head"><i class="ti ti-shield-lock" style="color:#ef4444;"></i> Firewall Log</div>
            <div class="fn-body">
              <div><strong>Source:</strong> {selectedEvent.ip}</div>
              <div><strong>Port:</strong> {Math.floor(Math.random() * 60000) + 1024}</div>
            </div>
          </div>
          
          <i class="ti ti-arrow-right flow-arrow"></i>
          
          <div class="flow-node active">
            <div class="fn-head"><i class="ti ti-server" style="color:#10b981;"></i> Server Syslog</div>
            <div class="fn-body">
              <div><strong>Event:</strong> {selectedEvent.type}</div>
              <div><strong>Threat Score:</strong> {Math.floor(Math.random() * 40) + 60}/100</div>
              <div class="score-bar"><div class="score-fill" style="width: 85%;"></div></div>
            </div>
          </div>
          
          <i class="ti ti-arrow-right flow-arrow"></i>
          
          <div class="flow-node">
            <div class="fn-head"><i class="ti ti-brand-nginx" style="color:#3b82f6;"></i> NGINX Access</div>
            <div class="fn-body">
              <div><strong>C&C Link:</strong> Estimated</div>
              <div style="color:var(--text-muted); font-style:italic;">Proxy blocked.</div>
            </div>
          </div>

        </div>
      </div>

      <!-- BOTTOM: 3 Blocks -->
      <div class="main-bottom">
        <div class="mb-box">
          <div class="box-head"><i class="ti ti-map-pin"></i> Location & Net</div>
          <div class="box-body">
            <p><strong>Country:</strong> {selectedEvent.country || 'Unknown'}</p>
            <p><strong>Region:</strong> Cloud AS-East</p>
            <p><strong>Subnet:</strong> {selectedEvent.ip}/24</p>
          </div>
        </div>

        <div class="mb-box flex-2">
          <div class="box-head"><i class="ti ti-info-circle"></i> Attack Explanation</div>
          <div class="box-body" style="font-family:monospace; font-size:12px; background:rgba(0,0,0,0.2); padding:10px; border-radius:6px; overflow-wrap:break-word;">
            {JSON.stringify(selectedEvent, null, 2)}
          </div>
        </div>
      </div>

      <!-- HORIZONTAL TIMELINE -->
      <div class="timeline-box">
        <div class="box-head"><i class="ti ti-timeline"></i> Compact Attack Timeline</div>
        <div class="timeline-horiz">
          <div class="th-item">
            <div class="th-dot"></div>
            <div class="th-time">{formatEventTime(selectedEvent.time || selectedEvent.createdAt)}</div>
            <div class="th-desc">Initial Scan</div>
          </div>
          <div class="th-line"></div>
          <div class="th-item">
            <div class="th-dot" style="background:#f59e0b; box-shadow:0 0 10px #f59e0b;"></div>
            <div class="th-time">+2ms</div>
            <div class="th-desc">Payload Execution</div>
          </div>
          <div class="th-line"></div>
          <div class="th-item">
            <div class="th-dot" style="background:#ef4444; box-shadow:0 0 10px #ef4444;"></div>
            <div class="th-time">+15ms</div>
            <div class="th-desc">System Blocked</div>
          </div>
        </div>
      </div>

    {:else}
      <div style="height:100%; display:flex; align-items:center; justify-content:center; color:var(--text-muted);">
        Select an incident from the queue to view correlation details.
      </div>
    {/if}
  </div>

  <!-- COL 3: AI & Playbook -->
  <div class="col-ai">
    <div class="ai-header">
      <i class="ti ti-robot"></i> SOC Playbook AI
    </div>
    
    <div class="ai-body custom-scrollbar">
      {#if selectedEvent}
        <div style="margin-bottom:20px;">
          <h4 style="margin:0 0 12px; font-size:13px; color:var(--text-muted);">Recommended Actions</h4>

          {#if selectedEvent.cve}
             <div class="cve-badge" style="margin-bottom:10px; padding:8px; background:rgba(239,68,68,0.1); border:1px solid #ef4444; border-radius:4px;">
               <strong>Found:</strong> <a href="/dashboard/cve?search={selectedEvent.cve.id}" target="_blank" style="color:#ef4444; text-decoration:underline;">{selectedEvent.cve.id}</a><br/>
               <span style="font-size:11px;">{selectedEvent.cve.name} (CVSS: {selectedEvent.cve.score})</span>
             </div>
          {:else}
             <button class="playbook-btn ai-scan" on:click={scanCveWithAI} disabled={aiFindingCve}>
               <i class="ti {aiFindingCve ? 'ti-loader spin' : 'ti-brain'}"></i> {aiFindingCve ? 'Scanning...' : 'Identify CVE (AI)'}
             </button>
          {/if}

          <button class="playbook-btn danger" on:click={() => executePlaybook('Block IP')} disabled={isActionRunning}>
            <i class="ti ti-shield-x"></i> Block IP ({selectedEvent.ip})
          </button>
          <button class="playbook-btn" on:click={() => executePlaybook('Isolate Host')} disabled={isActionRunning}>
            <i class="ti ti-server-off"></i> Isolate Target Host
          </button>
          <button class="playbook-btn" on:click={generateAiBriefing} disabled={aiGeneratingBrief}>
            <i class="ti {aiGeneratingBrief ? 'ti-loader spin' : 'ti-wand'}"></i> {aiGeneratingBrief ? 'Analyzing...' : 'Generate Playbook (AI)'}
          </button>
          
          {#if actionResult}
            <div style="margin-top:12px; padding:10px; background:rgba(16,185,129,0.1); color:#10b981; border:1px solid rgba(16,185,129,0.2); border-radius:6px; font-size:12px;">
              {actionResult}
            </div>
          {/if}
        </div>

        <div>
          <h4 style="margin:0 0 12px; font-size:13px; color:var(--text-muted);">Ask AI Assistant</h4>
          <div style="display:flex; flex-direction:column; gap:8px;">
            {#if aiExplanation}
              <div class="chat-bubble ai">
                {@html aiExplanation}
              </div>
            {:else}
              <div class="chat-bubble ai">The payload indicates a potential Brute Force attack. I recommend immediate WAF blocking.</div>
            {/if}
          </div>
        </div>
      {:else}
        <div style="text-align:center; color:var(--text-muted); font-size:13px; margin-top:40px;">
          No incident selected.
        </div>
      {/if}
    </div>
    
    <div class="ai-footer">
      <input type="text" placeholder="Type command or question..." disabled={!selectedEvent} />
      <button disabled={!selectedEvent}><i class="ti ti-send"></i></button>
    </div>
  </div>
</div>

<style>
  .soar-triage { display: flex; height: 100%; width: 100%; background: #030711; font-family: 'Inter', sans-serif; color: var(--text-primary); overflow: hidden; }
  
  /* COL 1 */
  .col-list { width: 320px; background: var(--bg-panel, #181b24); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
  .list-header { padding: 20px; border-bottom: 1px solid var(--border); }
  .list-filters { padding: 12px 20px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid var(--border); }
  .list-filters input, .list-filters select { box-sizing: border-box; width: 100%; padding: 8px 12px; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 6px; color: #fff; font-size: 13px; outline: none; }
  .queue-items { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .q-item { padding: 12px; background: rgba(0,0,0,0.15); border: 1px solid transparent; border-radius: 8px; cursor: pointer; transition: 0.2s; }
  .q-item:hover { background: rgba(255,255,255,0.05); }
  .q-item.selected { border-color: #3b82f6; background: rgba(59,130,246,0.1); }
  .q-header { display: flex; justify-content: space-between; margin-bottom: 6px; }
  .q-type { font-size: 13px; font-weight: 600; color: #fff; }
  .q-sev { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
  .q-sev.critical { background: rgba(239,68,68,0.2); color: #ef4444; }
  .q-sev.high { background: rgba(245,158,11,0.2); color: #f59e0b; }
  .q-sev.medium { background: rgba(234,179,8,0.2); color: #eab308; }
  .q-ip { font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
  .q-time { font-size: 11px; color: var(--text-muted); }

  /* COL 2 */
  .col-main { flex: 1; display: flex; flex-direction: column; padding: 24px; gap: 24px; overflow-y: auto; }
  .panel-title { margin: 0 0 16px; font-size: 16px; font-weight: 600; }
  
  .flow-container { display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); border: 1px dashed var(--border); border-radius: 12px; padding: 24px; }
  .flow-node { flex: 1; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 16px; min-height: 120px; transition: 0.3s; }
  .flow-node.active { border-color: #10b981; box-shadow: 0 0 20px rgba(16,185,129,0.1); }
  .fn-head { font-size: 13px; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .fn-body { font-size: 12px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 6px; }
  .score-bar { width: 100%; height: 6px; background: rgba(0,0,0,0.5); border-radius: 3px; margin-top: 4px; overflow: hidden; }
  .score-fill { height: 100%; background: linear-gradient(90deg, #f59e0b, #ef4444); }
  .flow-arrow { color: var(--border); font-size: 24px; margin: 0 16px; }

  .main-bottom { display: flex; gap: 24px; }
  .mb-box { flex: 1; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .mb-box.flex-2 { flex: 2; }
  .box-head { font-size: 13px; font-weight: 700; color: var(--text-muted); margin-bottom: 12px; text-transform: uppercase; display: flex; align-items: center; gap: 8px; }
  .box-body p { margin: 0 0 8px; font-size: 13px; }

  .timeline-box { background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .timeline-horiz { display: flex; align-items: center; justify-content: space-between; padding: 20px 0; }
  .th-item { display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative; width: 100px; }
  .th-dot { width: 12px; height: 12px; border-radius: 50%; background: #3b82f6; box-shadow: 0 0 10px #3b82f6; z-index: 2; }
  .th-time { font-size: 11px; font-weight: 600; color: var(--text-muted); }
  .th-desc { font-size: 12px; font-weight: 600; color: #fff; text-align: center; }
  .th-line { flex: 1; height: 2px; background: var(--border); margin: 0 -40px; transform: translateY(-16px); z-index: 1; }

  /* COL 3 */
  .col-ai { width: 320px; background: var(--bg-panel, #181b24); border-left: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
  .ai-header { padding: 20px; border-bottom: 1px solid var(--border); font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px; }
  .ai-body { flex: 1; padding: 20px; overflow-y: auto; }
  .playbook-btn { width: 100%; padding: 12px; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; color: #fff; font-size: 13px; font-weight: 600; text-align: left; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: 0.2s; margin-bottom: 8px; }
  .playbook-btn:hover { background: rgba(255,255,255,0.05); }
  .playbook-btn.danger { border-color: rgba(239,68,68,0.5); color: #ef4444; }
  .playbook-btn.danger:hover { background: rgba(239,68,68,0.1); }
  .playbook-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  
  .chat-bubble { padding: 12px; border-radius: 8px; font-size: 13px; line-height: 1.5; }
      .chat-bubble.user { background: rgba(255,255,255,0.05); color: var(--text-primary); border: 1px solid var(--border); margin-left: 20px; border-bottom-right-radius: 0; }
    .chat-bubble.ai { background: rgba(59,130,246,0.1); color: #93c5fd; border: 1px solid rgba(59,130,246,0.2); margin-right: 20px; border-bottom-left-radius: 0; }
    .chat-bubble.typing { padding: 12px 16px; display: inline-flex; gap: 4px; }
    .dot { width: 4px; height: 4px; background: currentColor; border-radius: 50%; animation: blink 1.4s infinite both; }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes blink { 0%, 100% { opacity: 0.2; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }

  
  .ai-footer { padding: 16px; border-top: 1px solid var(--border); display: flex; gap: 8px; }
  .ai-footer input { flex: 1; padding: 10px 12px; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; color: #fff; font-size: 13px; outline: none; }
  .ai-footer button { padding: 0 16px; background: #3b82f6; border: none; border-radius: 8px; color: white; cursor: pointer; }
  .ai-footer button:disabled { opacity: 0.5; cursor: not-allowed; }

  .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
</style>




