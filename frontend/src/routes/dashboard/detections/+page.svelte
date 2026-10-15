<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import HelpHint from '../../../lib/components/HelpHint.svelte';
  let items: any[] = [], total = 0, page = 1, busy = false, error = '';
  let source = '', severity = '', scope = 'all', expanded = '';
  let timer: ReturnType<typeof setInterval>, destroyed = false;
  const limit = 25;
  const time = (value: number | string) => new Date(Number(value) || value).toLocaleString('th-TH');
  const direction: Record<string,string> = {inbound:'ขาเข้า',outbound:'ขาออก',internal:'ภายใน',outside:'ภายนอก',unknown:'ยังระบุไม่ได้'};
  async function load() {
    if (busy || destroyed) return;
    busy = true; error = '';
    const query = new URLSearchParams({page:String(page),limit:String(limit),scope});
    if(source)query.set('source',source); if(severity)query.set('severity',severity);
    try {
      const response = await fetch('/api/attacks/detections?'+query,{headers:{Authorization:'Bearer '+(localStorage.getItem('token')||'')},signal:AbortSignal.timeout(15000)});
      const data = await response.json(); if(!response.ok)throw new Error(data.message||`HTTP ${response.status}`);
      if(!destroyed){items=data.items;total=data.total;}
    } catch(e){if(!destroyed)error=e instanceof Error?e.message:'โหลดผลตรวจไม่ได้';}
    finally{busy=false;}
  }
  function filter(){page=1;load();}
  function move(next:number){page=next;expanded='';load();}
  onMount(()=>{load();timer=setInterval(load,10000);});
  onDestroy(()=>{destroyed=true;clearInterval(timer);});
