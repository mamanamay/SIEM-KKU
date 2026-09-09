export function buildAiContext(events: any[]) {
  if (events.length === 0) return { error: "No data" };
  
  // Deduplicate and aggregate
  const types: Record<string, number> = {};
  const ips: Record<string, number> = {};
  
  events.forEach(e => {
    const t = e.type || e.attackType || 'Unknown';
    const ip = e.ip || e.sourceIp || 'Unknown';
    types[t] = (types[t] || 0) + 1;
    ips[ip] = (ips[ip] || 0) + 1;
  });
  
  return {
    totalEvents: events.length,
    timeRange: "Last 24h", // dynamic in real app
    topTypes: Object.entries(types).sort((a,b)=>b[1]-a[1]).slice(0, 5),
    topIps: Object.entries(ips).sort((a,b)=>b[1]-a[1]).slice(0, 5)
  };
}
