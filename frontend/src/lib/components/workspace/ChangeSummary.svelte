<script lang="ts">
  export let values: Record<string, string | number | boolean | null | undefined> = {};
  export let secrets: string[] = [];
  export let ready = true;
  export let identity = '';
  let baseline: typeof values | null = null;
  let baselineIdentity = '';
  $: if (ready && (!baseline || identity !== baselineIdentity)) {
    baseline = { ...values };
    baselineIdentity = identity;
  }
  $: changes = baseline ? Object.entries(values).filter(([key, value]) => String(value ?? '') !== String(baseline?.[key] ?? '')) : [];
  const display = (value: unknown) => value === '' || value === null || value === undefined ? 'ไม่ได้ระบุ' : typeof value === 'boolean' ? value ? 'เปิด' : 'ปิด' : String(value);
</script>

{#if ready && changes.length}
  <details class="siem-change-summary" open>
    <summary><i class="ti ti-git-compare" aria-hidden="true"></i> เปลี่ยนจากตอนเปิดฟอร์ม {changes.length} รายการ</summary>
    <dl>
      {#each changes as [label, value]}
        <div><dt>{label}</dt><dd>{#if secrets.includes(label)}มีการเปลี่ยนค่า{:else}<span>{display(baseline?.[label])}</span><i class="ti ti-arrow-right" aria-hidden="true"></i><strong>{display(value)}</strong>{/if}</dd></div>
      {/each}
    </dl>
    <p>ตรวจทานก่อนกดบันทึกตามขั้นตอนเดิม</p>
  </details>
{/if}
