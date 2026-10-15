<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import PageHeader from '../../../../lib/components/PageHeader.svelte';
  let connection: any = null;
  let migration: any = { requiresSelection: false, legacyOptions: [] };
  let busy = '', error = '', message = '', loading = true, dirty = false;
  let preview: any = null;
  let reuseFrom = '';
  let timer: ReturnType<typeof setInterval>;
  let destroyed = false;
  let receiverVersion = '';
  let limits = { maxRecords: 1000, maxResponseBytes: 2097152, maxLogBytes: 65536 };
  async function api(path = '', body?: any) {
    const res = await fetch('/api/log-sources' + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
    const data = await res.json();
    if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' · ') : data.message || `HTTP ${res.status}`);
    return data;
  }
  async function load(initial = false) {
    if (busy || destroyed) return;
    try {
      const data = await api();
      if (destroyed) return;
      if (!data.capabilities?.sse || !data.connection) throw new Error('Backend receiver รุ่นนี้ยังไม่รองรับ SSE กรุณา deploy ชุดเดียวกับ frontend');
      receiverVersion = data.receiverVersion;
      if (data.limits) limits = data.limits;
      migration = data.migration;
      if (initial) connection = { ...data.connection, apiKey: '' };
      else if (connection) connection = { ...connection, state: data.connection.state };
    } catch (e) { if (!destroyed) error = e instanceof Error ? e.message : 'โหลดการตั้งค่าไม่สำเร็จ'; }
    finally { loading = false; }
  }
  function selectLegacy() {
    const selected = migration.legacyOptions.find((item: any) => item.id === reuseFrom);
    if (!selected) return;
    connection = { ...selected, source: 'combined', apiKey: '', state: null, sourceField: selected.sourceField || 'event.module' };
    dirty = true; preview = null;
  }
  async function action(kind: 'save' | 'test' | 'pull') {
    if (busy) return;
    busy = kind; error = ''; message = '';
    try {
      const data = await api(kind === 'save' ? '' : '/' + kind, kind === 'pull' ? {} : { ...connection, ...(reuseFrom ? { reuseFrom } : {}) });
      if (kind === 'save') {
        connection = { ...data.connection, apiKey: '' }; migration = data.migration;
        dirty = false; reuseFrom = ''; preview = null; message = 'บันทึก API จุดเดียวแล้ว ระบบจะแยกชนิด log อัตโนมัติ';
      } else if (kind === 'test') {
        preview = data; message = data.existingStream ? 'แสดงตัวอย่างจาก SSE ที่กำลังรับอยู่ (ไม่เปิดการเชื่อมต่อเพิ่ม)' : 'เชื่อมต่อสำเร็จ อ่านได้ ' + data.received + ' รายการ (ยังไม่บันทึก log)';
      } else {
        connection = { ...connection, state: data }; message = data.mode === 'sse' && data.running ? 'เริ่มรับ SSE ต่อเนื่องแล้ว ดูจำนวนและผลตรวจใน Log Ingestion' : 'อ่าน ' + data.received + ' · ใหม่ ' + data.inserted + ' · ซ้ำ ' + data.deduplicated + ' รายการ';
      }
    } catch (e) { error = e instanceof Error ? e.message : 'เชื่อมต่อไม่สำเร็จ'; }
    finally { busy = ''; }
  }
  onMount(() => { load(true); timer = setInterval(() => load(), 15000); });
  onDestroy(() => { destroyed = true; clearInterval(timer); });
</script>

