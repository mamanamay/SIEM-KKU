<script lang="ts">
  import { onMount } from 'svelte';
  import { showNotification } from '../../../stores/notificationStore';
  let overview: any = null;
  let error = '';
  let busy = false;
  let policy = { enabled: true, minHighScore: 80, maxPerMinute: 5, cooldownSeconds: 600, highGroupSeconds: 60 };
  let previewText = JSON.stringify({ type: 'SQL Injection', ip: '203.0.113.24', destIp: '10.101.104.234', source: 'firewall', threatScore: 90, severity: 'high', detail: 'SQL injection detected' }, null, 2);
  let preview: any = null;
  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(path, { ...options, headers: { Authorization: 'Bearer ' + localStorage.getItem('token'), 'Content-Type': 'application/json' } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'HTTP ' + response.status);
    return data;
  }
  async function load() { try { overview = await request('/api/developer/alerts'); policy = { ...policy, ...overview.policy }; error = ''; } catch (err) { error = err instanceof Error ? err.message : 'โหลดกฎไม่สำเร็จ'; } }
  onMount(() => { void load(); });
  async function save() {
    busy = true;
    try { overview = await request('/api/developer/alerts', { method: 'PATCH', body: JSON.stringify(policy) }); showNotification('success', 'บันทึกกฎแล้ว', 'ใช้กับคิว Slack รอบถัดไป'); }
    catch (err) { showNotification('error', 'บันทึกไม่สำเร็จ', err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'); }
    finally { busy = false; }
  }
  async function evaluate() {
    busy = true;
    try { preview = await request('/api/developer/alerts/preview', { method: 'POST', body: JSON.stringify(JSON.parse(previewText)) }); }
    catch (err) { showNotification('error', 'พรีวิวไม่สำเร็จ', err instanceof Error ? err.message : 'JSON ไม่ถูกต้อง'); }
    finally { busy = false; }
  }
</script>

<section class="alert-policy-panel">
  <header><div><h2><i class="ti ti-bell-check"></i> Slack Alert Policy</h2><p>ตรวจ LAN และหลักฐานความเสี่ยงก่อนเข้าคิว · Test Connection เป็นการทดสอบส่งอีกแบบหนึ่ง</p></div><button class="btn-secondary" on:click={load} disabled={busy}>รีเฟรชคิว</button></header>
  {#if error}<p role="alert">{error}</p>{:else if !overview}<p role="status">กำลังโหลดกฎ…</p>{:else}
    <div class="budget"><div><strong>{overview.sentLastMinute}/{policy.maxPerMinute}</strong><span>ส่งสำเร็จในนาทีล่าสุด</span></div><div><strong>{overview.queued}</strong><span>รอคิว</span></div><div><strong>{overview.failed}</strong><span>ส่งไม่สำเร็จ</span></div><div><strong>{overview.configured ? 'พร้อม' : 'ยังไม่ตั้งค่า'}</strong><span>Slack ระดับระบบ</span></div></div>
    <form on:submit|preventDefault={save}><label class="enabled"><input type="checkbox" bind:checked={policy.enabled} /> เปิด automatic Slack alerts</label><div class="policy-fields"><label for="alert-high-score">คะแนนขั้นต่ำ High<input id="alert-high-score" type="number" min="0" max="100" bind:value={policy.minHighScore} required /></label><label for="alert-budget">ข้อความสูงสุดต่อนาที<input id="alert-budget" type="number" min="1" max="30" bind:value={policy.maxPerMinute} required /></label><label for="alert-cooldown">Cooldown (วินาที)<input id="alert-cooldown" type="number" min="60" max="3600" bind:value={policy.cooldownSeconds} required /></label><label for="alert-group">รวมกลุ่ม High (วินาที)<input id="alert-group" type="number" min="0" max="300" bind:value={policy.highGroupSeconds} required /></label></div><p>Critical ที่มีหลักฐานเข้าแถวทันที เหตุการณ์ซ้ำเพิ่มจำนวนในกลุ่ม ความเสี่ยงเพิ่มหรือเป้าหมายเปลี่ยนประเมินใหม่ ทุกข้อความผ่านเพดานรวมของช่อง</p><button class="btn-primary" disabled={busy} type="submit">บันทึกกฎแจ้งเตือน</button></form>
    <div class="rule-preview"><h3>Rule Preview</h3><p>ปรับตัวอย่างแล้วดูผลกฎและ cooldown โดยไม่ส่งข้อความจริง</p><label for="alert-event-json">เหตุการณ์ตัวอย่าง (JSON)</label><textarea id="alert-event-json" bind:value={previewText} rows="7" spellcheck="false"></textarea><button class="btn-secondary" disabled={busy} on:click={evaluate}>พรีวิวเหตุผลการแจ้งเตือน</button>{#if preview}<pre aria-live="polite">{JSON.stringify(preview, null, 2)}</pre>{/if}</div>
    {#if overview.recent.length}<div class="recent"><h3>การส่งล่าสุด</h3>{#each overview.recent as delivery}<div><strong>{delivery.summary.type}</strong><span>{delivery.severity} · {delivery.status} · {delivery.hitCount} events</span><small>HTTP {delivery.lastHttpStatus || '—'} · ลองส่ง {delivery.attempts} ครั้ง</small></div>{/each}</div>{/if}
  {/if}
</section>

<style>
  .btn-primary,.btn-secondary{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:9px 14px;border-radius:9px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid var(--border);line-height:1.4}.btn-primary{background:var(--green,#008c76);border-color:var(--green,#008c76);color:#fff}.btn-secondary{background:var(--bg-panel);color:var(--text-primary)}button:disabled{opacity:.5;cursor:not-allowed}
  .alert-policy-panel{background:var(--bg-panel);border:1px solid var(--border);border-radius:16px;padding:24px;margin-top:24px;min-width:0;color:var(--text-primary)}header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}h2{font-size:19px;margin:0 0 10px}h3{font-size:15px;margin:0 0 10px}p{font-size:12px;line-height:1.8;color:var(--text-secondary)}.budget{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0}.budget>div{padding:16px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;min-width:0}.budget strong{font-size:20px;display:block;color:var(--blue)}.budget span{font-size:11px;color:var(--text-secondary);display:block;margin-top:8px}.enabled{display:flex;gap:10px;align-items:center;margin:20px 0;font-size:13px}.enabled input{width:auto;accent-color:var(--blue)}.policy-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}label{font-size:12px}input,textarea{width:100%;box-sizing:border-box;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);border-radius:8px;padding:10px;margin-top:8px;font:inherit}input:focus,textarea:focus{outline:2px solid var(--blue);outline-offset:2px}.rule-preview,.recent{border-top:1px solid var(--border);padding-top:22px;margin-top:22px}.rule-preview textarea{font-family:monospace;font-size:12px;margin-bottom:12px}.rule-preview pre{padding:16px;background:#101a2b;color:#ddecff;white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto;border-radius:10px;font-size:12px}.recent>div{display:flex;flex-wrap:wrap;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);font-size:12px}.recent>div>strong{flex:1;min-width:140px}.recent small{color:var(--text-secondary)}@media(max-width:700px){header{flex-wrap:wrap}.budget{grid-template-columns:repeat(2,minmax(0,1fr))}.policy-fields{grid-template-columns:1fr}.alert-policy-panel{padding:18px}}
</style>
