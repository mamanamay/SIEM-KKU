const EDITABLE_KEYS = new Set(['reportTitle', 'executiveSummary', 'recommendations', 'rootCause', 'impact', 'actionsTaken', 'resolution', 'remainingWork']);
const text = (element: HTMLElement) => (element.innerText ?? element.textContent ?? '').replace(/\r\n/g, '\n');

export function setReportEditMode(document: Document, enabled: boolean): number {
  let count = 0;
  document.querySelectorAll<HTMLElement>('[data-edit-key]').forEach(element => {
    if (!EDITABLE_KEYS.has(element.dataset.editKey || '')) return;
    if (enabled && element.contentEditable !== 'true' && element.contentEditable !== 'plaintext-only') element.dataset.originalText = text(element);
    element.setAttribute('contenteditable', enabled ? 'plaintext-only' : 'false');
    element.setAttribute('spellcheck', 'false');
    if (enabled) {
      element.setAttribute('tabindex', '0');
      element.setAttribute('role', 'textbox');
      element.setAttribute('aria-label', element.closest('section')?.querySelector('h2')?.textContent || 'ชื่อรายงาน');
      count++;
    } else {
      element.removeAttribute('tabindex');
      element.removeAttribute('role');
    }
  });
  document.body.classList.toggle('report-editing', enabled);
  return count;
}

export function collectReportEdits(document: Document): Record<string, string> {
  const edits: Record<string, string> = {};
  document.querySelectorAll<HTMLElement>('[data-edit-key]').forEach(element => {
    const key = element.dataset.editKey || '';
    if (EDITABLE_KEYS.has(key) && element.dataset.originalText !== undefined && text(element) !== element.dataset.originalText) edits[key] = text(element);
  });
  return edits;
}