<svelte:head><title>Log API · SIEM KKU</title></svelte:head>
<section class="siem-page log-api-page" aria-label="Log API Settings">
  <PageHeader title="Log API" description="ตั้งค่า API จุดเดียว แล้วแยกชนิดและอุปกรณ์ต้นทางจากแต่ละรายการ" icon="ti-database-import" />
  <p class="intro">URL และ API key ชุดเดียวสำหรับทุก log ใน feed ระบบแยก NGINX/Firewall จาก event.module, event.dataset, observer และรูปแบบเนื้อหา โดยเก็บ ECS JSON ทั้งรายการ</p>
  {#if receiverVersion}<p class="receiver-version">Receiver: {receiverVersion} · SSE supported · <a href="/dashboard/detections">Detection Results</a></p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if message}<p class="success" role="status">{message}</p>{/if}
  {#if loading}<p>กำลังโหลด…</p>{/if}
  {#if migration?.requiresSelection}
    <div class="migration"><p>พบ API เดิมมากกว่าหนึ่งชุด เลือกชุดที่จะใช้เป็นจุดเดียว ค่า key เดิมจะคงไว้โดยไม่แสดง key</p>
      <label for="legacy-connection">เลือกการตั้งค่าเดิม</label><select id="legacy-connection" bind:value={reuseFrom} on:change={selectLegacy} disabled={!!busy}>
        <option value="">เลือกชุดเดิม หรือกรอก URL/key ใหม่ด้านล่าง</option>
        {#each migration.legacyOptions as item}<option value={item.id}>{item.id.toUpperCase()} · {new URL(item.url).hostname}</option>{/each}
      </select>
    </div>
  {/if}
  {#if connection}
    <form class="source-panel" data-source="combined" on:input={() => { dirty = true; }} on:submit|preventDefault={() => action('save')}>
      <div class="panel-heading"><h2>การเชื่อมต่อ API</h2><label class="toggle"><input type="checkbox" bind:checked={connection.enabled} disabled={!!busy} /> ดึงอัตโนมัติหลังบันทึก</label></div>
      <label for="combined-url">URL ต้นทาง (GET)</label><input id="combined-url" type="url" bind:value={connection.url} required placeholder="https://logs.example/api/logs" disabled={!!busy} />
      <div class="fields">
        <div><label for="combined-auth">วิธีส่ง API key</label><select id="combined-auth" bind:value={connection.authType} disabled={!!busy}><option value="header">Custom header</option><option value="bearer">Authorization: Bearer</option><option value="query">Query parameter</option><option value="none">ไม่ใช้ key</option></select></div>
        {#if ['header','query'].includes(connection.authType)}<div><label for="combined-name">{connection.authType === 'query' ? 'ชื่อ parameter' : 'ชื่อ header'}</label><input id="combined-name" bind:value={connection.authName} placeholder="X-API-Key" disabled={!!busy} /></div>{/if}
        {#if connection.authType !== 'none'}<div><label for="combined-key">API key {connection.keyConfigured ? '· บันทึกแล้ว' : ''}</label><input id="combined-key" type="password" bind:value={connection.apiKey} autocomplete="new-password" placeholder={connection.keyConfigured ? 'เว้นว่างเพื่อใช้ key เดิม' : 'กรอก key ของต้นทาง'} disabled={!!busy} /></div>{/if}
        <div><label for="combined-interval">รอบดึง / รอเชื่อมใหม่เมื่อหลุด (วินาที)</label><input id="combined-interval" type="number" min="10" max="3600" bind:value={connection.intervalSeconds} required disabled={!!busy} /></div>
      </div>
      <details class="advanced"><summary>รูปแบบ response และ mapping (ไม่ต้องเลือกชนิด log)</summary>
        <label for="combined-format">รูปแบบ response</label><select id="combined-format" bind:value={connection.format} disabled={!!busy}><option value="auto">ตรวจอัตโนมัติ รวม SSE</option><option value="sse">SSE · รับต่อเนื่อง</option><option value="text">Raw text · หนึ่งบรรทัดต่อ log</option><option value="json">JSON / NDJSON</option></select>
        {#if connection.format !== 'text'}<div class="fields"><div><label for="combined-items">ตำแหน่ง array ใน JSON</label><input id="combined-items" bind:value={connection.itemsPath} placeholder="เว้นว่างเพื่อตรวจอัตโนมัติ เช่น data.logs" disabled={!!busy} /></div><div><label for="combined-raw">Field ของ raw log</label><input id="combined-raw" bind:value={connection.rawField} placeholder="raw_log หรือ message" disabled={!!busy} /></div></div>{/if}
        <label for="combined-source-field">Field แยกชนิด (ไม่บังคับ)</label><input id="combined-source-field" bind:value={connection.sourceField} placeholder="event.module" disabled={!!busy} />
        <p>สำหรับ ECS จะรักษา JSON ทั้งรายการ ข้อมูลผู้เชื่อมต่อ source.ip แยกจากอุปกรณ์ที่บันทึก observer.name/hostname/ip หากข้อมูลต้นทางขัดแย้งหรือไม่รู้ชนิด ระบบเก็บไว้พร้อมเหตุผลให้ตรวจสอบ</p>
      </details>
      <div class="actions"><button type="submit" disabled={!!busy}>บันทึก</button><button type="button" disabled={!!busy || !connection.url} on:click={() => action('test')}>ทดสอบ GET</button><button type="button" disabled={!!busy || dirty || !connection.url || !connection.keyConfigured && connection.authType !== 'none'} on:click={() => action('pull')}>ดึง log ตอนนี้</button>{#if busy}<span>กำลังดำเนินการ…</span>{/if}</div>
      {#if dirty}<p>มีค่าที่แก้ไขยังไม่บันทึก ทดสอบ GET ได้ แล้วบันทึกก่อนดึง log เข้าระบบ</p>{/if}
      {#if connection.state}<div class="source-status" class:failed={!connection.state.ok}>
        ผลล่าสุด: {connection.state.ok ? 'สำเร็จ' : connection.state.error} · {new Date(connection.state.lastAttempt).toLocaleString('th-TH')}
        {#if connection.state.mode === 'sse'}<p>SSE: {connection.state.connected ? 'เชื่อมต่อและรับต่อเนื่อง' : connection.enabled ? 'รอเชื่อมต่อใหม่' : 'หยุดรับอัตโนมัติ'} · จำนวนด้านล่างสะสมตั้งแต่ backend เริ่มรับ</p>
          {#if connection.state.lastEventAt}<p>บันทึก event ล่าสุด: {new Date(connection.state.lastEventAt).toLocaleString('th-TH')}</p>{/if}
          {#if !connection.state.resumeAvailable}<p>ต้นทางยังไม่ส่ง SSE event ID จึงยังยืนยันการรับย้อนหลังหลังหลุดไม่ได้</p>{/if}
        {/if}
        <p>อ่าน {connection.state.received} · ใหม่ {connection.state.inserted ?? '—'} · ซ้ำ {connection.state.deduplicated ?? '—'} รายการ</p>
        {#if connection.state.sourceCounts}<pre>{JSON.stringify(connection.state.sourceCounts)}</pre>{/if}
        {#if connection.state.latestSourceTimestamp}<p>เวลาเหตุการณ์ล่าสุดที่ API คืน: {new Date(connection.state.latestSourceTimestamp).toLocaleString('th-TH')}</p>{/if}
        {#if connection.state.mode !== 'sse' && connection.state.ok && connection.state.received && connection.state.inserted === 0}<p>รอบนี้ไม่มีรายการใหม่ ตรวจว่า API ต้นทางส่งเหตุการณ์ใหม่แล้ว</p>{/if}
        {#if connection.state.unknown}<p class="error">แยกชนิดไม่ได้ {connection.state.unknown} รายการ ดูเหตุผลและต้นฉบับใน Log Ingestion</p>{/if}
      </div>{/if}
      {#if preview}<div class="preview"><h3>ผลการแยกชนิดจาก API</h3><pre>{JSON.stringify(preview.sourceCounts)}</pre>
        {#each preview.preview as item}<details open><summary>{item.source} · อุปกรณ์: {item.origin?.observerName || item.origin?.hostName || item.origin?.agentName || 'ไม่ระบุ'} · หลักฐาน: {item.origin?.basis || 'ไม่ระบุ'}</summary>
          <pre>{JSON.stringify(item.origin, null, 2)}</pre>{#if item.issue}<p class="error">{item.issue}</p>{/if}<pre>{item.raw}</pre>
        </details>{/each}
        <p>{preview.existingStream ? 'ตัวอย่างจาก event ที่ stream บันทึกแล้ว ปุ่มทดสอบไม่บันทึกซ้ำ' : preview.mode === 'sse' ? 'ทดสอบ SSE อ่านตัวอย่างไม่เกิน 5 รายการ/5 วินาที แล้วปิดการเชื่อมต่อ ยังไม่ได้บันทึก log' : 'ทดสอบ GET ตรวจการรับ/แยกชนิด ยังไม่ได้บันทึก log หรือสร้าง alert'}</p>
      </div>{/if}
    </form>
  {/if}
  <div class="help"><h3>รับข้อมูลผ่านจุดเดียว</h3><p>เปิดดึงอัตโนมัติแล้วบันทึก: SSE รับต่อเนื่องจาก backend แม้ปิดหน้าเว็บ ส่วน JSON/raw text ดึงตามรอบที่กำหนด ถ้าต้นทางส่ง POST ให้ใช้ <code>/api/ingest</code> จุดเดียว</p><p>รองรับ SSE data ที่เป็น ECS JSON เดี่ยว/array, JSON/NDJSON, Elasticsearch hits.hits._source และ raw text ระบบส่ง Last-Event-ID หลังบันทึกสำเร็จเมื่อเชื่อมใหม่ หากต้นทางรองรับการ replay</p><p>ต่อ response ปกติหรือหนึ่ง SSE frame ไม่เกิน {limits.maxRecords.toLocaleString()} รายการ / {(limits.maxResponseBytes / 1048576).toLocaleString()} MB และต่อ log {(limits.maxLogBytes / 1024).toLocaleString()} KB ไม่มีการสะสม stream ทั้งเส้นไว้ในหน่วยความจำ</p><a href="/dashboard/log-ingestion">ดูรายการที่รับเข้าจริง อุปกรณ์ต้นทาง และผลตรวจ →</a></div>
</section>

<style>
  .log-api-page { padding: 24px; color: var(--text-primary); }.intro,.help p,p { line-height: 1.7; }.intro,.help p { color: var(--text-secondary); }.source-panel,.help,.migration { margin: 20px 0; padding: 22px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-panel); }
  .panel-heading,.actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }.panel-heading h2 { margin: 0 auto 12px 0; font-size: 20px; }.toggle { display: flex; gap: 8px; align-items: center; }.fields { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; }
  label { display: block; margin: 16px 0 6px; font-size: 13px; }input:not([type=checkbox]),select { box-sizing: border-box; width: 100%; padding: 11px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); }.actions { margin: 20px 0; }button { padding: 10px 15px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; }button:disabled { opacity: .5; cursor: default; }.source-status { padding: 12px; border-radius: 6px; background: var(--bg-secondary); }.error,.failed { color: var(--red); }.success { color: var(--green); }pre { max-height: 300px; overflow: auto; padding: 12px; background: var(--bg-secondary); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }a { color: var(--blue); }.advanced { margin-top: 20px; }summary { cursor: pointer; }.preview details { margin: 12px 0; }
  @media(max-width:850px) { .fields { grid-template-columns: 1fr; }.log-api-page { padding: 14px; } }
</style>
