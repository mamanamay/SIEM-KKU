<script lang="ts">
  import { onMount, tick } from 'svelte';
  import PageHeader from '../../../../lib/components/PageHeader.svelte';
  import ConfirmModal from '../../../../lib/components/ConfirmModal.svelte';
  import { showNotification } from '../../../../stores/notificationStore';

  type Token = { id: string; name: string; prefix: string; scopes: string[]; allowedCidrs: string[]; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null };
  let overview: any = null;
  let loading = true;
  let failure = '';
  let tab: 'rest' | 'mcp' | 'activity' = 'rest';
  let busy = false;
  let drawer = false;
  let rotating: Token | null = null;
  let name = '';
  let days = 30;
  let scopes: string[] = [];
  let allowedCidrs = '';
  let issuedSecret = '';
  let revealSecret = false;
  let testSecret = '';
  let testResult = '';
  let activities: any[] = [];
  let confirmation: Token | null = null;
  const scopeNames: Record<string, string> = { 'catalog:read': 'อ่านทะเบียน endpoint', 'integrations:read': 'อ่านการเชื่อมต่อที่ตัดข้อมูลลับ', 'health:read': 'อ่านสถานะ API' };
  $: tokens = (overview?.tokens?.items || []) as Token[];
  $: activeCount = tokens.filter(token => !token.revokedAt && Date.parse(token.expiresAt) > Date.now()).length;
  $: baseUrl = overview?.baseUrl || 'https://odt-siem-uat.kku.ac.th';
  $: curlExample = 'curl -H "Authorization: Bearer <YOUR_TOKEN>" "' + baseUrl + '/api/v1/integration-catalog"';
  $: mcpConfiguration = JSON.stringify({ mcpServers: { 'siem-kku': { url: baseUrl + '/api/v1/mcp', headers: { Authorization: 'Bearer <YOUR_TOKEN>' } } } }, null, 2);

  async function sessionFetch(path: string, options: RequestInit = {}) {
    const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token'), ...options.headers } });
    const data = await response.json();
    if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Request failed (' + response.status + ')');
    return data;
  }
  async function refresh() {
    try { overview = await sessionFetch('/api/developer/overview'); failure = ''; }
    catch (error) { failure = error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ'; }
    finally { loading = false; }
  }
  onMount(() => { void refresh(); });
  function status(token: Token) { return token.revokedAt ? 'เพิกถอนแล้ว' : Date.parse(token.expiresAt) <= Date.now() ? 'หมดอายุ' : 'พร้อมใช้'; }
  function formatted(date: string | null) { return date ? new Date(date).toLocaleString('th-TH') : 'ยังไม่ได้ใช้งาน'; }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); showNotification('success', 'คัดลอกแล้ว', 'เก็บ credential ไว้ในที่ปลอดภัย'); }
    catch { showNotification('error', 'คัดลอกไม่สำเร็จ', 'กรุณาคัดลอกจากช่องข้อความ'); }
  }
  async function openCreate(token: Token | null = null) {
    rotating = token; name = token?.name || ''; scopes = token?.scopes.filter(scope => overview.tokens.allowedScopes.includes(scope)) || [...overview.tokens.allowedScopes];
    allowedCidrs = token?.allowedCidrs.join('\n') || ''; days = 30; drawer = true;
    await tick(); document.getElementById('token-name')?.focus();
  }
  function drawerKeys(event: KeyboardEvent) {
    if (!drawer) return;
    if (event.key === 'Escape' && !busy) { event.preventDefault(); drawer = false; }
    if (event.key !== 'Tab') return;
    const controls = Array.from(document.querySelectorAll<HTMLElement>('.token-drawer button:not(:disabled), .token-drawer input:not(:disabled), .token-drawer select, .token-drawer textarea'));
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  async function createToken() {
    busy = true;
    try {
      const body = { name, scopes, expiresInDays: Number(days), allowedCidrs: allowedCidrs.split(/[\n,]+/).map(value => value.trim()).filter(Boolean) };
      const result = await sessionFetch(rotating ? '/api/developer/tokens/' + rotating.id + '/rotate' : '/api/developer/tokens', { method: 'POST', body: JSON.stringify(body) });
      issuedSecret = result.token; revealSecret = false; drawer = false; testResult = ''; testSecret = '';
      await refresh(); showNotification('success', 'สร้าง token แล้ว', 'token เต็มจะแสดงครั้งนี้เท่านั้น');
    } catch (error) { showNotification('error', 'สร้าง token ไม่สำเร็จ', error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'); }
    finally { busy = false; }
  }
  async function revoke() {
    if (!confirmation) return;
    busy = true;
    try { await sessionFetch('/api/developer/tokens/' + confirmation.id, { method: 'DELETE' }); confirmation = null; await refresh(); showNotification('success', 'เพิกถอนแล้ว', 'token นี้จะใช้เรียก API ต่อไม่ได้'); }
    catch (error) { showNotification('error', 'เพิกถอนไม่สำเร็จ', error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'); }
    finally { busy = false; }
  }
  async function testReadOnly(mcp = false) {
    const secret = issuedSecret || testSecret;
    if (!secret) { showNotification('warning', 'กรุณาระบุ token', 'ใช้ token ที่สร้างใหม่ หรือวาง token ในช่องทดสอบ'); return; }
    busy = true; testResult = '';
    try {
      const headers = { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
      const response = await fetch(mcp ? '/api/v1/mcp' : '/api/v1/me', mcp ? { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'siem-developer-page', version: '1.0.0' } } }) } : { headers });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.message || data.error?.message || data.error || 'HTTP ' + response.status);
      if (mcp) {
        const toolsResponse = await fetch('/api/v1/mcp', { method: 'POST', headers: { ...headers, 'MCP-Protocol-Version': data.result.protocolVersion }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) });
        const tools = await toolsResponse.json();
        if (!toolsResponse.ok || tools.error) throw new Error(tools.message || tools.error?.message || 'MCP tools failed');
        testResult = JSON.stringify({ server: data.result.serverInfo, protocolVersion: data.result.protocolVersion, tools: tools.result.tools.map((tool: any) => tool.name) }, null, 2);
      } else testResult = JSON.stringify(data, null, 2);
      showNotification('success', 'ทดสอบสำเร็จ', 'อ่านข้อมูลบนเว็บไซต์นี้แล้ว ไม่มีการส่งแจ้งเตือน'); await refresh();
    } catch (error) { testResult = error instanceof Error ? error.message : 'การเชื่อมต่อล้มเหลว'; showNotification('error', 'ทดสอบไม่สำเร็จ', testResult); }
    finally { busy = false; }
  }
  async function showActivity() {
    tab = 'activity';
    try { activities = (await sessionFetch('/api/developer/activity')).items; }
    catch (error) { showNotification('error', 'โหลดประวัติไม่สำเร็จ', error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'); }
  }
  async function exportOpenApi() {
    try {
      const document = await sessionFetch('/api/developer/openapi.json');
      const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }));
      const link = documentLink(url); link.click(); URL.revokeObjectURL(url);
    } catch (error) { showNotification('error', 'ดาวน์โหลดไม่สำเร็จ', error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'); }
  }
  function exportCatalog() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(overview.catalog, null, 2)], { type: 'application/json' }));
    const link = documentLink(url); link.download = 'siem-kku-integration-catalog.json'; link.click(); URL.revokeObjectURL(url);
  }
  function documentLink(url: string) { const link = window.document.createElement('a'); link.href = url; link.download = 'siem-kku-openapi.json'; return link; }
