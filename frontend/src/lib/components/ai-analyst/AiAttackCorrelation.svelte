<script lang="ts">
  export let correlations: any[] = [];
</script>

<div class="corr-card">
  <div class="corr-header">
    <i class="ti ti-git-merge"></i> ความเชื่อมโยงของการโจมตี (Attack Campaigns)
  </div>
  <div class="corr-body">
    {#if correlations.length === 0}
      <div class="empty">ไม่พบความเชื่อมโยงหรือรูปแบบการโจมตีที่เป็นระบบ (No correlated campaigns)</div>
    {:else}
      <div class="campaign-list custom-scrollbar">
        {#each correlations as c}
          <div class="campaign-item">
            <div class="c-head">
              <div class="c-title">{c.campaignName}</div>
              <div class="c-conf">Confidence: {c.confidence}</div>
            </div>
            <div class="c-reason">{c.reason}</div>
            
            <div class="timeline">
              {#each c.timeline as t}
                <div class="tl-item">
                  <div class="tl-dot"></div>
                  <div class="tl-time">{t.time}</div>
                  <div class="tl-content">
                    <strong>{t.type}</strong> from {t.ip}
                    <div class="tl-desc">{t.desc}</div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .corr-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    margin-bottom: 20px;
    overflow: hidden;
  }
  .corr-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    font-weight: 700;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(139, 92, 246, 0.05);
    color: #7c3aed;
  }
  .corr-body { padding: 20px; }
  .empty { color: var(--text-muted); font-size: 14px; font-style: italic; }
  
  .campaign-item {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
  }
  .c-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .c-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
  }
  .c-conf {
    font-size: 12px;
    background: var(--bg-secondary);
    padding: 4px 8px;
    border-radius: 4px;
    color: var(--text-muted);
  }
  .c-reason {
    font-size: 13px;
    color: var(--text-primary);
    margin-bottom: 16px;
  }
  
  .timeline {
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: relative;
    padding-left: 12px;
  }
  .timeline::before {
    content: '';
    position: absolute;
    left: 16px;
    top: 6px;
    bottom: 6px;
    width: 2px;
    background: #e2e8f0;
  }
  .tl-item {
    position: relative;
    padding-left: 20px;
    display: flex;
    gap: 12px;
  }
  .tl-dot {
    position: absolute;
    left: -2px;
    top: 4px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #8b5cf6;
    border: 2px solid white;
    z-index: 2;
  }
  .tl-time {
    font-size: 12px;
    color: var(--text-muted);
    min-width: 60px;
  }
  .tl-content {
    font-size: 13px;
    color: var(--text-primary);
  }
  .tl-desc {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 2px;
  }
</style>
