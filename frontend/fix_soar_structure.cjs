const fs = require('fs');
const file = 'src/routes/dashboard/soar/+page.svelte';
let content = fs.readFileSync(file, 'utf8');

// The file currently has:
//   <!-- Right Panel: Deep Investigation -->
//   <div class="bento-cell mid-panel">
//     {#if expandedEvent}
// ...
//       </div>
//     </div> <!-- end mid-panel -->
//     
//     <!-- Right Panel -->
//     {#if expandedEvent}
//     <div class="bento-cell right-panel">
// ...
//     {/if}
//       
//       {:else}
//           <div class="empty-state">...</div>
//     {/if}

// Let's rip out all the malformed wrappers and apply a clean one!

// 1. Remove the `<div class="bento-cell mid-panel">` and `{#if expandedEvent}` at the top of mid-panel.
content = content.replace(
  /<!-- Right Panel: Deep Investigation -->\s*<div class="bento-cell mid-panel">\s*\{#if expandedEvent\}/,
  `<!-- Right Panel: Deep Investigation -->\n  {#if expandedEvent}\n  <div class="bento-cell mid-panel">`
);

// 2. Remove `</div> <!-- end mid-panel -->` and the second `{#if expandedEvent}`
content = content.replace(
  /<\/div> <!-- end mid-panel -->\s*<!-- Right Panel -->\s*\{#if expandedEvent\}/,
  `</div> <!-- end mid-panel -->\n    \n    <!-- Right Panel -->`
);

// 3. Remove the `{/if}` right before `{:else}`
content = content.replace(
  /\{\/if\}\s*\{:else\}/,
  `{:else}`
);

// 4. Wrap the empty state with the mid-panel (span 2)
content = content.replace(
  /\{:else\}\s*<div class="empty-state">/,
  `{:else}\n    <div class="bento-cell mid-panel" style="grid-column: span 2;">\n      <div class="empty-state">`
);

// 5. Add closing div before `{/if}` at the very end (to close the empty-state mid-panel)
content = content.replace(
  /<\/div>\s*\{\/if\}\s*<\/div>\s*<\/div>/,
  `</div>\n    </div>\n  {/if}\n</div>\n</div>`
);

fs.writeFileSync(file, content);
console.log('Fixed soar page structure');
