export const ALERT_POLICY_VERSION = 'evidence-v1';
export const EVENT_SCOPE = 'organization' as const;
export const IN_NETWORK_LABEL='ในเครือข่าย (ไม่ระบุหน่วยงาน)';
export function endpointOrganization(endpoint:any):string {
  const name=String(endpoint?.organization||'').trim();
  if(endpoint?.scope==='organization'&&(!name||['Unknown','—','-'].includes(name)||name.startsWith('Local Network (')))return IN_NETWORK_LABEL;
  return name||'Unknown';
}
export function isQualifiedAlert(event: any): boolean {
  if (event?.alertEligible !== true || event.detectionMode !== 'engine' || event.alertPolicyVersion !== ALERT_POLICY_VERSION) return false;
  const signals = event.detectionEvidence?.attack_signals || [];
  if (event.severity === 'medium') return Array.isArray(signals) && signals.some((s: any)=>s.kind==='ips_signature' && s.signature_id && s.signature_name);
  return ['high','critical'].includes(event.severity) && Number(event.threatScore) >= 70;
}
export function belongsToScope(event: any, _legacyScope: string = EVENT_SCOPE) {
  return event.networkContext?.target?.scope === EVENT_SCOPE || event.networkContext?.source?.scope === EVENT_SCOPE;
}
export function isVisibleAlert(event:any):boolean {
  return isQualifiedAlert(event)&&belongsToScope(event);
}
export function mergeAlerts(current: any[], incoming: any[], limit = 500) {
  const byId = new Map(current.filter(isVisibleAlert).map(event=>[String(event.id),event]));
  for (const event of incoming.filter(isVisibleAlert)) {
    const prior = byId.get(String(event.id));
    if (!prior || Number(event.hitCount || 1) >= Number(prior.hitCount || 1)) byId.set(String(event.id),{...prior,...event});
  }
  return [...byId.values()].sort((a,b)=>Number(b.lastSeenMs || b.timestampMs)-Number(a.lastSeenMs || a.timestampMs) || Number(b.id)-Number(a.id)).slice(0,limit);
}
