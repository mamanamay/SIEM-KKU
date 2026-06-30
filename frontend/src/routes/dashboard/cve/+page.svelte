<script lang="ts">
  // Mock CVE Data for demonstration purposes
  const cveDatabase = [
    {
      id: 'CVE-2021-44228',
      name: 'Log4Shell',
      date: '2021-12-10',
      cvss: 10.0,
      severity: 'Critical',
      description: 'Apache Log4j2 JNDI features do not protect against attacker controlled LDAP and other JNDI related endpoints. Allows Remote Code Execution (RCE).',
      affected: 'Apache Log4j2 2.0-beta9 through 2.14.1',
      mitigation: 'Upgrade to Log4j 2.15.0 or later, or set log4j2.formatMsgNoLookups=true'
    },
    {
      id: 'CVE-2014-0160',
      name: 'Heartbleed',
      date: '2014-04-07',
      cvss: 7.5,
      severity: 'High',
      description: 'The (1) TLS and (2) DTLS implementations in OpenSSL 1.0.1 before 1.0.1g do not properly handle Heartbeat Extension packets, allowing remote attackers to read memory.',
      affected: 'OpenSSL 1.0.1 through 1.0.1f',
      mitigation: 'Upgrade to OpenSSL 1.0.1g or recompile with -DOPENSSL_NO_HEARTBEATS'
    },
    {
      id: 'CVE-2017-0144',
      name: 'EternalBlue (WannaCry)',
      date: '2017-03-14',
      cvss: 8.1,
      severity: 'High',
      description: 'The SMBv1 server in Microsoft Windows allows remote attackers to execute arbitrary code via crafted packets. Used heavily by ransomware.',
      affected: 'Windows 7, Windows 8.1, Windows Server 2008/2012/2016',
      mitigation: 'Apply MS17-010 patch and disable SMBv1 across the network'
    },
    {
      id: 'CVE-2024-3094',
      name: 'XZ Utils Backdoor',
      date: '2024-03-29',
      cvss: 10.0,
      severity: 'Critical',
      description: 'Malicious code was discovered in the upstream tarballs of xz, starting with version 5.6.0. Through a series of complex obfuscations, it intercepts RSA decryption in sshd, allowing bypass of SSH authentication.',
      affected: 'XZ Utils 5.6.0, 5.6.1',
      mitigation: 'Downgrade to XZ Utils 5.4.6 or earlier immediately'
    },
    {
      id: 'CVE-2023-38831',
      name: 'WinRAR Spoofing',
      date: '2023-08-23',
      cvss: 7.8,
      severity: 'High',
      description: 'WinRAR before 6.23 allows attackers to execute arbitrary code when a user attempts to view a benign file within a ZIP archive.',
      affected: 'WinRAR versions before 6.23',
      mitigation: 'Upgrade WinRAR to version 6.23 or newer'
    },
    {
      id: 'CVE-2023-23397',
      name: 'Outlook NTLM Theft',
      date: '2023-03-14',
      cvss: 9.8,
      severity: 'Critical',
      description: 'Microsoft Outlook Elevation of Privilege Vulnerability allowing attackers to steal NTLM hashes by simply sending a crafted email. No user interaction required.',
      affected: 'Microsoft Outlook (all supported versions)',
      mitigation: 'Apply Microsoft Security Patch and block outbound SMB (port 445)'
    },
    {
      id: 'CVE-2021-34527',
      name: 'PrintNightmare',
      date: '2021-07-01',
      cvss: 8.8,
      severity: 'High',
      description: 'A remote code execution vulnerability exists when the Windows Print Spooler service improperly performs privileged file operations.',
      affected: 'Windows Print Spooler on all Windows versions',
      mitigation: 'Disable Print Spooler service or apply Microsoft emergency patch'
    }
  ];

  let searchQuery = '';
  let filteredCVEs = cveDatabase;

  $: {
    const term = searchQuery.toLowerCase();
    if (!term) {
      filteredCVEs = cveDatabase;
    } else {
      filteredCVEs = cveDatabase.filter(cve => 
        cve.id.toLowerCase().includes(term) ||
        cve.name.toLowerCase().includes(term) ||
        cve.description.toLowerCase().includes(term)
      );
    }
  }

  function getSeverityClass(severity: string) {
    switch (severity.toLowerCase()) {
      case 'critical': return 'b-red';
      case 'high': return 'b-orange';
      case 'medium': return 'b-cyan';
      default: return 'b-cyan';
    }
  }
</script>

