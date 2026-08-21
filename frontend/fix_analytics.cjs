const fs = require('fs');
const file = 'src/routes/dashboard/analytics/+page.svelte';
let content = fs.readFileSync(file, 'utf8');

// 1. Add Chart.js import
content = content.replace("import { downloadHTML, downloadPDF } from '../../../lib/utils/export';", "import { downloadHTML, downloadPDF } from '../../../lib/utils/export';\n  import Chart from 'chart.js/auto';\n  import { onMount } from 'svelte';");

// 2. Add chart script logic
const chartLogic = `
  let chartType: any;
  let chartIp: any;
  let chartCanvasType: HTMLCanvasElement;
  let chartCanvasIp: HTMLCanvasElement;

  $: if (activeTab === 'overview' && chartCanvasType && topTypes.length) {
    if (chartType) chartType.destroy();
    chartType = new Chart(chartCanvasType, {
      type: 'doughnut',
      data: {
        labels: topTypes.map(t => shortType(t.type)),
        datasets: [{
          data: topTypes.map(t => t.count),
          backgroundColor: topTypes.map(t => getTypeColor(t.type)),
          borderWidth: 0
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#9ca3af' } } } }
    });
  }

  $: if (activeTab === 'overview' && chartCanvasIp && topIps.length) {
    if (chartIp) chartIp.destroy();
    chartIp = new Chart(chartCanvasIp, {
      type: 'bar',
      data: {
        labels: topIps.slice(0, 5).map(t => t.ip),
        datasets: [{
          label: 'Hits',
          data: topIps.slice(0, 5).map(t => t.count),
          backgroundColor: topIps.slice(0, 5).map((t,i) => i===0?'#ef4444':i<3?'#f97316':'#10b981'),
          borderRadius: 4
        }]
      },
      options: { 
        responsive: true, maintainAspectRatio: false, 
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#9ca3af', font: { size: 10 } } },
          y: { ticks: { color: '#9ca3af' }, beginAtZero: true }
        }
      }
    });
  }
`;
content = content.replace("$: payloadEvents = events.filter(e => e.detail && e.detail.length > 3);", "$: payloadEvents = events.filter(e => e.detail && e.detail.length > 3);\n" + chartLogic);

// 3. Update HTML for charts
const oldHtmlIps = `        {#if topIps.length === 0}
          <div class="empty-state"><i class="ti ti-database-off"></i><br>ไม่มีข้อมูลการโจมตี</div>
        {:else}
          <div class="rank-list">`;
const newHtmlIps = `        {#if topIps.length === 0}
          <div class="empty-state"><i class="ti ti-database-off"></i><br>ไม่มีข้อมูลการโจมตี</div>
        {:else}
          <div style="height: 200px; padding: 16px;"><canvas bind:this={chartCanvasIp}></canvas></div>
          <div class="rank-list" style="border-top:1px solid var(--border);">`;
content = content.replace(oldHtmlIps, newHtmlIps);

const oldHtmlTypes = `        {#if topTypes.length === 0}
          <div class="empty-state"><i class="ti ti-database-off"></i><br>ไม่มีข้อมูลการโจมตี</div>
        {:else}
          <div class="type-chips">`;
const newHtmlTypes = `        {#if topTypes.length === 0}
          <div class="empty-state"><i class="ti ti-database-off"></i><br>ไม่มีข้อมูลการโจมตี</div>
        {:else}
          <div style="height: 200px; padding: 16px;"><canvas bind:this={chartCanvasType}></canvas></div>
          <div class="type-chips" style="border-top:1px solid var(--border);">`;
content = content.replace(oldHtmlTypes, newHtmlTypes);

fs.writeFileSync(file, content);
console.log('Done analytics/+page.svelte');
