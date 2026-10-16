<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import OrgBadge from '../../../lib/components/OrgBadge.svelte';
  import { endpointOrganization } from '../../../lib/utils/alertStream';
  import { formatEventTime } from '../../../lib/formatTime';
  import { incidentUrl } from '../../../lib/utils/incidentLink';
  let searchQuery = '', srcIp = '', dstIp = '', httpStatus = '';
  let dateRange = 'last24h', from = '', to = '';
  let isSearching = false, isLiveUpdates = false, error = '', detail: any = null;
  let searchResults: any[] = [], total = 0, page = 1, executionTime = 0;
  const limit = 50;
  let generation = 0, abort: AbortController | null = null, timer: ReturnType<typeof setInterval>;
  async function performSearch(reset = true) {
    if (reset) page = 1;
    const run = ++generation, start = performance.now();
    abort?.abort(); abort = new AbortController(); isSearching = true; error = '';
    const duration: Record<string, number> = {last15m:900000,last1h:3600000,last24h:86400000,last7d:604800000};
    const end = dateRange === 'custom' ? Date.parse(to + '+07:00') : Date.now();
    const begin = dateRange === 'custom' ? Date.parse(from + '+07:00') : end - duration[dateRange];
    if (!Number.isFinite(begin) || !Number.isFinite(end)) { error = 'กรุณาระบุช่วงเวลา'; isSearching = false; return; }
    const params = new URLSearchParams({page:String(page),limit:String(limit),from:new Date(begin).toISOString(),to:new Date(end).toISOString()});
    for (const [key,value] of Object.entries({q:searchQuery,srcIp,dstIp,httpStatus})) if(value) params.set(key,value);
    try {
      const response = await fetch('/api/ingest/events?' + params, {headers:{Authorization:'Bearer '+localStorage.getItem('token')},signal:abort.signal});
      const data = await response.json(); if (!response.ok) throw new Error(data.message || 'ค้น log ไม่สำเร็จ');
      if (run !== generation) return;
      searchResults = data.items; total = data.total; executionTime = Math.round(performance.now() - start);
    } catch(e: any) { if (run === generation && e.name !== 'AbortError') error = e.message; }
    finally { if(run === generation) isSearching = false; }
  }
  async function openReceipt(id: string) {
    try {
      const response = await fetch('/api/ingest/events/' + id, {headers:{Authorization:'Bearer '+localStorage.getItem('token')}});
      const data = await response.json(); if (!response.ok) throw new Error(data.message || 'เปิดหลักฐานไม่สำเร็จ'); detail = data;
    } catch(e: any) { error = e.message; }
  }
  onMount(() => { void performSearch(); const receiptId=new URLSearchParams(window.location.search).get('receiptId'); if(receiptId)void openReceipt(receiptId); timer = setInterval(() => {if(isLiveUpdates && !isSearching) void performSearch(false);},15000); });
  onDestroy(() => { generation++; abort?.abort(); clearInterval(timer); });
