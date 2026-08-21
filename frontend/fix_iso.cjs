const fs = require('fs');
const file = 'src/routes/dashboard/soar/+page.svelte';
let content = fs.readFileSync(file, 'utf8');

// Replace the buggy snippet
content = content.replace(
  /\{\#if isIsolated\}\s*<div class="iso-terminal"><code>interface \{portInfo\.port\}\\n shutdown\\n description \[SIEM-BLOCKED\]<\/code><\/div>\s*\{:else\}\s*<div class="action-note">N\/A for External IP<\/div>\s*\{\/if\}/,
  `{#if isIsolated}\n                  <div class="iso-terminal"><code>interface {portInfo.port}\\n shutdown\\n description [SIEM-BLOCKED]</code></div>\n                {/if}\n              {:else}\n                <div class="action-note">N/A for External IP</div>\n              {/if}`
);

fs.writeFileSync(file, content);
console.log('Fixed missing if in soar');
