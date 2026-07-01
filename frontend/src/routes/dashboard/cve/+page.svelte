<script lang="ts">
  let searchQuery = '';
  let loading = false;
  let cveData: any = null;
  let errorMsg = '';

  async function searchCVE() {
    if (!searchQuery) return;
    
    // Auto-format "2021-44228" to "CVE-2021-44228"
    let id = searchQuery.trim().toUpperCase();
    if (/^\d{4}-\d{4,}$/.test(id)) {
      id = 'CVE-' + id;
    }
    
    if (!id.startsWith('CVE-')) {
      errorMsg = 'Please enter a valid CVE ID (e.g., CVE-2021-44228)';
      cveData = null;
      return;
    }

    loading = true;
    errorMsg = '';
    cveData = null;

    try {
      const res = await fetch(`https://cveawg.mitre.org/api/cve/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('CVE not found in MITRE database.');
        throw new Error('Failed to fetch data from MITRE CVE API.');
      }
      const data = await res.json();
      cveData = data;
    } catch (err: any) {
      errorMsg = err.message || 'An error occurred';
    } finally {
      loading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') searchCVE();
  }

  function formatVersions(versions: any[]): string {
    if (!versions) return '';
    return versions.map((v: any) => v.version).join(', ');
  }
</script>

<div class="cve-page">
  <!-- Page Header -->
  <div class="ds-card-head" style="margin-bottom:0;">
    <div>
      <div class="ds-card-title"><i class="ti ti-database-search"></i> CVE Lookup</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Search real-time vulnerability data from the official MITRE CVE Database.</div>
    </div>
  </div>

  <!-- Search Bar -->
  <div class="ds-card" style="padding:16px 20px;">
    <div style="display:flex; gap: 12px; align-items:center;">
      <div class="ds-search" style="flex:1;">
        <i class="ti ti-search"></i>
        <input type="text" bind:value={searchQuery} on:keydown={handleKeydown} placeholder="Enter CVE ID (e.g., CVE-2021-44228)..." />
      </div>
      <button class="ds-btn primary" on:click={searchCVE} disabled={loading}>
        {#if loading} <i class="ti ti-loader spin"></i> {:else} Search {/if}
      </button>
    </div>
  </div>

  {#if errorMsg}
    <div class="ds-card" style="border-color: var(--red); background: var(--bg-panel);">
      <div style="color: var(--red); display:flex; align-items:center; gap:8px;">
        <i class="ti ti-alert-triangle"></i> {errorMsg}
      </div>
    </div>
  {/if}

  {#if cveData}
    {@const cna = cveData.containers?.cna}
    <div class="cve-card ds-card">
      <div class="cve-head">
        <div class="cve-id-group">
          <h3 class="cve-id ds-mono">{cveData.cveMetadata.cveId}</h3>
          <span class="cve-name">{cveData.cveMetadata.state}</span>
        </div>
        <div class="cve-badges">
          <span class="ds-badge gray"><i class="ti ti-calendar"></i> Published: {cveData.cveMetadata.datePublished ? cveData.cveMetadata.datePublished.substring(0,10) : 'Unknown'}</span>
          {#if cveData.cveMetadata.assignerShortName}
            <span class="ds-badge blue">Assigner: {cveData.cveMetadata.assignerShortName}</span>
          {/if}
        </div>
      </div>

      <p class="cve-desc">
        {cna?.descriptions?.[0]?.value || 'No description available.'}
      </p>

      {#if cna?.affected && cna.affected.length > 0}
        <div class="cve-detail-box" style="margin-top:20px;">
          <i class="ti ti-box"></i>
          <div>
            <div class="cve-detail-label">Affected Products</div>
            <div class="cve-detail-val">
              <ul style="margin:0; padding-left:20px; list-style-type:circle;">
                {#each cna.affected as aff}
                  <li>{aff.vendor || 'Unknown Vendor'} - {aff.product || 'Unknown Product'} 
                    {#if aff.versions}
                      (Versions: {formatVersions(aff.versions)})
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>
          </div>
        </div>
      {/if}

      {#if cna?.references && cna.references.length > 0}
        <div class="cve-detail-box" style="margin-top:10px;">
          <i class="ti ti-link"></i>
          <div>
            <div class="cve-detail-label">References</div>
            <div class="cve-detail-val">
              <ul style="margin:0; padding-left:20px; list-style-type:circle;">
                {#each cna.references.slice(0, 5) as ref}
                  <li><a href="{ref.url}" target="_blank" rel="noopener noreferrer" style="color:var(--accent); text-decoration:none;">{ref.url}</a></li>
                {/each}
                {#if cna.references.length > 5}
                  <li style="color:var(--text-muted); font-size:12px;">+ {cna.references.length - 5} more links...</li>
                {/if}
              </ul>
            </div>
          </div>
        </div>
      {/if}
      
      <div style="margin-top:20px; text-align:right;">
        <a href="https://nvd.nist.gov/vuln/detail/{cveData.cveMetadata.cveId}" target="_blank" class="ds-btn outline">View on NVD <i class="ti ti-external-link"></i></a>
      </div>
    </div>
  {:else if !loading && !errorMsg}
    <div class="ds-card" style="text-align:center; padding: 60px 20px; color: var(--text-muted);">
      <i class="ti ti-search" style="font-size:48px; opacity:0.2; margin-bottom:16px; display:block;"></i>
      <div>Enter a CVE ID above to fetch real-time vulnerability data from MITRE.</div>
    </div>
  {/if}
</div>

<style>
  .cve-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-bottom: 2rem;
  }
  .cve-card {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    transition: 0.2s;
  }
  .cve-card:hover {
    border-color: var(--accent);
  }
  .cve-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .cve-id-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cve-id {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--accent);
  }
  .cve-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }
  .cve-badges {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .ds-badge {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .ds-badge.red { background: rgba(255, 60, 60, 0.1); color: #ff5555; border: 1px solid rgba(255, 60, 60, 0.2); }
  .ds-badge.orange { background: rgba(255, 150, 0, 0.1); color: #ffb84d; border: 1px solid rgba(255, 150, 0, 0.2); }
  .ds-badge.blue { background: rgba(0, 160, 255, 0.1); color: #4db8ff; border: 1px solid rgba(0, 160, 255, 0.2); }
  .ds-badge.gray { background: rgba(255, 255, 255, 0.05); color: var(--text-secondary); border: 1px solid var(--border); }
  .ds-badge.green { background: rgba(0, 200, 100, 0.1); color: #2ecc71; border: 1px solid rgba(0, 200, 100, 0.2); }

  .cve-desc {
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.6;
    margin: 0;
  }
  
  .cve-detail-box {
    display: flex;
    gap: 12px;
    background: var(--bg-secondary);
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid var(--border);
  }
  .cve-detail-box i {
    font-size: 20px;
    color: var(--text-muted);
    margin-top: 2px;
  }
  .cve-detail-label {
    font-size: 11px;
    text-transform: uppercase;
    font-weight: 700;
    color: var(--text-muted);
    margin-bottom: 4px;
  }
  .cve-detail-val {
    font-size: 13px;
    color: var(--text-primary);
    line-height: 1.5;
  }
  
  .ds-btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .ds-btn.primary {
    background: var(--accent);
    color: #000;
  }
  .ds-btn.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .ds-btn.outline {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-primary);
  }
  .ds-btn.outline:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  
  @keyframes spin { 100% { transform: rotate(360deg); } }
  .spin { animation: spin 1s linear infinite; }
</style>