</script>
<svelte:head><title>Log Explorer - KKUSIEM</title></svelte:head>
<section class="siem-page siem-page--explorer">
  <PageHeader title="Log Explorer" description="ค้น receipt ที่รับเข้าจริง รวมการเข้าเว็บปกติ เหตุการณ์ถูกบล็อก และการตรวจจับ" icon="ti-file-search" />
  <form class="filters" on:submit|preventDefault={() => performSearch()}>
    <label>ข้อความ / เว็บไซต์ / URL<input bind:value={searchQuery} maxlength="128" placeholder="ชื่อเว็บ, URI หรือข้อความใน log" /></label>
    <label>Source IP<input bind:value={srcIp} placeholder="IP ต้นทางแบบตรงตัว" /></label>
    <label>Target IP<input bind:value={dstIp} placeholder="IP เป้าหมายแบบตรงตัว" /></label>
    <label>HTTP status<input bind:value={httpStatus} placeholder="เช่น 200, 403" maxlength="3" /></label>
    <label>ช่วงเวลา<select bind:value={dateRange}><option value="last15m">15 นาที</option><option value="last1h">1 ชั่วโมง</option><option value="last24h">24 ชั่วโมง</option><option value="last7d">7 วัน</option><option value="custom">กำหนดเอง (เวลาไทย)</option></select></label>
    {#if dateRange === 'custom'}<label>ตั้งแต่<input type="datetime-local" bind:value={from} required /></label><label>ถึง<input type="datetime-local" bind:value={to} required /></label>{/if}
    <button disabled={isSearching}>{isSearching ? 'กำลังค้น…' : 'ค้นฐานข้อมูล'}</button>
  </form>
  {#if error}<p role="alert">{error}</p>{/if}
  <div class="results-info">พบ {total.toLocaleString()} receipts · แสดงหน้า {page} · {executionTime} ms <label><input type="checkbox" bind:checked={isLiveUpdates} /> อัปเดตทุก 15 วินาที</label></div>
  <div class="table-wrap"><table><thead><tr><th>เวลาไทย</th><th>ต้นทาง / หน่วยงาน / CIDR</th><th>เป้าหมาย / หน่วยงาน / CIDR</th><th>เว็บไซต์ / HTTP</th><th>ผลประมวลผล</th><th>หลักฐาน</th></tr></thead><tbody>
    {#each searchResults as row (row.id)}<tr>
      <td>{formatEventTime(row.eventTimestampMs || row.receivedAt)}</td>
      <td>{row.sourceIp || 'ไม่ระบุ'}<br><OrgBadge organization={endpointOrganization(row.networkContext?.source)} full={true} /><br>{row.networkContext?.source?.cidr || '-'}</td>
      <td>{row.targetIp || 'ไม่ระบุ'}<br><OrgBadge organization={endpointOrganization(row.networkContext?.target)} full={true} /><br>{row.networkContext?.target?.cidr || '-'}</td>
      <td>{row.httpContext?.host || '(ไม่มี host)'}<br><code>{row.httpContext?.method || ''} {row.httpContext?.url || row.httpContext?.uri || '-'}</code><br>HTTP {row.httpContext?.status ?? 'ไม่ระบุ'}</td>
      <td>{row.source} · {row.disposition || row.status}{#if row.contentExpiredAtMs}<br>เนื้อหาหมดอายุการเก็บ{/if}</td>
      <td><button on:click={() => openReceipt(row.id)}>เปิด receipt</button>{#if row.attackId}<br><a href={incidentUrl({id:row.attackId}) || '/dashboard/soar'}>Incident {row.attackId}</a>{/if}</td>
    </tr>{:else}<tr><td colspan="6">ไม่พบ log ในขอบเขตที่ค้น</td></tr>{/each}
  </tbody></table></div>
  <div class="pagination"><button disabled={page <= 1 || isSearching} on:click={() => {page--;void performSearch(false);}}>ก่อนหน้า</button><span>{page} / {Math.max(1,Math.ceil(total / limit))}</span><button disabled={page * limit >= total || isSearching} on:click={() => {page++;void performSearch(false);}}>ถัดไป</button></div>
  {#if detail}<section class="receipt"><button on:click={() => detail = null}>ปิดหลักฐาน</button><h3>Receipt {detail.id}</h3><pre>{JSON.stringify(detail,null,2)}</pre></section>{/if}
</section>
<style>
  .filters{display:flex;gap:12px;flex-wrap:wrap;padding:16px;background:var(--bg-panel);border:1px solid var(--border);border-radius:10px}.filters label{display:flex;flex:1 1 150px;flex-direction:column;gap:6px}input,select,button{padding:9px;border:1px solid var(--border);border-radius:6px;color:var(--text-primary);background:var(--bg-secondary)}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}.results-info,.pagination{display:flex;justify-content:space-between;gap:12px;margin:16px 0}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;background:var(--bg-panel)}th,td{padding:12px;text-align:left;border-bottom:1px solid var(--border);vertical-align:top;overflow-wrap:anywhere}td{max-width:320px;font-size:13px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:600px;overflow:auto}.receipt{padding:16px;border:1px solid var(--border);margin-top:16px}
</style>
