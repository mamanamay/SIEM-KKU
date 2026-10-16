import { endpointOrganization } from './alertStream';

/** Map activity belongs to the initiating endpoint; targets never substitute. */
export function sourceFacultyStats(events: any[], faculties: any[]) {
  const stats: Record<string, { count: number; events: any[] }> = {};
  for (const faculty of faculties) stats[faculty.code] = { count: 0, events: [] };
  for (const event of events) {
    const endpoint = event.networkContext?.source;
    if (endpoint?.scope !== 'organization') continue;
    const name = endpointOrganization(endpoint);
    const code = name.split(/[—–-]/)[0].trim().toUpperCase();
    const faculty = faculties.find(f => f.code.toUpperCase() === code || f.name === name);
    if (!faculty) continue;
    stats[faculty.code].count++;
    if (stats[faculty.code].events.length < 5) stats[faculty.code].events.push(event);
  }
  return stats;
}
