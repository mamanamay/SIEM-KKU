import { compareRow, previewRow, workspaceView, type RowSnapshot } from './view';

/** Enhance rendered tables without intercepting their existing actions or data. */
export function enhanceWorkspace(node: HTMLElement) {
  const installed = new Map<HTMLTableElement, () => void>();
  let queued = false;
  let disposed = false;
  let compact = false;

  function makeButton(label: string, icon: string, action: () => void) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'siem-view-button';
    button.setAttribute('aria-label', label);
    button.title = label;
    const mark = document.createElement('i');
    mark.className = `ti ${icon}`;
    mark.setAttribute('aria-hidden', 'true');
    button.append(mark);
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation(); action();
    });
    return button;
  }

  function install(table: HTMLTableElement) {
    if (!table.tHead || !table.tBodies.length) return;
    if (table.closest('.modal-backdrop, .modal-overlay, .siem-overlay, .wizard-overlay')) return;
    let header = table.tHead.rows[table.tHead.rows.length - 1];
    const headings = Array.from(header.cells).filter(cell => !cell.hasAttribute('data-siem-owned'));
    if (!headings.length || headings.some(cell => cell.colSpan > 1)) return;
    const hidden = new Set<number>();
    let wrap = false;
    const toolbar = document.createElement('div');
    toolbar.className = 'siem-table-tools'; toolbar.dataset.siemOwned = 'true';
    const name = document.createElement('span');
    name.className = 'siem-table-caption'; name.textContent = 'มุมมองตาราง';
    const tools = document.createElement('div'); tools.className = 'siem-table-actions';
    const density = makeButton('สลับความหนาแน่นของตาราง', 'ti-line-height', () => workspaceView.update(s => ({ ...s, compact: !s.compact })));
    const densityText = document.createElement('span'); densityText.textContent = 'กระชับ'; density.append(densityText);
    const wrapping = makeButton('สลับการตัดบรรทัดข้อความ', 'ti-text-wrap', () => {
      wrap = !wrap; table.classList.toggle('siem-wrap-cells', wrap); wrapping.setAttribute('aria-pressed', String(wrap));
    });
    const wrapText = document.createElement('span'); wrapText.textContent = 'ตัดบรรทัด'; wrapping.append(wrapText); wrapping.setAttribute('aria-pressed', 'false');
    const columns = document.createElement('details'); columns.className = 'siem-column-picker';
    const summary = document.createElement('summary'); summary.textContent = 'คอลัมน์';
    columns.append(summary);
    const list = document.createElement('div'); list.className = 'siem-column-list';
    headings.forEach((cell, index) => {
      const labelText = cell.textContent?.trim() || '';
      // Existing action and selection columns always remain available.
      if (!labelText || /actions?|การทำงาน|คำสั่ง/i.test(labelText) || cell.querySelector('input,button')) return;
      const label = document.createElement('label');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = true;
      checkbox.addEventListener('change', () => {
        if (!checkbox.checked && hidden.size >= headings.filter(c => c.textContent?.trim() && !c.querySelector('input,button')).length - 1) { checkbox.checked = true; return; }
        if (checkbox.checked) hidden.delete(index); else hidden.add(index);
        refresh();
      });
      label.append(checkbox, document.createTextNode(labelText)); list.append(label);
    });
    columns.append(list);
    tools.append(density, wrapping, columns); toolbar.append(name, tools);
    table.before(toolbar); table.dataset.siemEnhanced = 'true';
    const extra = document.createElement('th'); extra.dataset.siemOwned = 'true'; extra.className = 'siem-view-column'; extra.textContent = 'ดูข้อมูล'; header.append(extra);

    function snapshot(row: HTMLTableRowElement): RowSnapshot {
      const cells = Array.from(row.cells).filter(c => !c.hasAttribute('data-siem-owned'));
      const fields = headings.flatMap((heading, index) => {
        const label = heading.textContent?.trim() || '';
        const cell = cells[index];
        if (!cell || !label || /actions?|การทำงาน|คำสั่ง/i.test(label) || heading.querySelector('input,button')) return [];
        const value = (cell.textContent || '').trim();
        return [{ label, value: value || '—' }];
      });
      const ip = fields.find(field => /(^|\s)IP|address|username|user|ผู้ใช้/i.test(field.label));
      return { id: JSON.stringify(fields), title: ip?.value || fields[0]?.value || 'ข้อมูลรายการ', fields };
    }

    function refresh() {
      if (disposed) return;
      const rows = Array.from(table.tBodies).flatMap(body => Array.from(body.rows));
      let count = 0;
      for (const row of rows) {
        const cells = Array.from(row.cells).filter(c => !c.hasAttribute('data-siem-owned'));
        if (cells.length !== headings.length || cells.some(c => c.colSpan > 1)) continue;
        count++;
        cells.forEach((cell, index) => {
          const shouldHide = hidden.has(index);
          if (cell.classList.contains('siem-column-hidden') !== shouldHide) cell.classList.toggle('siem-column-hidden', shouldHide);
        });
        if (!row.querySelector('[data-siem-owned]')) {
          const cell = document.createElement('td'); cell.dataset.siemOwned = 'true'; cell.className = 'siem-view-column';
          cell.append(makeButton('ดูข้อมูลย่อ', 'ti-layout-sidebar-right-expand', () => previewRow(snapshot(row))), makeButton('เพิ่มหรือเอาออกจากรายการเปรียบเทียบ', 'ti-columns-2', () => compareRow(snapshot(row))));
          row.append(cell);
        }
      }
      headings.forEach((cell, index) => cell.classList.toggle('siem-column-hidden', hidden.has(index)));
      const caption = `มุมมองตาราง · ${count} รายการที่แสดง`;
      if (name.textContent !== caption) name.textContent = caption;
      density.setAttribute('aria-pressed', String(compact));
    }
    const observe = new MutationObserver(() => refresh());
    observe.observe(table, { childList: true, subtree: true, characterData: true });
    refresh();
    installed.set(table, () => {
      observe.disconnect(); toolbar.remove();
      table.querySelectorAll('[data-siem-owned]').forEach(el => el.remove());
      table.querySelectorAll('.siem-column-hidden').forEach(el => el.classList.remove('siem-column-hidden'));
      table.classList.remove('siem-wrap-cells'); delete table.dataset.siemEnhanced;
    });
  }

  function scan() {
    queued = false;
    if (disposed) return;
    for (const [table, cleanup] of installed) {
      if (!node.contains(table)) { cleanup(); installed.delete(table); }
    }
    node.querySelectorAll<HTMLTableElement>('table').forEach(table => { if (!installed.has(table)) install(table); });
  }
  const observer = new MutationObserver(() => {
    if (!queued) { queued = true; queueMicrotask(scan); }
  });
  observer.observe(node, { childList: true, subtree: true });
  const unsubscribe = workspaceView.subscribe(state => {
    compact = state.compact;
    node.classList.toggle('siem-compact-tables', compact);
    node.querySelectorAll('button[aria-label="สลับความหนาแน่นของตาราง"]').forEach(button => button.setAttribute('aria-pressed', String(compact)));
  });
  scan();
  return { destroy() { disposed = true; observer.disconnect(); unsubscribe(); installed.forEach(cleanup => cleanup()); installed.clear(); } };
}