</script>

<svelte:head><title>API & MCP — SIEM KKU</title></svelte:head>
<svelte:window on:keydown={drawerKeys} />

<div class="developer-page">
  <PageHeader title="API & MCP" description="เชื่อมโปรแกรม สคริปต์ และระบบกลางกับ SIEM ด้วยสิทธิ์ที่ตรวจสอบได้" icon="ti-code">
    <button slot="actions" class="btn-secondary" on:click={refresh} disabled={loading || busy}><i class="ti ti-refresh"></i> รีเฟรช</button>
  </PageHeader>
  {#if loading}<div class="panel loading" role="status">กำลังโหลด API workspace…</div>
  {:else if failure}<div class="panel failure" role="alert"><strong>โหลดข้อมูลไม่สำเร็จ</strong><p>{failure}</p><button class="btn-secondary" on:click={refresh}>ลองอีกครั้ง</button></div>
  {:else}
    <section class="panel identity">
      <div><span class="eyebrow">สิทธิ์ปัจจุบันของคุณ</span><h2>{overview.identity.username} <span class="role">{overview.identity.role}</span></h2><p>token ใช้ได้ตาม scope ที่เลือกและสิทธิ์บัญชีปัจจุบัน หากบัญชีถูกปิดหรือสิทธิ์ลดลง API จะตรวจใหม่ทุกครั้ง</p><div class="scope-list">{#each overview.identity.effectiveScopes as scope}<span>{scope}</span>{/each}</div></div>
      <div class="address"><span class="eyebrow">SIEM PUBLIC URL</span><code>{baseUrl}</code><button class="btn-secondary" on:click={() => copy(baseUrl)}>คัดลอก URL</button></div>
    </section>

    <section class="panel">
      <div class="section-head"><div><h2>My API Tokens <span class="muted">{activeCount}/10</span></h2><p>แสดง token เต็มครั้งเดียว ระบบเก็บ hash และบันทึกการใช้งานโดยไม่เก็บ credential</p></div><button class="btn-primary" on:click={() => openCreate()} disabled={busy || activeCount >= 10}><i class="ti ti-plus"></i> สร้าง token</button></div>
      {#if issuedSecret}
        <div class="secret-panel" role="status"><strong>บันทึก token นี้ก่อนปิด</strong><p>จะเปิดดูค่าเต็มอีกครั้งไม่ได้ และไม่ได้เก็บไว้ใน localStorage</p><div class="secret-row"><input aria-label="Token ที่สร้างใหม่" type={revealSecret ? 'text' : 'password'} readonly value={issuedSecret} /><button class="btn-secondary" on:click={() => revealSecret = !revealSecret}>{revealSecret ? 'ซ่อน' : 'แสดง'}</button><button class="btn-primary" on:click={() => copy(issuedSecret)}>คัดลอก token</button></div><button class="text-button" on:click={() => { issuedSecret = ''; revealSecret = false; }}>บันทึกแล้ว · ปิดค่า token</button></div>
      {/if}
      {#if !tokens.length}<div class="empty"><i class="ti ti-key"></i><h3>ยังไม่มี API token</h3><p>สร้าง token เพื่อให้ระบบกลางอ่านทะเบียน API หรือสถานะการเชื่อมต่อ</p></div>
      {:else}<div class="token-list">{#each tokens as token}<article class="token-row"><div class="token-main"><strong>{token.name}</strong><code>{token.prefix}…</code><div class="scope-list">{#each token.scopes as scope}<span>{scope}</span>{/each}</div></div><div class="token-meta"><span class:inactive={status(token) !== 'พร้อมใช้'} class="state">{status(token)}</span><small>หมดอายุ {formatted(token.expiresAt)}</small><small>ใช้ล่าสุด {formatted(token.lastUsedAt)}</small></div><div class="token-actions"><button class="btn-secondary" disabled={busy || status(token) !== 'พร้อมใช้'} on:click={() => openCreate(token)}>ออกใหม่</button><button class="btn-secondary danger" disabled={busy || !!token.revokedAt} on:click={() => confirmation = token}>เพิกถอน</button></div></article>{/each}</div>{/if}
    </section>

    <section class="panel protocol-panel">
      <div class="tabs" aria-label="API documentation"><button class:active={tab === 'rest'} on:click={() => tab = 'rest'}>REST API</button><button class:active={tab === 'mcp'} on:click={() => tab = 'mcp'}>MCP</button><button class:active={tab === 'activity'} on:click={showActivity}>การใช้งานของฉัน</button></div>
      {#if tab === 'rest'}
        <div class="section-head"><div><h2>Endpoint catalog</h2><p>ใช้ Authorization: Bearer &lt;token&gt; · รุ่นแรกเปิดเฉพาะอ่านข้อมูล</p></div><button class="btn-secondary" disabled={!overview.identity.effectiveScopes.includes('catalog:read')} on:click={exportOpenApi}>ดาวน์โหลด OpenAPI</button></div>
        <button class="btn-secondary" disabled={!overview.identity.effectiveScopes.includes('catalog:read')} on:click={exportCatalog}>ดาวน์โหลดทะเบียน API (JSON)</button>
        <div class="endpoint-list">{#each overview.catalog.items as endpoint}<div class="endpoint"><span class="method">{endpoint.method}</span><code>{endpoint.path}</code><small>{endpoint.scope || 'valid token'}</small></div>{/each}</div>
        <div class="code-head"><span>ตัวอย่างเรียกทะเบียน API · ใช้ catalog:read</span><button class="text-button" on:click={() => copy(curlExample)}>คัดลอกตัวอย่าง</button></div><pre>{curlExample}</pre>
      {:else if tab === 'mcp'}
        <div class="section-head"><div><h2>SIEM MCP Server</h2><p>Streamable HTTP · tools สำหรับอ่านข้อมูล · credential และสิทธิ์ตรวจที่ backend</p></div><span class="state">อ่านอย่างเดียว</span></div><code class="mcp-url">{baseUrl}/api/v1/mcp</code>
        <div class="endpoint-list">{#each [['catalog:read', 'list_api_endpoints'], ['integrations:read', 'list_integrations'], ['health:read', 'get_integration_health']] as tool}{#if overview.identity.effectiveScopes.includes(tool[0])}<div class="endpoint"><span class="method">TOOL</span><code>{tool[1]}</code><small>{tool[0]}</small></div>{/if}{/each}</div>
        <div class="code-head"><span>ตัวอย่างสำหรับ client ที่รับ URL และ custom headers</span><button class="text-button" on:click={() => copy(mcpConfiguration)}>คัดลอก config</button></div><pre>{mcpConfiguration}</pre><p class="muted">ต้องแทน YOUR_TOKEN เอง รูปแบบ config ขึ้นกับ client ปัจจุบันรองรับ Bearer PAT; client ที่บังคับ OAuth ยังต้องมี adapter เพิ่ม A2A อยู่ในแผนระยะถัดไป</p>
      {:else}<h2>การเรียก API ของบัญชีนี้</h2>{#if !activities.length}<p class="muted">ยังไม่มีประวัติการเรียก API ที่บันทึกไว้</p>{:else}<div class="activity-list">{#each activities as activity}<div><span>{activity.method}</span><code>{activity.path}</code><strong>{activity.statusCode}</strong><small>{formatted(activity.timestamp)}</small></div>{/each}</div>{/if}{/if}
      {#if tab !== 'activity'}<div class="test-box"><div><h3>ทดสอบอ่านข้อมูลบนเว็บไซต์นี้</h3><p>ไม่ส่งข้อความ Slack และไม่แก้ข้อมูล หากเปิดใน local ผลทดสอบเป็นของ local</p></div>{#if !issuedSecret}<input aria-label="API token สำหรับทดสอบ" type="password" bind:value={testSecret} autocomplete="off" placeholder="วาง API token เพื่อทดสอบ · ไม่บันทึก" />{/if}<button class="btn-primary" disabled={busy} on:click={() => testReadOnly(tab === 'mcp')}>{busy ? 'กำลังทดสอบ…' : tab === 'mcp' ? 'ทดสอบ MCP' : 'ทดสอบ REST API'}</button>{#if testResult}<pre aria-live="polite">{testResult}</pre>{/if}</div>{/if}
    </section>

    {#if overview.connections}<section class="panel"><div class="section-head"><div><h2>Connections Map</h2><p>ตั้งค่าแล้วและมีการเรียกใช้จริงเป็นคนละสถานะ ข้อมูลนี้ไม่แสดง secret</p></div><a class="btn-secondary" href="/dashboard/settings/integrations">จัดการปลายทาง <i class="ti ti-arrow-up-right"></i></a></div><div class="connections"><div class="siem-node"><i class="ti ti-shield-lock"></i><strong>SIEM KKU</strong></div><div class="connection-targets">{#each overview.connections.items as connection}<article><i class="ti ti-arrow-right"></i><div><strong>{connection.name}</strong><small>{connection.targetOrigin || 'ยังไม่ตั้งค่าปลายทาง'}</small><small>สำเร็จล่าสุด {formatted(connection.lastSuccessAt)}</small></div><span class="state" class:inactive={!connection.configured}>{connection.state}</span></article>{/each}<article><i class="ti ti-arrow-right"></i><div><strong>ระบบกลาง API / MCP</strong><small>SIEM URL พร้อมในเอกสาร · ยังต้องตั้ง URL/รูปแบบรับข้อมูลของระบบกลาง</small></div><span class="state inactive">ยังไม่ตั้งค่า</span></article></div></div></section>{/if}
  {/if}
</div>

{#if drawer}<div class="drawer-backdrop"><section class="token-drawer" role="dialog" aria-modal="true" aria-labelledby="token-title" tabindex="-1"><div class="section-head"><h2 id="token-title">{rotating ? 'ออก token ใหม่แทนตัวเดิม' : 'สร้าง API token'}</h2><button class="btn-secondary" aria-label="ปิดฟอร์ม token" disabled={busy} on:click={() => drawer = false}><i class="ti ti-x"></i></button></div><form on:submit|preventDefault={createToken}><label for="token-name">ชื่อการใช้งาน</label><input id="token-name" bind:value={name} required maxlength="80" placeholder="เช่น Central API catalog" /><label for="token-days">อายุ token</label><select id="token-days" bind:value={days}><option value={7}>7 วัน</option><option value={30}>30 วัน</option><option value={90}>90 วัน</option></select><fieldset><legend>สิทธิ์ที่อนุญาต</legend>{#each overview.tokens.allowedScopes as scope}<label class="scope-option"><input type="checkbox" bind:group={scopes} value={scope} /><span><strong>{scope}</strong><small>{scopeNames[scope]}</small></span></label>{/each}</fieldset><label for="caller-cidrs">IP/CIDR ของผู้เรียก API (ไม่บังคับ)</label><textarea id="caller-cidrs" rows="3" bind:value={allowedCidrs} placeholder="10.101.0.0/16&#10;2001:db8::/32"></textarea><p class="muted">แยกจากวง LAN ที่ SIEM เฝ้าระวัง เว้นว่างหากไม่จำกัด caller IP</p>{#if rotating}<p class="rotation-note">เมื่อสร้างสำเร็จ token เดิมจะถูกเพิกถอนใน transaction เดียวกัน ให้นำตัวใหม่ไปตั้งค่าในระบบที่เรียกใช้</p>{/if}<div class="drawer-actions"><button type="button" class="btn-secondary" disabled={busy} on:click={() => drawer = false}>ยกเลิก</button><button class="btn-primary" type="submit" disabled={busy || !scopes.length || !name.trim()}>{busy ? 'กำลังสร้าง…' : 'สร้าง token'}</button></div></form></section></div>{/if}
<ConfirmModal visible={!!confirmation} title="เพิกถอน API token" message={'หยุดการใช้งาน token “' + (confirmation?.name || '') + '” ทันที โปรแกรมที่ใช้ token นี้จะเรียก API ต่อไม่ได้'} icon="ti-key-off" on:confirm={revoke} on:cancel={() => confirmation = null} />

<style>
  .btn-primary,.btn-secondary{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:9px 14px;border-radius:9px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid var(--border);line-height:1.4}.btn-primary{background:var(--green,#008c76);border-color:var(--green,#008c76);color:#fff}.btn-secondary{background:var(--bg-panel);color:var(--text-primary)}button:disabled{opacity:.5;cursor:not-allowed}
  .developer-page{padding:clamp(18px,3vw,32px);max-width:1440px;margin:auto;color:var(--text-primary)}.panel{background:var(--bg-panel);border:1px solid var(--border);border-radius:18px;padding:24px;margin-bottom:20px;min-width:0}.identity{display:grid;grid-template-columns:minmax(0,1fr) minmax(250px,.55fr);gap:32px;border-left:4px solid var(--blue)}h2{font-size:19px;margin:0 0 8px}h3{font-size:16px;margin:0 0 8px}p{font-size:13px;line-height:1.7;margin:8px 0;color:var(--text-secondary)}.eyebrow{font-size:11px;letter-spacing:.08em;color:var(--text-secondary)}.role{font-size:12px;background:var(--blue-bg);color:var(--blue);padding:5px 9px;border-radius:8px;margin-left:8px}.identity h2{margin-top:8px}.address{display:flex;flex-direction:column;gap:12px;justify-content:center;align-items:flex-start;min-width:0}.address code,.mcp-url{overflow-wrap:anywhere}.section-head{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:18px}.section-head>div{min-width:0}.section-head p{margin-bottom:0}.muted,small{color:var(--text-secondary);font-size:12px}.scope-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.scope-list span{font-size:11px;border:1px solid var(--border);padding:4px 7px;border-radius:6px}.empty{padding:28px 12px;text-align:center;background:var(--bg-secondary);border-radius:12px}.empty>i{font-size:32px;color:var(--blue);display:block;margin-bottom:12px}.token-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(160px,.55fr) auto;gap:20px;padding:20px 0;border-top:1px solid var(--border);align-items:center}.token-main{min-width:0}.token-main strong,.token-main code{display:block;overflow-wrap:anywhere}.token-main code{font-size:12px;color:var(--text-secondary);margin-top:6px}.token-meta{display:flex;flex-direction:column;gap:8px;align-items:flex-start}.token-actions{display:flex;gap:8px}.state{background:var(--green-bg,var(--blue-bg));color:var(--green,var(--blue));font-size:11px;white-space:nowrap;padding:5px 8px;border-radius:6px}.state.inactive{background:var(--bg-secondary);color:var(--text-secondary)}.danger{color:var(--red,#d44444)}.secret-panel{background:var(--blue-bg);border:1px solid var(--blue);border-radius:12px;padding:18px;margin-bottom:18px}.secret-row{display:flex;gap:8px}.secret-row input{min-width:0;flex:1}input,select,textarea{background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);border-radius:9px;padding:11px 12px;font:inherit;width:100%;box-sizing:border-box}input:focus,select:focus,textarea:focus{outline:2px solid var(--blue);outline-offset:2px}.text-button{border:0;background:none;color:var(--blue);cursor:pointer;font:inherit;font-size:12px;padding:8px 0;text-align:left}.tabs{display:flex;gap:8px;border-bottom:1px solid var(--border);margin-bottom:24px}.tabs button{padding:12px 16px;border:0;border-bottom:2px solid transparent;background:none;color:var(--text-secondary);font:inherit;cursor:pointer}.tabs button.active{color:var(--blue);border-color:var(--blue)}.endpoint-list{border:1px solid var(--border);border-radius:12px;overflow:hidden;margin:16px 0}.endpoint{display:flex;gap:14px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--border);min-width:0}.endpoint:last-child{border-bottom:0}.endpoint code{flex:1;overflow-wrap:anywhere;min-width:0;font-size:12px}.method{font-size:11px;font-weight:700;color:var(--blue);background:var(--blue-bg);padding:4px 7px;border-radius:5px}.code-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:18px;font-size:12px;color:var(--text-secondary)}pre{background:#101a2b;color:#deebff;border-radius:12px;padding:18px;overflow:auto;max-height:320px;font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}.test-box{background:var(--bg-secondary);border:1px solid var(--border);padding:20px;border-radius:12px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;margin-top:24px}.test-box>div,.test-box>pre{grid-column:1/-1}.test-box p{margin-bottom:0}.connections{display:grid;grid-template-columns:180px minmax(0,1fr);gap:24px;align-items:center}.siem-node{display:flex;flex-direction:column;align-items:center;gap:14px;border:1px solid var(--border);border-radius:16px;padding:30px 16px;background:var(--blue-bg)}.siem-node i{font-size:36px;color:var(--blue)}.connection-targets article{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--border)}.connection-targets article>div{flex:1;min-width:0}.connection-targets small{display:block;margin-top:5px;overflow-wrap:anywhere}.connection-targets>article>i{color:var(--blue)}.activity-list>div{display:flex;gap:14px;padding:14px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;font-size:12px}.activity-list code{flex:1;overflow-wrap:anywhere}.drawer-backdrop{position:fixed;inset:0;background:rgba(10,20,35,.42);z-index:1100;display:flex;justify-content:flex-end}.token-drawer{background:var(--bg-panel);color:var(--text-primary);width:min(480px,100%);height:100%;overflow:auto;padding:28px;box-sizing:border-box;box-shadow:-12px 0 48px rgba(0,0,0,.15)}form>label{display:block;margin:18px 0 8px;font-size:13px}fieldset{border:1px solid var(--border);border-radius:12px;margin:20px 0;padding:14px}legend{font-size:13px;padding:0 6px}.scope-option{display:flex;gap:10px;align-items:flex-start;margin:14px 0}.scope-option input{width:17px;margin-top:3px;accent-color:var(--blue)}.scope-option strong,.scope-option small{display:block;font-size:12px}.scope-option small{margin-top:5px}.drawer-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}.rotation-note{background:var(--blue-bg);border-radius:9px;padding:12px}.loading,.failure{padding:32px}.btn-primary,.btn-secondary{white-space:nowrap;flex-shrink:0;text-decoration:none}button:focus-visible,a:focus-visible{outline:2px solid var(--blue);outline-offset:3px}@media(max-width:1000px){.identity{grid-template-columns:1fr}.connections{grid-template-columns:130px minmax(0,1fr)}.token-row{grid-template-columns:minmax(0,1fr) auto}.token-meta{grid-column:1/-1;flex-direction:row;flex-wrap:wrap}.token-actions{grid-column:2;grid-row:1}}@media(max-width:600px){.panel{padding:18px;border-radius:14px}.section-head{align-items:flex-start;flex-wrap:wrap;gap:12px}.token-row{grid-template-columns:1fr}.token-actions,.token-meta{grid-column:1;grid-row:auto}.secret-row{flex-wrap:wrap}.secret-row input{flex-basis:100%}.tabs{gap:0}.tabs button{padding:10px;font-size:12px}.endpoint{flex-wrap:wrap;gap:8px}.endpoint small{flex-basis:100%}.test-box{grid-template-columns:1fr}.connections{grid-template-columns:1fr}.connection-targets article{flex-wrap:wrap}.code-head{align-items:flex-start;flex-wrap:wrap}.token-drawer{padding:22px}}
</style>
