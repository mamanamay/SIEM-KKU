const fs = require('fs');
const file = 'src/routes/dashboard/soar/+page.svelte';
let content = fs.readFileSync(file, 'utf8');

// 1. CSS
content = content.replace(
  '.bento-layout { display: flex; gap: 24px; height: calc(100vh - 100px); padding-bottom: 24px; box-sizing: border-box; }',
  '.bento-layout { display: flex; gap: 16px; height: calc(100vh - 90px); padding-bottom: 16px; box-sizing: border-box; }'
);
content = content.replace(
  '.left-panel { width: 350px; flex-shrink: 0; }',
  '.left-panel { width: 280px; flex-shrink: 0; }'
);
content = content.replace(
  '.right-panel { flex: 1; }',
  '.mid-panel { flex: 1; min-width: 0; overflow-y: auto; }\n  .right-panel { width: 340px; flex-shrink: 0; overflow-y: auto; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-xl); display: flex; flex-direction: column; padding: 20px; box-sizing: border-box; gap: 24px; }'
);

// 2. Imports
content = content.replace(
  "import { downloadPDF, downloadHTML } from '../../../lib/utils/export';",
  "import { downloadPDF, downloadHTML } from '../../../lib/utils/export';\n  import { callKKUAI, getKKUAIKey, getKKUAIModel } from '../../../lib/utils/kkuai';\n  import AiKeyModal from '../../../lib/components/AiKeyModal.svelte';"
);

// 3. Logic
const aiLogic = 
  let showAiKeyModal = false;
  let aiAnalysis = '';
  let isAiLoading = false;

  async function analyzeWithAI() {
    if (!expandedEvent) return;
    const apiKey = getKKUAIKey();
    if (!apiKey) {
      showAiKeyModal = true;
      return;
    }
    isAiLoading = true;
    aiAnalysis = '';
    const messages = [
      { role: 'system', content: 'You are an expert SOC Analyst. Keep response concise, bullet points, in Thai.' },
      { role: 'user', content: \Analyze this incident:\\nIP: \\\nType: \\\nSeverity: \\\nDetail: \\\n\\nProvide a short risk assessment and recommended SOAR action (in Thai).\ }
    ];
    try {
      await callKKUAI(apiKey, getKKUAIModel(), messages, (chunk) => {
        aiAnalysis += chunk;
      });
    } catch(e) {
      aiAnalysis = 'Error connecting to KKU AI.';
    }
    isAiLoading = false;
  }
;
content = content.replace('let blockedIPs = new Set<string>();', aiLogic + '\n  let blockedIPs = new Set<string>();');

// 4. Modals
content = content.replace('<!-- Modals -->', '<!-- Modals -->\n<AiKeyModal show={showAiKeyModal} onClose={() => showAiKeyModal = false} onSaved={() => { showAiKeyModal = false; analyzeWithAI(); }} />\n');

// 5. Layout swap
// Rename bento-cell right-panel to mid-panel
content = content.replace('<div class="bento-cell right-panel">', '<div class="bento-cell mid-panel">');

// Extract Actions
const parts = content.split('          <!-- Actions -->');
const actionsAndRest = parts[1];
const actionsParts = actionsAndRest.split('        <div class="detail-section" style="margin-top:24px;">');

const actionsHtml = actionsParts[0].trim().replace('</div>\\n        </div>', '</div>');
// Remove the extra closing </div></div> from actionsHtml if any. 
// Actually, investigate-grid-2 is closed before Attack Timeline. Let's not split it blindly.
let c2 = content;
const actionsRegex = /          <!-- Actions -->.*?<\/div>\s*<\/div>/s;
const match = c2.match(actionsRegex);
if(match) {
  const actionsBlock = match[0];
  c2 = c2.replace(actionsBlock, '        </div> <!-- end investigate-grid-2 -->');
  
  // Now replace where mid-panel ends and insert right panel
  const endMidPanelStr =     {:else}
      <div class="empty-state">;
      
  const rightPanelHtml =     </div> <!-- end mid-panel -->
    
    <!-- Right Panel -->
    {#if expandedEvent}
    <div class="bento-cell right-panel">
      <div class="detail-section">
        <h3 class="section-title"><i class="ti ti-brain"></i> KKU AI Analysis</h3>
        <div style="background:rgba(29,158,117,0.1); border:1px solid rgba(29,158,117,0.3); border-radius:8px; padding:12px; margin-bottom:20px; font-size:13px; color:var(--text-main);">
          {#if aiAnalysis}
            <div style="white-space:pre-wrap; line-height:1.5;">{aiAnalysis}</div>
          {:else}
            <div style="color:var(--text-muted); text-align:center; padding:10px;">
              {#if isAiLoading}
                <i class="ti ti-loader-2 spin"></i> กําลังวิเคราะห์...
              {:else}
                กดปุ่มด้านล่างเพื่อวิเคราะห์เหตุการณ์นี้ด้วย AI
              {/if}
            </div>
          {/if}
          {#if !isAiLoading}
            <button class="bento-btn" style="width:100%; margin-top:12px; background:var(--color-cyan); color:#000; border:none;" on:click={analyzeWithAI}>
              <i class="ti ti-sparkles"></i> {aiAnalysis ? 'Regenerate Analysis' : 'Analyze with AI'}
            </button>
          {/if}
        </div>
      </div>
      
 + actionsBlock + 
    </div>
    {/if}
    
    {:else}
      <div class="empty-state" style="grid-column: span 2;">;
      
  c2 = c2.replace(endMidPanelStr, rightPanelHtml);
  fs.writeFileSync(file, c2);
  console.log('Done!');
}
