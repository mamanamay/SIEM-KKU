export class CorrelationEngine {
  static correlateByIp(events: any[], ip: string) {
    if (!events || !ip) return [];
    return events.filter(e => e.ip === ip || e.targetIp === ip);
  }

  static findAttackPatterns(events: any[]) {
    const patterns = new Set<string>();
    events.forEach(e => {
      if (e.type) patterns.add(e.type);
      if (e.detail && e.detail.toLowerCase().includes('sql')) patterns.add('SQL Injection');
      if (e.detail && e.detail.toLowerCase().includes('brute force')) patterns.add('Brute Force');
    });
    return Array.from(patterns);
  }

  static buildTimeline(events: any[]) {
    // Sort events by timestamp ascending
    const sorted = [...events].sort((a, b) => {
      const ta = a.timestampMs || new Date(a.createdAt).getTime();
      const tb = b.timestampMs || new Date(b.createdAt).getTime();
      return ta - tb;
    });

    // Take top 5 for timeline to avoid overwhelming
    return sorted.slice(0, 5).map(e => {
      const date = new Date(e.timestampMs || e.createdAt);
      const timeStr = date.toLocaleTimeString('th-TH');
      return {
        time: timeStr,
        event: `${e.type || 'Unknown Event'} (Severity: ${e.severity || 'Unknown'})`
      };
    });
  }

  static getTargets(events: any[]) {
     const targets = new Set<string>();
     events.forEach(e => {
         if (e.targetIp) targets.add(e.targetIp);
         // Simulate targets if missing for demo purposes, 
         // but strictly the user requested NO MOCK DATA. 
         // We will only use real targetIp if it exists.
     });
     return Array.from(targets);
  }
}