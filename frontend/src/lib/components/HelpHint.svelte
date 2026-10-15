<script lang="ts">
  import { tick } from 'svelte';
  export let id: string;
  export let text: string;
  export let label = 'อ่านคำอธิบาย';
  let open = false;
  let button: HTMLButtonElement;
  let tooltip: HTMLSpanElement;
  let top = 0, left = 0;
  let pointerWasOpen = false;
  function outside(event: PointerEvent) {
    const target = event.target as Node;
    if (open && !button?.contains(target) && !tooltip?.contains(target)) open = false;
  }
  function scroll() {
    if (open && document.activeElement === button) {
      const box = button.getBoundingClientRect();
      if (box.bottom > 0 && box.top < window.innerHeight) { show(); return; }
    }
    open = false;
  }
  async function show() {
    const box = button.getBoundingClientRect();
    left = Math.max(8, Math.min(box.left, window.innerWidth - Math.min(280, window.innerWidth * .75) - 12));
    top = box.bottom + 8; open = true;
    await tick();
    if (open && tooltip) {
      const height = tooltip.getBoundingClientRect().height;
      if (top + height > window.innerHeight - 8) top = Math.max(8, box.top - height - 8);
    }
  }
</script>
<svelte:window on:scroll|capture={scroll} on:resize={() => open = false}
  on:pointerdown={outside} />
<span class="help-hint" role="presentation" on:mouseenter={() => { if (window.matchMedia('(hover: hover)').matches) show(); }} on:mouseleave={() => open = false}>
  <button bind:this={button} type="button" class="hint-button" aria-label={label} aria-expanded={open} aria-describedby={open ? id : undefined}
    on:focus={show} on:blur={() => open = false} on:pointerdown={() => pointerWasOpen = open}
    on:click={(event) => { if (event.detail > 0 && pointerWasOpen && window.matchMedia('(hover: none)').matches) open = false; else show(); }}
    on:keydown={(event) => { if (event.key === 'Escape') open = false; }}>?</button>
  {#if open}<span bind:this={tooltip} class="hint-content" style:top={`${top}px`} style:left={`${left}px`} id={id} role="tooltip">{text}</span>{/if}
</span>

<style>
  .help-hint{display:inline-flex;position:relative;vertical-align:middle;margin-left:5px}
  .hint-button{display:inline-grid;place-items:center;width:22px;height:22px;min-width:22px;padding:0;border:1px solid var(--border);border-radius:50%;background:var(--bg-secondary);color:var(--text-secondary);font:inherit;font-size:12px;cursor:help;line-height:1}
  .hint-button:focus-visible{outline:2px solid var(--blue);outline-offset:3px}
  .hint-content{position:fixed;z-index:1000;width:min(280px,75vw);max-height:calc(100vh - 16px);overflow:auto;box-sizing:border-box;padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--bg-panel);color:var(--text-primary);box-shadow:0 8px 24px #0002;font-size:12px;font-weight:400;line-height:1.7;text-align:left;white-space:normal;overflow-wrap:anywhere}
</style>
