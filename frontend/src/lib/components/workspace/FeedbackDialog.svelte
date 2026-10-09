<script lang="ts">
  import { tick } from 'svelte';
  import { uiFeedback, settleUiFeedback } from '../../workspace/feedback';
  let dialog: HTMLDialogElement;
  let previous: HTMLElement | null = null;
  $: if (dialog) update(!!$uiFeedback);
  async function update(open: boolean) {
    await tick();
    if (open && !dialog.open) { previous = document.activeElement instanceof HTMLElement ? document.activeElement : null; dialog.showModal(); }
    else if (!open && dialog.open) { dialog.close(); previous?.focus(); }
  }
</script>

<dialog class="siem-workspace siem-feedback-dialog" bind:this={dialog} aria-labelledby="siem-feedback-title" aria-describedby="siem-feedback-message" on:cancel|preventDefault={() => settleUiFeedback(false)}>
  {#if $uiFeedback}
    <span class="siem-eyebrow">SIEM KKU</span>
    <h2 id="siem-feedback-title">{$uiFeedback.title}</h2>
    <p id="siem-feedback-message">{$uiFeedback.message}</p>
    <div class="siem-feedback-actions">
      {#if $uiFeedback.confirm}<button type="button" class="btn-secondary" on:click={() => settleUiFeedback(false)}>ยกเลิก</button>{/if}
      <button type="button" class="btn-primary" on:click={() => settleUiFeedback(true)}>{$uiFeedback.confirm ? 'ยืนยัน' : 'รับทราบ'}</button>
    </div>
  {/if}
</dialog>
