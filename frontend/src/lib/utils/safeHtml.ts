import createDOMPurify from 'dompurify';

let purifier: ReturnType<typeof createDOMPurify> | undefined;

export function escapeText(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Sanitize dynamic HTML bindings; no layout, classes or CSS are added. */
export function safeHtml(value: unknown, documentMode = false): string {
  if (typeof window === 'undefined') return escapeText(value);
  purifier ??= createDOMPurify(window);
  return purifier.sanitize(String(value ?? ''), {
    USE_PROFILES: { html: true },
    WHOLE_DOCUMENT: documentMode,
    ADD_TAGS: documentMode ? ['style'] : [],
    FORBID_TAGS: documentMode ? ['iframe', 'object', 'embed', 'form'] : ['style', 'iframe', 'object', 'embed', 'form'],
  });
}

/** Escape only data values before interpolating them into trusted report CSS/HTML. */
export function escapeReportData<T>(value: T): T {
  if (typeof value === 'string') return escapeText(value) as T;
  if (Array.isArray(value)) return value.map(item => escapeReportData(item)) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, escapeReportData(item)])) as T;
  }
  return value;
}
