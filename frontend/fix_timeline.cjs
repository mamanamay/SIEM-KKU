const fs = require('fs');
const file = 'src/routes/dashboard/hunting/+page.svelte';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('import AttackTimeline')) {
  content = content.replace(/import { downloadCSV, downloadHTML } from '\.\.\/\.\.\/\.\.\/lib\/utils\/export';/, "import { downloadCSV, downloadHTML } from '../../../lib/utils/export';\n  import AttackTimeline from '../../../lib/components/AttackTimeline.svelte';");
}

const timelineSection = `
  <!-- Attack Timeline (only show if we have events and it's not a huge dataset) -->
  {#if filteredEvents.length > 0 && filteredEvents.length <= 1000}
    <div class="card" style="margin-top: 20px;">
      <div class="card-head">
        <div class="card-title"><i class="ti ti-chart-bar"></i> Attack Timeline</div>
      </div>
      <div style="padding: 12px 16px;">
        <AttackTimeline events={filteredEvents} />
      </div>
    </div>
  {/if}
`;

if (!content.includes('<AttackTimeline')) {
  // insert before the main table card
  content = content.replace(/<div class="card">[\s]*<div class="card-head">[\s]*<div class="card-title"><i class="ti ti-table"><\/i> Search Results/, timelineSection + '\n  <div class="card">\n    <div class="card-head">\n      <div class="card-title"><i class="ti ti-table"></i> Search Results');
}

fs.writeFileSync(file, content);
console.log('Added AttackTimeline to hunting');
