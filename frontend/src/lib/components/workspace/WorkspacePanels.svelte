<script lang="ts">
  import { tick } from 'svelte';
  import { workspaceView, closeWorkspacePanel } from '../../workspace/view';
  let dialog: HTMLDialogElement;
  let returnFocus: HTMLElement | null = null;
  let copyStatus = '';
  $: open = !!$workspaceView.preview || $workspaceView.comparing;
  $: if (dialog) updateDialog(open);
  $: labels = [...new Set($workspaceView.comparison.flatMap(row => row.fields.map(field => field.label)))];

  async function updateDialog(show: boolean) {
    await tick();
    if (show && !dialog.open) { returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; dialog.showModal(); copyStatus = ''; }
    else if (!show && dialog.open) { dialog.close(); returnFocus?.focus(); }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); copyStatus = 'คัดลอกแล้ว'; }
    catch { copyStatus = 'ไม่สามารถคัดลอกได้ กรุณาเลือกข้อความเพื่อคัดลอก'; }
  }
  function getValue(index: number, label: string) { return $workspaceView.comparison[index]?.fields.find(field => field.label === label)?.value || '—'; }
</script>

{#if $workspaceView.comparison.length}
  <div class="siem-compare-tray siem-workspace" role="region" aria-label="รายการเปรียบเทียบ">
    <i class="ti ti-columns-2" aria-hidden="true"></i>
    <span>เลือกเปรียบเทียบ {$workspaceView.comparison.length}/2 รายการ</span>
    <button type="button" disabled={$workspaceView.comparison.length !== 2} on:click={() => workspaceView.update(s => ({ ...s, comparing: true, preview: null }))}>เปรียบเทียบ</button>
    <button type="button" class="siem-tray-clear" on:click={() => workspaceView.update(s => ({ ...s, comparison: [], comparing: false }))} aria-label="ล้างรายการเปรียบเทียบ"><i class="ti ti-x"></i></button>
  </div>
{/if}

<!-- The native dialog provides Escape and keyboard focus handling; click handles only its backdrop. -->
<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog} class="siem-inspector siem-workspace" class:siem-comparison={$workspaceView.comparing} aria-labelledby="siem-inspector-title" on:cancel|preventDefault={closeWorkspacePanel} on:click={(event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeWorkspacePanel(); } }}>
  <header>
    <div><span class="siem-eyebrow">QUICK VIEW</span><h2 id="siem-inspector-title">{$workspaceView.comparing ? 'เปรียบเทียบข้อมูล' : 'ข้อมูลรายการ'}</h2></div>
    <button type="button" class="siem-icon-button" on:click={closeWorkspacePanel} aria-label="ปิดแผงข้อมูล"><i class="ti ti-x"></i></button>
  </header>
  <p class="siem-panel-note">ข้อมูลจากแถวที่เลือก ณ เวลาที่กดดู · ไม่มีการโหลดหรือแก้ไขข้อมูลเพิ่มเติม</p>
  {#if $workspaceView.comparing}
    <div class="siem-comparison-scroll"><table class="siem-comparison-table"><thead><tr><th>ข้อมูล</th><th>รายการที่ 1</th><th>รายการที่ 2</th></tr></thead><tbody>
      {#each labels as label}
        <tr class:different={getValue(0, label) !== getValue(1, label)}><th scope="row">{label}</th><td>{getValue(0, label)}</td><td>{getValue(1, label)}</td></tr>
      {/each}
    </tbody></table></div>
    <p class="siem-panel-note"><span class="siem-diff-dot"></span> สีพื้นแสดงค่าที่แตกต่างกัน</p>
  {:else if $workspaceView.preview}
    <h3 class="siem-preview-title">{$workspaceView.preview.title}</h3>
    <dl class="siem-preview-fields">
      {#each $workspaceView.preview.fields as field}
        <div><dt>{field.label}<button type="button" class="siem-icon-button" on:click={() => copy(field.value)} aria-label={`คัดลอก ${field.label}`}><i class="ti ti-copy"></i></button></dt><dd><pre>{field.value}</pre></dd></div>
      {/each}
    </dl>
  {/if}
  <p class="siem-copy-status" role="status">{copyStatus}</p>
</dialog>
