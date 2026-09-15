<svelte:head>
  <title>AI Daily Briefing - KKUSIEM</title>
</svelte:head>

<script lang="ts">
  import { onMount } from 'svelte';
  import { eventsStore } from '../../../stores/events';
  
  // Import the 5 restored components
  import AiSecuritySituation from '../../../lib/components/ai-analyst/AiSecuritySituation.svelte';
  import AiInvestigationPriority from '../../../lib/components/ai-analyst/AiInvestigationPriority.svelte';
  import AiRecommendedActions from '../../../lib/components/ai-analyst/AiRecommendedActions.svelte';
  import AiAttackCorrelation from '../../../lib/components/ai-analyst/AiAttackCorrelation.svelte';
  import { aiCopilotStore } from '../../../stores/aiCopilotStore';
  
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import ExportBtn from '../../../lib/components/ExportBtn.svelte';

  $: events = $eventsStore;
  
  // Dummy data just for rendering the UI identically to the screenshot
  const aiSummary = "AI Assessment: ตรวจพบเหตุการณ์ผิดปกติ 14 รายการ จาก 6 IPs...";
  const riskLevel = "High";
  const confidence = "High";
  const generatedAt = "8/31/2026, 11:11:26 AM";
  const dataRange = "Last 24 Hours";
  
  const priorities = [
    { priority: 1, ip: '192.168.1.105', description: 'Repeated attacks', action: 'Check logs' }
  ];
  
  const recommendations = [
    { type: 'immediate', title: 'Immediate Actions', actions: ['Block IP'] },
    { type: 'investigation', title: 'Investigation', actions: ['Check DB logs'] },
    { type: 'preventive', title: 'Preventive', actions: ['Update WAF'] }
  ];
  
  const campaigns = [
    { name: 'Possible Campaign 1', description: 'Same subnet', confidence: 'Medium' }
  ];
  
</script>

<div class="page-container">
  <div style="max-width: 1400px; margin: 0 auto; width: 100%;">
    <PageHeader title="AI Daily Briefing" description="Automated daily security summary and actionable intelligence." icon="ti-brain">
      <div slot="actions">
        <ExportBtn config={{ pageType: 'ai-daily', reportTitle: 'AI Daily Security Report', supportedFormats: ['pdf', 'html'], aiEnabled: true, csvEnabled: false, allowExecOnly: true, sections: [] }} data={events} />
      </div>
    </PageHeader>
  </div>
  <div class="content-scroll custom-scrollbar" style="margin-top: 16px;">
    
    <div class="ai-dashboard-grid">
      <div class="grid-full">
        <AiSecuritySituation 
          summary={aiSummary} 
          {riskLevel} 
          {confidence} 
          {generatedAt} 
          {dataRange} 
          on:regenerate={() => {}} 
        />
      </div>
      
      <div class="grid-half">
        <AiInvestigationPriority priorities={priorities} />
      </div>
      
      <div class="grid-half">
        <AiRecommendedActions {recommendations} />
      </div>
      
      <div class="grid-half">
        <AiAttackCorrelation {campaigns} />
      </div>
      
      <div class="grid-half">
        <div class="copilot-card">
          <div class="card-header">
            <h3><i class="ti ti-robot"></i> Advanced AI Copilot</h3>
          </div>
          <div class="card-body" style="text-align: center; padding: 40px 20px;">
            <i class="ti ti-robot" style="font-size: 3rem; color: #3b82f6; margin-bottom: 16px; display:block;"></i>
            <p style="color: #475569; margin-bottom: 24px;">AI Copilot is now a global feature. You can access it from anywhere in the system to analyze logs, investigate IPs, and correlate events.</p>
            <button class="btn btn-ai" on:click={() => aiCopilotStore.openPanel()} style="background: #3b82f6; color: var(--text-primary); border: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer;">
              Open Global AI Copilot
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

<style>
  .page-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  
  .header-container {
    padding: 12px 24px;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border);
  }
  
  .title-bg {
    display: inline-block;
    background: #d1d5db; /* Gray background for title like in image */
    padding: 4px 12px;
    border-radius: 4px;
  }
  
  :global([data-theme="dark"]) .title-bg {
    background: #374151;
  }
  
  .page-title {
    font-size: 18px;
    font-weight: 700;
    margin: 0;
    color: var(--text-primary);
  }
  
  :global([data-theme="dark"]) .page-title {
    color: #f9fafb;
  }
  
  .content-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    background: var(--bg-primary);
  }
  
  .action-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  
  .spacer {
    flex: 1;
  }
  
  .ai-dashboard-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    max-width: 1400px;
    margin: 0 auto;
  }
  
  .grid-full {
    grid-column: span 2;
  }
  
  .grid-half {
    grid-column: span 1;
  }
  
  .copilot-card {
    background: #ffffff;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    height: 100%;
  }
  .card-header {
    padding: 16px;
    border-bottom: 1px solid #f1f5f9;
  }
  .card-header h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--text-primary);
  }
</style>

</div>