</script>
<svelte:head><title>Detection Results · SIEM KKU</title></svelte:head>
<section class="siem-page detections-page">
  <PageHeader title="Detection Results" description="ดูผลจาก rule และ heuristic ทุกระดับ รวมรายการที่ยังไม่ส่งแจ้งเตือน" icon="ti-shield-search" />
  <div class="explanation"><strong>พบรูปแบบผิดปกติ ไม่ได้แปลว่ายืนยันว่าระบบถูกเจาะแล้ว</strong><p>หน้านี้รวมผลตรวจที่มีคะแนนมากกว่า 0 และรายการที่ต้องตรวจต่อ ส่วน Dashboard และ Slack ใช้เกณฑ์หลักฐานและความเสี่ยงเพิ่มเติม</p></div>
  <div class="toolbar">
    <label>ต้นทาง<select bind:value={source} disabled={busy} on:change={filter}><option value="">ทั้งหมด</option>{#each ['firewall','nginx','server','wazuh','suricata','cowrie','webtrap','generic'] as value}<option value={value}>{value}</option>{/each}</select></label>
    <label>ระดับความเสี่ยง<select bind:value={severity} disabled={busy} on:change={filter}><option value="">ทุกระดับ</option>{#each ['critical','high','medium','low'] as value}<option value={value}>{value}</option>{/each}</select></label>
    <label>เป้าหมาย<HelpHint id="detection-target-help" text="รายการที่ยังไม่ทราบปลายทางยังเก็บผลตรวจไว้ กรุณาตรวจ server_addr หรือ IP เป้าหมายใน Settings > Log API ก่อนสรุปขอบเขต LAN" /><select bind:value={scope} disabled={busy} on:change={filter}><option value="all">ทุกขอบเขต</option><option value="unknown">ยังไม่ทราบปลายทาง</option></select></label>
    <button disabled={busy} on:click={load}>{busy?'กำลังโหลด…':'รีเฟรช'}</button>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <p class="count">ผลตรวจ {total.toLocaleString()} รายการ · แสดงครั้งละ {limit} รายการ · อัปเดตทุก 10 วินาที</p>
  <div class="table-wrap"><table><thead><tr><th>เวลาเกิดเหตุ<HelpHint id="detection-time-help" text="เวลาเกิดเหตุมาจาก timestamp ใน log ส่วนเวลารับผลคือเวลาที่ SIEM ตรวจเสร็จ หากดึง log เก่าเข้ามาใหม่ ให้เลือกวันที่ย้อนหลังบน Dashboard การรับวันนี้ไม่ทำให้เหตุการณ์เก่ากลายเป็นการโจมตีของวันนี้" /></th><th>ผลตรวจ</th><th>ต้นทาง → เป้าหมาย</th><th>ทิศทาง</th><th>ความเสี่ยง<HelpHint id="detection-score-help" text="คะแนนเป็นน้ำหนักของ rule/heuristic ยังไม่ใช่ความน่าจะเป็นที่สอบเทียบแล้ว ชื่อ Isolation Forest/XGBoost ในระบบปัจจุบันยังใช้ heuristic ส่วนโมเดล shadow ไม่เปลี่ยนการแจ้งเตือน" /></th><th>หลักฐาน</th></tr></thead><tbody>
    {#each items as item (item.id)}
      <tr><td>{time(item.timestampMs)}<small>รับผล {time(item.lastProcessedMs)}</small></td><td><strong>{item.type}</strong><small>{item.findingCategory==='review_required'?'ต้องตรวจสอบเพิ่มเติม':'มีหลักฐานเข้าเกณฑ์ตรวจจับ'}</small></td><td>{item.ip}<br/><span>→ {item.destIp||'ยังไม่ทราบเป้าหมาย'}</span><small>{item.source}</small></td><td>{direction[item.networkContext?.direction]||'ยังระบุไม่ได้'}<small>{item.networkContext?.target?.scope||'unknown'}</small></td><td><span class="severity" class:high={['high','critical'].includes(item.severity)}>{item.severity} · {item.threatScore}/100</span></td><td><button on:click={()=>expanded=expanded===String(item.id)?'':String(item.id)} aria-expanded={expanded===String(item.id)}>ดูเหตุผล</button></td></tr>
      {#if expanded===String(item.id)}<tr><td colspan="6"><div class="evidence"><p><strong>Rule:</strong> {item.ruleId||'heuristic / pattern'}</p><p><strong>ขอบเขต:</strong> {item.scopeReason==='TARGET_MISSING'?'ไม่พบ IP เป้าหมาย — ต้องกำหนด asset ของต้นทาง':'พิจารณาทั้ง IP ต้นทางและปลายทาง'}</p><p><strong>เหตุผล:</strong> {item.detail}</p><p>การส่ง Slack ยังขึ้นกับหลักฐาน คะแนน การเปิดใช้งาน การรวมเหตุการณ์ และ cooldown ดูการตั้งค่าที่ <a href="/dashboard/settings/integrations">Integrations</a></p><details><summary>หลักฐานจากตัวตรวจ</summary><pre>{JSON.stringify(item.detectionEvidence,null,2)}</pre></details></div></td></tr>{/if}
    {/each}
    {#if !busy&&!items.length}<tr><td colspan="6">ยังไม่มีผลตรวจในตัวกรองนี้ ตรวจสถานะ log ที่หน้า <a href="/dashboard/log-ingestion">Log Ingestion</a></td></tr>{/if}
  </tbody></table></div>
  <div class="pager"><button disabled={busy||page===1} on:click={()=>move(page-1)}>ก่อนหน้า</button><span>หน้า {page}</span><button disabled={busy||page*limit>=total} on:click={()=>move(page+1)}>ถัดไป</button></div>
</section>
<style>
  .detections-page{padding:24px;color:var(--text-primary)}.explanation{padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--bg-panel);margin:18px 0}.explanation p,.count{color:var(--text-secondary);font-size:12px;line-height:1.7}.toolbar{display:flex;align-items:end;gap:14px;flex-wrap:wrap}.toolbar label{font-size:12px;min-width:160px}select{display:block;width:100%;margin-top:8px;padding:10px;background:var(--bg-panel);color:var(--text-primary);border:1px solid var(--border);border-radius:8px}button{padding:9px 13px;border:1px solid var(--border);border-radius:8px;color:var(--text-primary);background:var(--bg-panel);cursor:pointer}button:disabled{opacity:.5}.table-wrap{overflow:auto;border:1px solid var(--border);border-radius:12px;background:var(--bg-panel)}table{width:100%;border-collapse:collapse;min-width:820px}td,th{padding:14px;text-align:left;border-bottom:1px solid var(--border);font-size:12px;vertical-align:top}th{background:var(--bg-secondary)}small{display:block;color:var(--text-secondary);font-size:11px;line-height:1.7;margin-top:5px}.severity{white-space:nowrap}.high{color:var(--red)}.evidence{padding:12px;border-radius:8px;background:var(--bg-secondary);line-height:1.7}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto}.pager{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:18px}.error{color:var(--red)}a{color:var(--blue)}@media(max-width:700px){.detections-page{padding:14px}.toolbar label{flex:1;min-width:130px}}
</style>
