<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import HelpHint from '../../../lib/components/HelpHint.svelte';
  import { roleStore } from '../../../stores/events';
  let summary: any = null;
  let items: any[] = [];
  let source = '';
  let page = 1;
  let total = 0;
  let busy = false;
  let error = '';
  let endpoint = '';
  let timer: ReturnType<typeof setInterval>;
  let destroyed = false;
  let copyMessage = '';
  let replaying = '';
  let details: Record<string, any> = {};
  let detailBusy = '';
  let replayMessage = '';
  const limit = 25;
  const sources = ['firewall', 'nginx', 'server', 'wazuh', 'suricata', 'cowrie', 'webtrap', 'generic'];
  const reasons: Record<string, string> = {
    benign: 'รับแล้ว ไม่พบหลักฐานการโจมตี', blocked_traffic: 'การเชื่อมต่อถูกปฏิเสธ',
    detected: 'มีหลักฐานเข้าเกณฑ์ตรวจจับ', suspicious: 'มีผลตรวจ — ต้องตรวจสอบเพิ่มเติม', filtered_detection: 'ผลตรวจไม่ตรงสัญญาที่รองรับ',
    backfill_static_no_match: 'ตรวจย้อนหลังไม่พบกฎจากรายการเดี่ยว · คง incident เดิมไว้',
    out_of_scope: 'อยู่นอกขอบเขตเครือข่ายที่กำหนด', rejected: 'ข้อมูลไม่ตรงรูปแบบที่รองรับ'
  };
  const sample = JSON.stringify({ source: 'nginx', event_id: 'sender-unique-event-001',
    raw_log: { remote_addr: '203.0.113.10', server_addr: '10.101.104.234', request_method: 'GET',
      request_uri: '/', status: 200, timestamp: '2026-10-12T00:00:00Z' } }, null, 2);
  $: curl = `curl --fail-with-body -X POST '${endpoint}' \\\n  -H 'Content-Type: application/json' \\\n  -H 'X-Ingest-Key: <INGEST_API_KEY>' \\\n  --data-binary @event.json`;
  $: processing = (summary?.queue?.pending || 0) + (summary?.queue?.processing || 0);
  $: rejected = summary?.groups?.filter((row: any) => ['failed', 'quarantined'].includes(row.status)).reduce((n: number, row: any) => n + row.count, 0) || 0;
  async function loadDetail(id: string) {
    if (detailBusy) return;
    detailBusy = id;
    try {
      const res = await fetch('/api/ingest/events/' + id, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error('อ่านหลักฐานไม่สำเร็จ (HTTP ' + res.status + ')');
      details = { ...details, [id]: await res.json() };
    } catch (e) { error = e instanceof Error ? e.message : 'อ่านหลักฐานไม่สำเร็จ'; }
    finally { detailBusy = ''; }
  }
  async function refresh() {
    if (busy || destroyed) return;
    busy = true;
    error = '';
    const query = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (source) query.set('source', source);
    try {
      const options = { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, signal: AbortSignal.timeout(10000) };
      const [summaryRes, recordsRes] = await Promise.all([fetch('/api/ingest/summary', options), fetch('/api/ingest/events?' + query, options)]);
      if (!summaryRes.ok || !recordsRes.ok) throw new Error(recordsRes.status === 403 ? 'บัญชีนี้ไม่มีสิทธิ์อ่านรายการ log' : `โหลดข้อมูลไม่สำเร็จ (HTTP ${!recordsRes.ok ? recordsRes.status : summaryRes.status})`);
      const [nextSummary, records] = await Promise.all([summaryRes.json(), recordsRes.json()]);
      if (!destroyed) { summary = nextSummary; items = records.items; total = records.total; }
    } catch (e) { if (!destroyed) error = e instanceof Error ? e.message : 'เชื่อมต่อ backend ไม่สำเร็จ'; }
    finally { busy = false; }
  }
  function changePage(value: number) { if (busy) return; page = value; refresh(); }
  async function replay(item: any) {
    if (replaying) return;
    replaying = item.id; replayMessage = '';
    try {
      const res = await fetch('/api/ingest/replay/' + item.id, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, signal: AbortSignal.timeout(10000) });
      const data = await res.json(); if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      replayMessage = data.mode === 'backfill' ? 'เข้าคิวตรวจย้อนหลังแล้ว: ใช้กฎจากรายการเดี่ยว ไม่รวมหน้าต่าง live และไม่ส่ง Slack' : 'เข้าคิวลองประมวลผลอีกครั้งแล้ว';
      await refresh();
    } catch (e) { error = e instanceof Error ? e.message : 'ตรวจซ้ำไม่สำเร็จ'; }
    finally { replaying = ''; }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); copyMessage = 'คัดลอกแล้ว'; }
    catch { copyMessage = 'คัดลอกไม่ได้ กรุณาเลือกข้อความแล้วคัดลอก'; }
  }
  const time = (value: string) => new Date(value).toLocaleString('th-TH');
  onMount(() => { endpoint = window.location.origin + '/api/ingest'; refresh(); timer = setInterval(refresh, 10000); });
  onDestroy(() => { destroyed = true; clearInterval(timer); });