<div class="page-container">
  <div class="page-header">
    <div class="page-title"><i class="ti ti-database-search"></i> CVE Intelligence Database</div>
    <div class="page-subtitle">Search and explore known Common Vulnerabilities and Exposures (CVEs)</div>
  </div>

  <div class="panel search-panel">
    <div class="search-box">
      <i class="ti ti-search search-icon"></i>
      <input 
        type="text" 
        bind:value={searchQuery} 
        placeholder="Search by CVE ID (e.g., CVE-2021-44228), Name, or Keyword..." 
        class="search-input"
      />
    </div>
    <div class="search-meta">
      Found <strong>{filteredCVEs.length}</strong> vulnerabilities in local intelligence cache.
    </div>
  </div>

  <div class="cve-list">
    {#each filteredCVEs as cve}
      <div class="panel cve-card">
        <div class="cve-header">
          <div class="cve-id-group">
            <h3 class="cve-id">{cve.id}</h3>
            <span class="cve-name">{cve.name}</span>
          </div>
          <div class="cve-badges">
            <span class="badge {getSeverityClass(cve.severity)}">
              {cve.severity} (CVSS: {cve.cvss.toFixed(1)})
            </span>
            <span class="badge b-outline">{cve.date}</span>
          </div>
        </div>
        
        <div class="cve-body">
          <p class="cve-desc"><strong>Description:</strong> {cve.description}</p>
          <div class="cve-details-grid">
            <div class="detail-box">
              <i class="ti ti-box"></i>
              <div>
                <div class="detail-label">Affected Products</div>
                <div class="detail-value">{cve.affected}</div>
              </div>
            </div>
            <div class="detail-box">
              <i class="ti ti-shield-check"></i>
              <div>
                <div class="detail-label">Mitigation / Patch</div>
                <div class="detail-value">{cve.mitigation}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/each}
    
    {#if filteredCVEs.length === 0}
      <div class="panel no-results">
        <i class="ti ti-file-search"></i>
        <h3>No CVEs found</h3>
        <p>Try adjusting your search keywords.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .page-container { padding: 1.5rem; max-width: 1400px; margin: 0 auto; }
  .page-header { margin-bottom: 1.5rem; }
  .page-title { font-size: 1.5rem; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .page-title i { color: var(--accent); }
  .page-subtitle { font-size: 13px; color: var(--text-secondary); }

  .panel { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; box-shadow: var(--shadow-sm); }
  
  .search-panel { margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 10px; }
  .search-box { position: relative; width: 100%; }
  .search-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 18px; }
  .search-input { 
    width: 100%; padding: 14px 16px 14px 45px; 
    background: var(--bg-secondary); border: 1px solid var(--border); 
    border-radius: 8px; color: var(--text-primary); font-size: 14px; 
    transition: all 0.2s;
  }
  .search-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1); }
  .search-meta { font-size: 12px; color: var(--text-muted); text-align: right; }

  .cve-list { display: flex; flex-direction: column; gap: 1rem; }
  
  .cve-card { transition: transform 0.2s, box-shadow 0.2s; }
  .cve-card:hover { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(0,0,0,0.2); border-color: rgba(255,255,255,0.1); }
  
  .cve-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
  .cve-id-group { display: flex; flex-direction: column; gap: 4px; }
  .cve-id { font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin: 0; font-family: monospace; }
  .cve-name { font-size: 13px; color: var(--text-secondary); font-weight: 600; }
  
  .cve-badges { display: flex; gap: 8px; }
  .badge { font-size: 11px; padding: 4px 10px; border-radius: 6px; font-weight: 600; letter-spacing: 0.03em; }
  .b-red { background: rgba(255, 51, 51, 0.15); color: #ff3333; border: 1px solid rgba(255, 51, 51, 0.4); }
  .b-orange { background: rgba(255, 136, 0, 0.15); color: #ff8800; border: 1px solid rgba(255, 136, 0, 0.4); }
  .b-cyan { background: rgba(0, 212, 255, 0.15); color: #00d4ff; border: 1px solid rgba(0, 212, 255, 0.4); }
  .b-outline { background: transparent; color: var(--text-muted); border: 1px solid var(--border); }

  .cve-body { font-size: 13px; line-height: 1.5; color: var(--text-secondary); }
  .cve-desc { margin-bottom: 15px; }
  .cve-desc strong { color: var(--text-primary); }
  
  .cve-details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
  .detail-box { 
    display: flex; gap: 12px; align-items: flex-start;
    background: var(--bg-secondary); padding: 12px; border-radius: 8px; border: 1px solid var(--border);
  }
  .detail-box i { font-size: 18px; color: var(--accent); margin-top: 2px; }
  .detail-label { font-size: 11px; text-transform: uppercase; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; }
  .detail-value { font-size: 13px; color: var(--text-primary); }

  .no-results { text-align: center; padding: 3rem 1rem; color: var(--text-muted); }
  .no-results i { font-size: 3rem; margin-bottom: 1rem; opacity: 0.5; }
  .no-results h3 { font-size: 1.2rem; color: var(--text-primary); margin-bottom: 0.5rem; }
</style>
