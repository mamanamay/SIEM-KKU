const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const windowMs = 5 * 60 * 1000;

export function isActionableDetection(event: any): boolean {
  const type = String(event.type || event.attack_type || '').trim();
  if (/^(?:benign(?: traffic)?|normal traffic|unknown(?: anomaly)?|unconfirmed anomaly|suspicious activity|ai detection|firewall event|web access|syslog event)$/i.test(type)) return false;
  // Explicit signatures/correlated behavior and alerts produced by security sensors.
  return /sql.?inject|cross.site scripting|\bxss\b|command.?inject|command execution|path.?traversal|\blfi\b|\brce\b|brute[ _-]?force|port[ _-]?scan|web[ _-]?(?:attack|scan)|malware|ransomware|botnet|beacon|denial of service|ddos|system compromised|^wazuh:|^suricata:/i.test(type);
}

export function incidentTime(event: any): number {
  const numeric = Number(event.timestampMs);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const value = Date.parse(event.createdAt || event.detected_at || event.time || '');
  return Number.isFinite(value) ? value : 0;
}

export function incidentOutcome(event: any): string {
  const raw = event.action || /(?:^|\s)action=["']?([a-z_-]+)/i.exec(event.detail || '')?.[1];
  if (/^(?:deny|drop|dropped|blocked|block)$/i.test(raw || '')) return 'ถูกปฏิเสธ / ถูกบล็อก';
  if (/^(?:accept|allow|allowed|pass)$/i.test(raw || '')) return 'อนุญาตการเชื่อมต่อ — ยังไม่ยืนยันการโจมตีสำเร็จ';
  return 'ยังไม่มีหลักฐานยืนยันผลกระทบ';
}

export function buildIncidentQueue(events: any[], inScope: (target: string) => boolean): any[] {
  const unique = new Map<string, any>();
  for (const [index, event] of events.entries()) {
    const target = event.destIp || event.dst_ip || '';
    if (!inScope(target) || !isActionableDetection(event)) continue;
    const identity = event.id ?? event.incident_id;
    const key = identity === undefined ? 'row:' + index : 'id:' + identity;
    const previous = unique.get(key);
    if (!previous || Number(event.hitCount || 1) >= Number(previous.hitCount || 1)) unique.set(key, event);
  }
  const groups: any[] = [];
  const active = new Map<string, any>();
  for (const event of [...unique.values()].sort((a,b) => incidentTime(a) - incidentTime(b))) {
    const target = event.destIp || event.dst_ip;
    const key = JSON.stringify([event.ip, target, event.honeypotPort || null, String(event.type).toLowerCase()]);
    const time = incidentTime(event);
    let group = active.get(key);
    if (!group || !time || time - group.firstSeenMs >= windowMs) {
      group = { ...event, destIp: target, groupId: key + ':' + time + ':' + (event.id ?? groups.length),
        firstSeenMs: time, lastSeenMs: time, incidentMembers: [], relatedCount: 0, sensorSources: [] };
      groups.push(group);
      active.set(key, group);
    }
    group.incidentMembers.push(event);
    const hits = Number(event.hitCount);
    group.relatedCount += Number.isFinite(hits) && hits > 0 ? hits : 1;
    group.lastSeenMs = Math.max(group.lastSeenMs, time);
    const sensor = event.source || event.clientVersion || 'unknown';
    if (!group.sensorSources.includes(sensor)) group.sensorSources.push(sensor);
    if ((severityRank[event.severity] || 0) > (severityRank[group.severity] || 0)) {
      Object.assign(group, { id: event.id, type: event.type, severity: event.severity,
        detail: event.detail, aiAnalysis: event.aiAnalysis, threatScore: event.threatScore });
    }
  }
  return groups.sort((a,b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0)
    || b.lastSeenMs - a.lastSeenMs);
}
