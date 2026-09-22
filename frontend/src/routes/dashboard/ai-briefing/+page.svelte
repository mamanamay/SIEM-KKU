<svelte:head>
  <title>AI Daily Briefing - KKUSIEM</title>
</svelte:head>

<script lang="ts">
  import { onMount } from 'svelte';
  import { eventsStore } from '../../../stores/events';
  import type { AiBriefingContext } from '../../../lib/ReportEngine/types';
  
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

  // Derived stats (built inside generateBriefing)
  let briefingStats = { total: 0, critical: 0, high: 0, medium: 0, low: 0, uniqueIPs: 0 };
  let topTypes: { type: string; count: number }[] = [];
  let topCountries: { country: string; count: number }[] = [];

  // Reactive aiContext for ExportBtn — always up-to-date
  $: aiContext = {
    aiSummary,
    riskLevel,
    confidence,
    generatedAt,
    dataRange,
    priorities,
    recommendations,
    campaigns,
    topOrganizations,
    ...briefingStats,
    topTypes,
    topCountries,
  } satisfies AiBriefingContext;

  async function generateBriefing() {
    loading = true;
    const now = new Date();
    generatedAt = now.toLocaleString();
    
    const total = events.length;
    let critical = 0, high = 0, medium = 0, low = 0;
    const ips = new Set<string>();
    const countries = new Set<string>();
    const typeCount: Record<string, number> = {};
    const countryCount: Record<string, number> = {};
    const ipCount: Record<string, number> = {};
    const orgCount: Record<string, number> = {};
    
    events.forEach(e => {
      if (e.severity === 'critical') critical++;
      else if (e.severity === 'high') high++;
      else if (e.severity === 'medium') medium++;
      else low++;
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

    const _topTypes = Object.entries(typeCount).sort((a:any,b:any) => b[1]-a[1]).slice(0,5).map(x => ({type: x[0], count: x[1] as number}));
    const _topCountries = Object.entries(countryCount).sort((a:any,b:any) => b[1]-a[1]).slice(0,3).map(x => ({country: x[0], count: x[1] as number}));
    const topIPs = Object.entries(ipCount).sort((a:any,b:any) => b[1]-a[1]).slice(0,5).map(x => ({ip: x[0], count: x[1]}));
    topOrganizations = Object.entries(orgCount).sort((a:any,b:any) => b[1]-a[1]).slice(0,5).map(x => ({org: x[0], count: Number(x[1]), percentage: (Number(x[1]) / total) * 100}));

    topTypes = _topTypes;
    topCountries = _topCountries;
    briefingStats = { total, critical, high, medium, low, uniqueIPs: ips.size };

    try {
      const res = await fetch('/api/attacks/ai-briefing', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          total, critical, high, medium,
          uniqueIPs: ips.size, uniqueCountries: countries.size,
          topTypes: _topTypes, topCountries: _topCountries, topIPs, topOrganizations,
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
    generateBriefing();
  });
</script>

<div class="page-container">
  <div style="max-width: 1400px; margin: 0 auto; width: 100%;">
    <PageHeader title="AI Daily Briefing" description="Automated daily security summary and actionable intelligence." icon="ti-brain">
      <div slot="actions">
        <ExportBtn
          config={{ pageType: 'ai-briefing', reportTitle: 'AI Daily Security Briefing', supportedFormats: ['pdf', 'html'], aiEnabled: true, csvEnabled: false, allowExecOnly: true, sections: [] }}
          data={events}
          {aiContext}
        />
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
  
  .content-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    background: var(--bg-primary);
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
</style>
