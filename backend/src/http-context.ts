/** Bounded HTTP evidence. A destination IP/port never establishes a website name or scheme. */
export interface HttpContext {
  host: string | null; uri: string | null; url: string | null; method: string | null;
  status: number | null; userAgent: string | null; bytesSent: number | null;
  timestampMs?: number | null;
}
const text = (value: any, max = 2048): string | null => typeof value === 'string' && value.trim()
  ? value.replace(/[\u0000-\u001f]/g, '').slice(0, max) : null;
/** Extract bounded fields before hydration: truncating an entire JSON document makes it unparsable. */
export function httpJsonProjection(column: string, driver: string) {
  const fields: Record<string,number> = {timestamp:40,host:255,scheme:8,uri:2048,http_method:16,http_status:3,user_agent:512,bytes_sent:24};
  const values=Object.entries(fields).flatMap(([key,max])=>[`'${key}'`,driver==='postgres'
    ? `SUBSTR(CAST(${column} AS jsonb)->>'${key}',1,${max})`
    : `SUBSTR(CAST(json_extract(${column}, '$.${key}') AS TEXT),1,${max})`]);
  return (driver==='postgres'?'jsonb_build_object':'json_object')+'('+values.join(',')+')';
}
export function httpContext(normalized: any = {}, raw?: string): HttpContext | null {
  let original: any = {};
  if (raw && raw.length <= 32768) { try { original = JSON.parse(raw); } catch {
    const request = raw.match(/"([A-Z]{1,16})\s+(\S+)\s+HTTP\/[\d.]+"\s+(\d{3})\s+(\d+|-)/);
    if (request) original = { request_method: request[1], request_uri: request[2], status: Number(request[3]), body_bytes_sent: request[4] };
  } }
  const n = normalized || {}, f = n.firewall_fields || {};
  const uri = text(n.uri || n.url?.original || original.request_uri || original.url?.original || f.url);
  let host = [n.host, n.hostname, n.url?.domain, original.url?.domain, original.http_host, original.host, f.hostname]
    .map(value => text(value, 255)).find(Boolean) || null;
  let url: string | null = null;
  if (uri && /^https?:\/\//i.test(uri)) { try { const parsed = new URL(uri); host ||= parsed.host; url = uri; } catch {} }
  const scheme = n.scheme || original.scheme;
  if (!url && host && uri && ['http', 'https'].includes(scheme)) url = scheme + '://' + host + (uri.startsWith('/') ? uri : '/' + uri);
  const statusValue = n.http_status ?? original.status ?? original.response_status ?? original.http?.response?.status_code;
  const status = Number(statusValue);
  const bytes = n.bytes_sent ?? original.body_bytes_sent;
  const observedTime = Date.parse(n.timestamp || original['@timestamp'] || '');
  const result: HttpContext = { host, uri, url, timestampMs: Number.isFinite(observedTime) ? observedTime : null,
    method: text(n.http_method || original.request_method || original.http?.request?.method, 16),
    status: statusValue != null && Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    userAgent: text(n.user_agent || original.http_user_agent || original.user_agent?.original, 512),
    bytesSent: bytes != null && Number.isFinite(Number(bytes)) && Number(bytes) >= 0 ? Number(bytes) : null };
  return result.host || result.uri || result.method ? result : null;
}
