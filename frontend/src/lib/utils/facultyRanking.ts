function hits(event: any): number {
  const value = Number(event.hitCount ?? 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function rankTargetFaculties(events: any[], lookup: (ip: string) => { name: string } | null, internal: (ip: string) => boolean) {
  const counts = new Map<string, number>();
  for (const event of events) {
    const targetIp = event.destIp || event.dst_ip;
    if (!targetIp || !internal(targetIp)) continue;
    const name = lookup(targetIp)?.name?.trim();
    if (!name || ['Unknown', '—', '-'].includes(name)) continue;
    counts.set(name, (counts.get(name) || 0) + hits(event));
  }
  return [...counts].map(([name, count]) => ({ code: name, name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 7);
}

export function unassignedTargetHits(events: any[], lookup: (ip: string) => { name: string } | null, internal: (ip: string) => boolean) {
  return events.reduce((count, event) => {
    const targetIp = event.destIp || event.dst_ip;
    return targetIp && internal(targetIp) && !lookup(targetIp) ? count + hits(event) : count;
  }, 0);
}
