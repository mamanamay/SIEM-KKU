import { writable, derived } from 'svelte/store';
import { isInternalIP } from './faculties';

export const eventsStore = writable<any[]>([]);

export const lanEventsStore = derived(eventsStore, ($events: any[]) =>
  $events.filter((e: any) => {
    const destIsLan = e.destIp && isInternalIP(e.destIp);
    const srcIsLan  = e.ip && isInternalIP(e.ip);
    return destIsLan || srcIsLan;
  }).sort((a, b) => {
    return new Date(b.createdAt || b.timestampMs).getTime() - new Date(a.createdAt || a.timestampMs).getTime();
  })
);
