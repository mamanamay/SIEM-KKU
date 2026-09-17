<svelte:head>
  <title>AI Daily Briefing - KKUSIEM</title>
</svelte:head>

<script lang="ts">
  import { onMount } from 'svelte';
  import { eventsStore } from '../../../stores/events';
  
  import AiSecuritySituation from '../../../lib/components/ai-analyst/AiSecuritySituation.svelte';
  import AiInvestigationPriority from '../../../lib/components/ai-analyst/AiInvestigationPriority.svelte';
  import AiRecommendedActions from '../../../lib/components/ai-analyst/AiRecommendedActions.svelte';
  import AiAttackCorrelation from '../../../lib/components/ai-analyst/AiAttackCorrelation.svelte';
  import AiTargetedOrganizations from '../../../lib/components/ai-analyst/AiTargetedOrganizations.svelte';
  
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import ExportBtn from '../../../lib/components/ExportBtn.svelte';

  $: events = $eventsStore;

  let aiSummary = "กำลังประมวลผลข้อมูลสถานการณ์สรุป... (Generating AI Briefing...)";
  let riskLevel = "Low";
  let confidence = "High";
  let generatedAt = new Date().toLocaleString();
  let dataRange = "ย้อนหลัง 24 ชั่วโมง";
  
  let priorities = [];
  let recommendations: any = { immediate: [], investigation: [], preventive: [] };
  let campaigns = [];
  let topOrganizations = [];
  let loading = true;

  async function generateBriefing() {
    loading = true;
    const now = new Date();
    generatedAt = now.toLocaleString();
    
    const total = events.length;
    let critical = 0, high = 0, medium = 0;
    const ips = new Set();
    const countries = new Set();
    const typeCount = {};
    const countryCount = {};
    const ipCount = {};
    const orgCount = {};
    
    events.forEach(e => {
      if (e.severity === 'critical') critical++;
      if (e.severity === 'high') high++;
      if (e.severity === 'medium') medium++;
      ips.add(e.ip);
      const c = e.country || 'Unknown';
      countries.add(c);
      
      typeCount[e.type] = (typeCount[e.type] || 0) + 1;
      countryCount[c] = (countryCount[c] || 0) + 1;
      ipCount[e.ip] = (ipCount[e.ip] || 0) + 1;
      
      const org = e.organization || e.country || 'Unknown';
      if (org !== 'Unknown') {
        orgCount[org] = (orgCount[org] || 0) + 1;
      }
    });

    const topTypes = Object.entries(typeCount).sort((a:any,b:any) => b[1]-a[1]).slice(0,3).map(x => ({type: x[0], count: x[1]}));
    const topCountries = Object.entries(countryCount).sort((a:any,b:any) => b[1]-a[1]).slice(0,3).map(x => ({country: x[0], count: x[1]}));
    const topIPs = Object.entries(ipCount).sort((a:any,b:any) => b[1]-a[1]).slice(0,5).map(x => ({ip: x[0], count: x[1]}));
    topOrganizations = Object.entries(orgCount).sort((a:any,b:any) => b[1]-a[1]).slice(0,5).map(x => ({org: x[0], count: x[1], percentage: (Number(x[1]) / total) * 100}));

    try {
      const res = await fetch('/api/attacks/ai-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          total, critical, high, medium,
          uniqueIPs: ips.size, uniqueCountries: countries.size,
          topTypes, topCountries, topIPs, topOrganizations,
          date: now.toLocaleDateString()
        })
      });
      if (res.ok) {
        const data = await res.json();
        aiSummary = data.briefing || "No summary returned.";
        if (data.riskLevel) riskLevel = data.riskLevel;
        if (data.confidence) confidence = data.confidence;
        if (data.priorities) priorities = data.priorities;
        if (data.recommendations) recommendations = data.recommendations;
        if (data.campaigns) campaigns = data.campaigns;
      } else {
        aiSummary = "Error fetching AI briefing from backend.";
      }
    } catch (e) {
      aiSummary = "Network error while connecting to backend for AI briefing.";
    }
    loading = false;
  }

  onMount(() => {
    // Generate right away based on current events
    generateBriefing();
  });
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
          isGenerating={loading}
          on:regenerate={generateBriefing}
        />
      </div>
      
      <div class="grid-half">
        <AiInvestigationPriority priorities={priorities} on:investigate={(e) => window.location.href = '/dashboard/hunting?ip=' + e.detail} />
      </div>
      
      <div class="grid-half">
        <AiTargetedOrganizations organizations={topOrganizations} />
      </div>
      
      <div class="grid-half">
        <AiRecommendedActions actions={recommendations} />
      </div>
      
      <div class="grid-half">
        <AiAttackCorrelation correlations={campaigns} />
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