</script>

<svelte:head><title>Log Ingestion · SIEM KKU</title></svelte:head>
<section class="siem-page ingestion-page" aria-label="Log Ingestion">
  <PageHeader title="Log Ingestion" description="ตรวจ log ที่ต้นทางส่งเข้า SIEM ผ่าน API และผลการประมวลผล" icon="ti-database-import" />
  <div class="metrics">
    <article><span>รับเข้าใน 24 ชั่วโมง<HelpHint id="receipt-ack-help" text="นับ log ไม่ซ้ำที่บันทึกลงฐานข้อมูลแล้ว การรับสำเร็จยังไม่แปลว่าตรวจเสร็จ เหตุการณ์ปกติจะไม่สร้างการโจมตีหรือส่ง Slack" /></span><strong>{summary ? summary.received24h.toLocaleString() : '—'}</strong></article>
    <article><span>คิวรอ / กำลังตรวจทั้งหมด<HelpHint id="receipt-queue-help" text="คิวอยู่ใน PostgreSQL ไม่โหลดทั้งหมดเข้า RAM ตัวตรวจอ่านครั้งละไม่เกินงบจำนวนรายการและขนาด batch หากเต็ม ต้นทางจะได้รับ 503 และควรส่งซ้ำด้วย event_id เดิม" /></span><strong>{processing.toLocaleString()}</strong></article>
    <article><span>ผิดพลาด / กักไว้ใน 24 ชั่วโมง</span><strong>{rejected.toLocaleString()}</strong></article>
    <article><span>โหมดรับ log</span><strong>{summary?.collectionMode || '—'}</strong></article>
  </div>
  {#if summary}<div class="panel diagnostics">
    <h2>ตัวตรวจและสถานะคิว<HelpHint id="receipt-model-help" text="ขณะนี้ยังไม่มีชุดฝึกที่ติดป้ายกำกับ ตัวตรวจจึงใช้ rule และ heuristic คะแนนไม่ใช่ความน่าจะเป็น โมเดล shadow เป็นการเปรียบเทียบเท่านั้นและไม่เปลี่ยนผล alert" /></h2>
    <div class="diagnostic-grid">
      <div><span>Detection engine</span><strong>{summary.detection?.available ? 'เชื่อมต่อพร้อมตรวจ' : 'เชื่อมต่อไม่ได้ — เก็บ log รอตรวจ'}</strong></div>
      <div><span>รอเก่าที่สุด</span><strong>{Math.round(summary.oldestPendingSeconds || 0).toLocaleString()} วินาที</strong></div>
      <div><span>งบ batch สูงสุด</span><strong>{summary.worker?.batchMaxRecords || '—'} log / {((summary.worker?.batchMaxBytes || 0) / 1048576).toFixed(1)} MiB</strong></div>
      <div><span>Shadow model</span><strong>{summary.detection?.models?.shadow?.ready ? 'พร้อมทดลอง' : summary.detection?.models?.shadow?.configured ? 'ตั้งค่าแล้ว แต่โหลดไม่สำเร็จ' : 'ยังไม่ติดตั้งโมเดลที่ฝึกแล้ว'}</strong></div>
    </div>
    <p>รอคิว {summary.queue?.pending || 0} · กำลังตรวจ {summary.queue?.processing || 0} · ตรวจเสร็จตั้งแต่เริ่มระบบ {(summary.worker?.processedSinceStart || 0).toLocaleString()} · ข้อมูลสถานะคิวอาจช้าได้ถึง 15 วินาที</p>
    <a href="/dashboard/detections">เปิด Detection Results และเหตุผล →</a>
  </div>{/if}
  <div class="panel">
    <div class="toolbar"><h2>Log ที่รับเข้าจริง</h2><label for="log-source">ต้นทาง</label><select id="log-source" bind:value={source} disabled={busy} on:change={() => { page = 1; refresh(); }}><option value="">ทั้งหมด</option>{#each sources as item}<option value={item}>{item}</option>{/each}</select><button disabled={busy} on:click={refresh}>{busy ? 'กำลังโหลด…' : 'รีเฟรช'}</button></div>
    <p>รวมรายการปกติและรายการที่ไม่ขึ้นเป็น alert อัปเดตทุก 10 วินาที</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if replayMessage}<p role="status">{replayMessage}</p>{/if}
    <div class="table-wrap"><table><thead><tr><th>เวลารับ</th><th>ต้นทาง</th><th>IP ต้นทาง</th><th>IP เป้าหมาย</th><th>สถานะ</th><th>ผลประมวลผล</th></tr></thead><tbody>
      {#each items as item (item.id)}<tr><td>{time(item.receivedAt)}</td><td>{item.source}</td><td>{item.sourceIp || '—'}</td><td>{item.targetIp || 'ยังไม่ทราบ'}{#if item.normalized?.target_basis === 'configured_source_asset'}<small>จาก asset ที่กำหนดไว้</small>{/if}</td><td><span class:problem={['failed','quarantined'].includes(item.status)}>{item.status}</span>{#if item.processingMode === 'backfill'}<small>ตรวจย้อนหลัง · ไม่ส่ง Slack</small>{/if}</td><td>{reasons[item.disposition] || item.disposition || 'รอประมวลผล'}{#if item.error}<small class="error">{item.error}</small>{/if}{#if item.normalized}<details><summary>รายละเอียดที่อ่านได้</summary><pre>{JSON.stringify(item.normalized, null, 2)}</pre></details>{/if}<button disabled={!!detailBusy} on:click={() => loadDetail(item.id)}>{detailBusy === item.id ? 'กำลังอ่าน…' : 'ดูต้นฉบับ / หลักฐาน'}</button>{#if details[item.id]}<details open><summary>ต้นฉบับและผลตรวจ</summary>{#if details[item.id].contentExpiredAtMs}<p>ต้นฉบับหมดอายุตามนโยบายเก็บรักษา</p>{:else}<p>ผู้บันทึก: {details[item.id].origin?.observerName || details[item.id].origin?.hostName || '—'} · {details[item.id].origin?.observerIp || '—'}</p><pre>{JSON.stringify(details[item.id].origin,null,2)}</pre><pre>{details[item.id].raw}</pre><pre>{JSON.stringify(details[item.id].detection || {error:details[item.id].error},null,2)}</pre>{/if}</details>{/if}{#if $roleStore === 'admin' && ['processed','failed'].includes(item.status) && !item.contentExpiredAtMs}<button disabled={!!replaying} on:click={() => replay(item)}>{replaying === item.id ? 'กำลังเข้าคิว…' : item.status === 'processed' ? 'ตรวจย้อนหลังอีกครั้ง' : 'ลองตรวจใหม่'}</button><HelpHint id={'replay-help-'+item.id} text="เฉพาะผู้ดูแล: รายการที่เคยตรวจแล้วจะตรวจย้อนหลังโดยไม่ส่ง Slack และไม่เพิ่มจำนวนเหตุการณ์ซ้ำ การ scan แบบหลายเหตุการณ์ต้องประเมินจากข้อมูล live ส่วน failed เป็นการลองตรวจใหม่ตามปกติ" />{/if}</td></tr>
      {:else}<tr><td colspan="6">{busy ? 'กำลังโหลด…' : 'ยังไม่มี log ในแหล่งข้อมูลที่เลือก ตรวจ URL และ X-Ingest-Key ของต้นทาง'}</td></tr>{/each}
    </tbody></table></div>
    <div class="pagination"><button disabled={busy || page <= 1} on:click={() => changePage(page - 1)}>ก่อนหน้า</button><span>หน้า {page} · {total.toLocaleString()} รายการ</span><button disabled={busy || page * limit >= total} on:click={() => changePage(page + 1)}>ถัดไป</button></div>
  </div>
  <div class="panel">
    <h2>ตั้งค่าต้นทางให้ส่ง POST</h2><p>ปลายทาง: <code>{endpoint}</code> <button on:click={() => copy(endpoint)}>คัดลอก URL</button></p>
    <p>ใช้ <code>Content-Type: application/json</code> และ <code>X-Ingest-Key</code> ค่าเดียวกับ <code>INGEST_API_KEY</code> บน server หน้าเว็บไม่แสดง key นี้</p>
    <p>ส่ง JSON เดี่ยวหรือ array ได้ ระบุ <code>source</code> ให้ตรงชนิด log และใช้ <code>event_id</code> ที่ไม่ซ้ำกันสำหรับแต่ละเหตุการณ์ เมื่อส่งซ้ำให้ใช้ ID เดิมเพื่อป้องกันรายการซ้ำ</p>
    <p>นำเข้าข้อมูลย้อนหลังให้ใส่ <code>processing_mode: "backfill"</code> ใน envelope ระดับเดียวกับ <code>source</code> เพื่อใช้กฎจากรายการเดี่ยวและไม่ส่ง Slack การตรวจซ้ำไม่ลบ incident เดิมที่เคยพบจากหลายเหตุการณ์</p>
    <h3>ตัวอย่างไฟล์ event.json สำหรับ NGINX</h3><pre>{sample}</pre><button on:click={() => copy(sample)}>คัดลอก JSON</button>
    <p>เปลี่ยน IP, timestamp และข้อมูล request ให้เป็นข้อมูลจริงของเหตุการณ์ สำหรับ Firewall ใช้ <code>source: "firewall"</code> และ <code>raw_log</code> เป็นบรรทัด syslog จริง</p>
    <pre>{curl}</pre><button on:click={() => copy(curl)}>คัดลอกคำสั่ง</button><span role="status"> {copyMessage}</span>
    <p><code>201 accepted</code> หมายถึงบันทึกต้นฉบับแล้ว การประมวลผลทำต่อภายหลัง · <code>401</code> ตรวจ key · <code>400</code> ตรวจ JSON · <code>413</code> ลดขนาด batch · <code>503</code> รอและส่งซ้ำด้วย ID เดิม</p>
    <p>NGINX access log ปกติจะเป็น <code>benign</code> และแสดงที่หน้านี้ ส่วน dashboard แสดง security alerts ที่ตรวจพบหลักฐานและอยู่ในขอบเขตเครือข่ายที่กำหนด</p>
  </div>
</section>

<style>
  .ingestion-page { padding: 24px; color: var(--text-primary); }
  .metrics { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 16px; margin: 24px 0; }
  .metrics article,.panel { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .metrics span { display: block; color: var(--text-secondary); font-size: 12px; }
  .metrics strong { display: block; font-size: 28px; margin-top: 12px; }
  .panel { margin-bottom: 20px; }.panel p { color: var(--text-secondary); line-height: 1.7; }.panel h2 { margin: 0; font-size: 18px; }
  .diagnostic-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:18px; margin-top:20px; }.diagnostic-grid span,.diagnostic-grid strong { display:block;font-size:12px;line-height:1.7; }.diagnostic-grid span { color:var(--text-secondary); }.diagnostic-grid strong { margin-top:6px; }.diagnostics a { color:var(--blue); }
  .toolbar,.pagination { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }.toolbar h2 { margin-right: auto; }
  button,select { padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); }button { cursor: pointer; }button:disabled { opacity: .5; cursor: default; }
  .table-wrap { overflow-x: auto; }table { border-collapse: collapse; width: 100%; font-size: 12px; }th,td { padding: 12px; text-align: left; border-bottom: 1px solid var(--border); vertical-align: top; }th { white-space: nowrap; color: var(--text-secondary); }pre { overflow: auto; max-height: 300px; max-width: 100%; padding: 12px; background: var(--bg-secondary); border-radius: 6px; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }small { display: block; }.error,.problem { color: var(--red); }.pagination { margin-top: 16px; }
  @media(max-width:900px) { .metrics,.diagnostic-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
  @media(max-width:500px) { .ingestion-page { padding: 12px; }.metrics { grid-template-columns: 1fr; } }
</style>
