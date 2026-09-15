<svelte:head>
  <title>SOC Monitor - KKUSIEM</title>
</svelte:head>

<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  import { onMount, onDestroy } from 'svelte';
  
  let activeMonitor = 1;
  let isFullscreen = false;
  let isPaused = false;
  
  let events: any[] = [];
  const unsub = eventsStore.subscribe(val => {
    if (!isPaused) {
      events = val;
    }
  });

  onDestroy(() => {
    unsub();
  });

  function toggleFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(err => console.error(err));
      isFullscreen = true;
    } else {
      document.exitFullscreen();
      isFullscreen = false;
    }
  }
  
  $: totalEvents = events.length;
  $: criticalEvents = events.filter(e => e.severity === 'critical');
  $: highEvents = events.filter(e => e.severity === 'high');
  $: criticalHighEvents = [...criticalEvents, ...highEvents].slice(0, 50);
  
  // Top IPs
  $: sourceIPs = events.reduce((acc, e) => {
    const ip = e.ip || e.sourceIp || 'Unknown';
    if (!acc[ip]) acc[ip] = { count: 0, severity: e.severity, type: e.type, events: [] };
    acc[ip].count++;
    acc[ip].events.push(e);
    if (e.severity === 'critical') acc[ip].severity = 'critical';
    return acc;
  }, {});
  $: topAttackers = Object.entries(sourceIPs).map(([ip, data]: any) => ({ ip, ...data })).sort((a,b) => b.count - a.count).slice(0, 10);
  
  // IP Pos Hash for map
  function getPosFromIP(ip: string) {
    if (!ip) return { x: 50, y: 50 };
    let hash = 0;
    for (let i = 0; i < ip.length; i++) hash = Math.imul(31, hash) + ip.charCodeAt(i) | 0;
    hash = Math.abs(hash);
    return {
      x: 10 + (hash % 80),
      y: 10 + ((hash >> 8) % 70)
    };
  }
  
  const worldPath = "M 8.5,81.1 C 8.5,81.1 7.2,80.7 7.2,80.7 C 7.2,80.7 7.2,80.6 7.2,80.6 C 7.2,80.6 7.2,79.5 7.2,79.5 C 7.2,79.5 7.1,79.5 7.1,79.5 C 7.1,79.5 6.7,79.5 6.7,79.5 C 6.7,79.5 6.7,79.3 6.7,79.3 C 6.7,79.3 6.9,79.1 6.9,79.1 C 6.9,79.1 7.4,79.1 7.4,79.1 C 7.4,79.1 7.7,78.8 7.7,78.8 C 7.7,78.8 8.0,78.8 8.0,78.8 C 8.0,78.8 8.0,78.6 8.0,78.6 C 8.0,78.6 7.8,78.5 7.8,78.5 C 7.8,78.5 7.8,78.1 7.8,78.1 C 7.8,78.1 8.2,78.0 8.2,78.0 C 8.2,78.0 8.3,77.7 8.3,77.7 C 8.3,77.7 8.3,77.3 8.3,77.3 C 8.3,77.3 7.8,76.5 7.8,76.5 C 7.8,76.5 7.8,76.2 7.8,76.2 C 7.8,76.2 8.3,75.9 8.3,75.9 C 8.3,75.9 9.1,75.9 9.1,75.9 C 9.1,75.9 9.4,75.6 9.4,75.6 C 9.4,75.6 9.4,75.3 9.4,75.3 C 9.4,75.3 9.1,75.1 9.1,75.1 C 9.1,75.1 8.8,75.1 8.8,75.1 C 8.8,75.1 8.3,74.7 8.3,74.7 C 8.3,74.7 8.3,74.3 8.3,74.3 C 8.3,74.3 8.8,73.8 8.8,73.8 C 8.8,73.8 9.5,73.4 9.5,73.4 C 9.5,73.4 9.8,73.4 9.8,73.4 C 9.8,73.4 9.8,73.0 9.8,73.0 C 9.8,73.0 10.1,72.9 10.1,72.9 C 10.1,72.9 10.4,72.7 10.4,72.7 C 10.4,72.7 10.4,72.4 10.4,72.4 C 10.4,72.4 10.7,72.1 10.7,72.1 C 10.7,72.1 11.2,72.1 11.2,72.1 C 11.2,72.1 11.2,71.8 11.2,71.8 C 11.2,71.8 11.2,71.5 11.2,71.5 C 11.2,71.5 10.9,71.5 10.9,71.5 C 10.9,71.5 10.7,71.3 10.7,71.3 C 10.7,71.3 10.7,70.9 10.7,70.9 C 10.7,70.9 10.9,70.6 10.9,70.6 C 10.9,70.6 11.3,70.3 11.3,70.3 C 11.3,70.3 11.3,70.0 11.3,70.0 C 11.3,70.0 11.2,70.0 11.2,70.0 C 11.2,70.0 10.4,69.5 10.4,69.5 C 10.4,69.5 9.7,69.4 9.7,69.4 C 9.7,69.4 9.4,69.2 9.4,69.2 C 9.4,69.2 9.1,68.9 9.1,68.9 C 9.1,68.9 9.1,68.6 9.1,68.6 C 9.1,68.6 8.8,68.6 8.8,68.6 C 8.8,68.6 8.5,68.3 8.5,68.3 C 8.5,68.3 8.5,68.0 8.5,68.0 C 8.5,68.0 8.8,67.8 8.8,67.8 C 8.8,67.8 9.5,67.8 9.5,67.8 C 9.5,67.8 10.2,68.1 10.2,68.1 C 10.2,68.1 10.7,68.3 10.7,68.3 C 10.7,68.3 11.0,68.3 11.0,68.3 C 11.0,68.3 11.2,68.1 11.2,68.1 C 11.2,68.1 11.2,67.8 11.2,67.8 C 11.2,67.8 11.3,67.7 11.3,67.7 C 11.3,67.7 11.9,67.7 11.9,67.7 C 11.9,67.7 12.3,67.7 12.3,67.7 C 12.3,67.7 12.6,67.4 12.6,67.4 C 12.6,67.4 12.8,67.4 12.8,67.4 C 12.8,67.4 13.0,67.4 13.0,67.4 C 13.0,67.4 13.3,67.2 13.3,67.2 C 13.3,67.2 13.5,67.2 13.5,67.2 C 13.5,67.2 13.6,67.4 13.6,67.4 C 13.6,67.4 14.2,67.7 14.2,67.7 C 14.2,67.7 14.4,67.7 14.4,67.7 C 14.4,67.7 14.8,67.4 14.8,67.4 C 14.8,67.4 14.9,67.4 14.9,67.4 C 14.9,67.4 15.3,67.2 15.3,67.2 C 15.3,67.2 15.6,67.2 15.6,67.2 C 15.6,67.2 15.8,67.4 15.8,67.4 C 15.8,67.4 15.9,67.4 15.9,67.4 C 15.9,67.4 16.3,67.4 16.3,67.4 C 16.3,67.4 16.5,67.7 16.5,67.7 C 16.5,67.7 16.6,67.8 16.6,67.8 C 16.6,67.8 17.1,68.0 17.1,68.0 C 17.1,68.0 17.4,68.1 17.4,68.1 C 17.4,68.1 17.6,68.3 17.6,68.3 C 17.6,68.3 17.9,68.3 17.9,68.3 C 17.9,68.3 18.2,68.3 18.2,68.3 C 18.2,68.3 18.3,68.1 18.3,68.1 C 18.3,68.1 18.6,68.0 18.6,68.0 C 18.6,68.0 18.9,67.8 18.9,67.8 C 18.9,67.8 19.1,67.8 19.1,67.8 C 19.1,67.8 19.4,67.7 19.4,67.7 C 19.4,67.7 19.6,67.7 19.6,67.7 C 19.6,67.7 19.9,67.4 19.9,67.4 C 19.9,67.4 20.3,67.4 20.3,67.4 C 20.3,67.4 20.6,67.2 20.6,67.2 C 20.6,67.2 20.9,67.2 20.9,67.2 C 20.9,67.2 21.0,66.9 21.0,66.9 C 21.0,66.9 21.3,66.8 21.3,66.8 C 21.3,66.8 21.6,66.6 21.6,66.6 C 21.6,66.6 21.8,66.6 21.8,66.6 C 21.8,66.6 22.0,66.4 22.0,66.4 C 22.0,66.4 22.3,66.4 22.3,66.4 C 22.3,66.4 22.5,66.1 22.5,66.1 C 22.5,66.1 22.7,66.1 22.7,66.1 C 22.7,66.1 23.0,65.9 23.0,65.9 C 23.0,65.9 23.3,65.9 23.3,65.9 C 23.3,65.9 23.4,65.6 23.4,65.6 C 23.4,65.6 23.7,65.4 23.7,65.4 C 23.7,65.4 24.1,65.2 24.1,65.2 C 24.1,65.2 24.3,65.1 24.3,65.1 C 24.3,65.1 24.5,64.8 24.5,64.8 C 24.5,64.8 24.8,64.6 24.8,64.6 C 24.8,64.6 25.1,64.6 25.1,64.6 C 25.1,64.6 25.2,64.3 25.2,64.3 C 25.2,64.3 25.6,64.3 25.6,64.3 C 25.6,64.3 25.8,64.1 25.8,64.1 C 25.8,64.1 26.1,64.1 26.1,64.1 C 26.1,64.1 26.2,63.9 26.2,63.9 C 26.2,63.9 26.5,63.9 26.5,63.9 C 26.5,63.9 26.7,63.7 26.7,63.7 C 26.7,63.7 26.9,63.5 26.9,63.5 C 26.9,63.5 27.2,63.5 27.2,63.5 C 27.2,63.5 27.4,63.2 27.4,63.2 C 27.4,63.2 27.8,63.2 27.8,63.2 C 27.8,63.2 28.0,63.0 28.0,63.0 C 28.0,63.0 28.3,63.0 28.3,63.0 C 28.3,63.0 28.5,62.8 28.5,62.8 C 28.5,62.8 28.8,62.6 28.8,62.6 C 28.8,62.6 28.9,62.6 28.9,62.6 C 28.9,62.6 29.1,62.3 29.1,62.3 C 29.1,62.3 29.5,62.1 29.5,62.1 C 29.5,62.1 29.7,62.1 29.7,62.1 C 29.7,62.1 30.0,61.9 30.0,61.9 C 30.0,61.9 30.2,61.9 30.2,61.9 C 30.2,61.9 30.5,61.7 30.5,61.7 C 30.5,61.7 30.7,61.5 30.7,61.5 C 30.7,61.5 31.0,61.3 31.0,61.3 C 31.0,61.3 31.2,61.3 31.2,61.3 C 31.2,61.3 31.5,61.0 31.5,61.0 C 31.5,61.0 31.7,61.0 31.7,61.0 C 31.7,61.0 31.9,60.8 31.9,60.8 C 31.9,60.8 32.1,60.8 32.1,60.8 C 32.1,60.8 32.5,60.6 32.5,60.6 C 32.5,60.6 32.7,60.6 32.7,60.6 C 32.7,60.6 33.0,60.3 33.0,60.3 C 33.0,60.3 33.2,60.1 33.2,60.1 C 33.2,60.1 33.4,60.1 33.4,60.1 C 33.4,60.1 33.6,59.9 33.6,59.9 C 33.6,59.9 34.0,59.9 34.0,59.9 C 34.0,59.9 34.2,59.7 34.2,59.7 C 34.2,59.7 34.5,59.5 34.5,59.5 C 34.5,59.5 34.7,59.5 34.7,59.5 C 34.7,59.5 35.0,59.3 35.0,59.3 C 35.0,59.3 35.1,59.1 35.1,59.1 C 35.1,59.1 35.4,59.1 35.4,59.1 C 35.4,59.1 35.7,58.8 35.7,58.8 C 35.7,58.8 35.9,58.8 35.9,58.8 C 35.9,58.8 36.1,58.6 36.1,58.6 C 36.1,58.6 36.4,58.6 36.4,58.6 C 36.4,58.6 36.6,58.4 36.6,58.4 C 36.6,58.4 36.8,58.4 36.8,58.4 C 36.8,58.4 37.1,58.2 37.1,58.2 C 37.1,58.2 37.4,58.2 37.4,58.2 C 37.4,58.2 37.6,58.0 37.6,58.0 C 37.6,58.0 37.8,58.0 37.8,58.0 C 37.8,58.0 38.0,57.7 38.0,57.7 C 38.0,57.7 38.4,57.7 38.4,57.7 C 38.4,57.7 38.6,57.5 38.6,57.5 C 38.6,57.5 38.9,57.5 38.9,57.5 C 38.9,57.5 39.0,57.3 39.0,57.3 C 39.0,57.3 39.3,57.3 39.3,57.3 C 39.3,57.3 39.5,57.1 39.5,57.1 C 39.5,57.1 39.8,57.1 39.8,57.1 C 39.8,57.1 40.0,56.8 40.0,56.8 C 40.0,56.8 40.2,56.8 40.2,56.8 C 40.2,56.8 40.5,56.6 40.5,56.6 C 40.5,56.6 40.8,56.6 40.8,56.6 C 40.8,56.6 40.9,56.4 40.9,56.4 C 40.9,56.4 41.2,56.4 41.2,56.4 C 41.2,56.4 41.4,56.2 41.4,56.2 C 41.4,56.2 41.7,56.2 41.7,56.2 C 41.7,56.2 41.9,56.0 41.9,56.0 C 41.9,56.0 42.1,56.0 42.1,56.0 C 42.1,56.0 42.4,55.8 42.4,55.8 C 42.4,55.8 42.6,55.8 42.6,55.8 C 42.6,55.8 42.9,55.5 42.9,55.5 C 42.9,55.5 43.1,55.5 43.1,55.5 C 43.1,55.5 43.4,55.3 43.4,55.3 C 43.4,55.3 43.5,55.3 43.5,55.3 C 43.5,55.3 43.8,55.1 43.8,55.1 C 43.8,55.1 44.1,55.1 44.1,55.1 C 44.1,55.1 44.3,54.9 44.3,54.9 C 44.3,54.9 44.5,54.9 44.5,54.9 C 44.5,54.9 44.8,54.7 44.8,54.7 C 44.8,54.7 45.0,54.7 45.0,54.7 C 45.0,54.7 45.2,54.4 45.2,54.4 C 45.2,54.4 45.4,54.4 45.4,54.4 C 45.4,54.4 45.7,54.2 45.7,54.2 C 45.7,54.2 46.0,54.2 46.0,54.2 C 46.0,54.2 46.1,54.0 46.1,54.0 C 46.1,54.0 46.3,54.0 46.3,54.0 C 46.3,54.0 46.6,53.8 46.6,53.8 C 46.6,53.8 46.8,53.8 46.8,53.8 C 46.8,53.8 47.1,53.6 47.1,53.6 C 47.1,53.6 47.3,53.6 47.3,53.6 C 47.3,53.6 47.5,53.3 47.5,53.3 C 47.5,53.3 47.8,53.3 47.8,53.3 C 47.8,53.3 48.0,53.1 48.0,53.1 C 48.0,53.1 48.2,53.1 48.2,53.1 C 48.2,53.1 48.5,52.9 48.5,52.9 C 48.5,52.9 48.7,52.9 48.7,52.9 C 48.7,52.9 49.0,52.7 49.0,52.7 C 49.0,52.7 49.1,52.7 49.1,52.7 C 49.1,52.7 49.4,52.5 49.4,52.5 C 49.4,52.5 49.6,52.5 49.6,52.5 C 49.6,52.5 49.9,52.2 49.9,52.2 C 49.9,52.2 50.1,52.2 50.1,52.2 C 50.1,52.2 50.3,52.0 50.3,52.0 C 50.3,52.0 50.6,52.0 50.6,52.0 C 50.6,52.0 50.8,51.8 50.8,51.8 C 50.8,51.8 51.0,51.8 51.0,51.8 C 51.0,51.8 51.3,51.6 51.3,51.6 C 51.3,51.6 51.5,51.6 51.5,51.6 C 51.5,51.6 51.8,51.4 51.8,51.4 C 51.8,51.4 51.9,51.4 51.9,51.4 C 51.9,51.4 52.2,51.1 52.2,51.1 C 52.2,51.1 52.4,51.1 52.4,51.1 C 52.4,51.1 52.6,50.9 52.6,50.9 C 52.6,50.9 52.9,50.9 52.9,50.9 C 52.9,50.9 53.1,50.7 53.1,50.7 C 53.1,50.7 53.4,50.7 53.4,50.7 C 53.4,50.7 53.6,50.5 53.6,50.5 C 53.6,50.5 53.8,50.5 53.8,50.5 C 53.8,50.5 54.1,50.3 54.1,50.3 C 54.1,50.3 54.3,50.3 54.3,50.3 C 54.3,50.3 54.5,50.0 54.5,50.0 C 54.5,50.0 54.8,50.0 54.8,50.0 C 54.8,50.0 55.0,49.8 55.0,49.8 C 55.0,49.8 55.2,49.8 55.2,49.8 C 55.2,49.8 55.5,49.6 55.5,49.6 C 55.5,49.6 55.7,49.6 55.7,49.6 C 55.7,49.6 56.0,49.4 56.0,49.4 C 56.0,49.4 56.1,49.4 56.1,49.4 C 56.1,49.4 56.4,49.2 56.4,49.2 C 56.4,49.2 56.6,49.2 56.6,49.2 C 56.6,49.2 56.8,48.9 56.8,48.9 C 56.8,48.9 57.1,48.9 57.1,48.9 C 57.1,48.9 57.3,48.7 57.3,48.7 C 57.3,48.7 57.5,48.7 57.5,48.7 C 57.5,48.7 57.8,48.5 57.8,48.5 C 57.8,48.5 58.0,48.5 58.0,48.5 C 58.0,48.5 58.3,48.3 58.3,48.3 C 58.3,48.3 58.5,48.3 58.5,48.3 C 58.5,48.3 58.7,48.0 58.7,48.0 C 58.7,48.0 59.0,48.0 59.0,48.0 C 59.0,48.0 59.2,47.8 59.2,47.8 C 59.2,47.8 59.4,47.8 59.4,47.8 C 59.4,47.8 59.7,47.6 59.7,47.6 C 59.7,47.6 59.9,47.6 59.9,47.6 C 59.9,47.6 60.1,47.4 60.1,47.4 C 60.1,47.4 60.4,47.4 60.4,47.4 C 60.4,47.4 60.6,47.2 60.6,47.2 C 60.6,47.2 60.8,47.2 60.8,47.2 C 60.8,47.2 61.1,46.9 61.1,46.9 C 61.1,46.9 61.3,46.9 61.3,46.9 C 61.3,46.9 61.5,46.7 61.5,46.7 C 61.5,46.7 61.8,46.7 61.8,46.7 C 61.8,46.7 62.0,46.5 62.0,46.5 C 62.0,46.5 62.2,46.5 62.2,46.5 C 62.2,46.5 62.5,46.3 62.5,46.3 C 62.5,46.3 62.7,46.3 62.7,46.3 C 62.7,46.3 63.0,46.1 63.0,46.1 C 63.0,46.1 63.1,46.1 63.1,46.1 C 63.1,46.1 63.4,45.8 63.4,45.8 C 63.4,45.8 63.6,45.8 63.6,45.8 C 63.6,45.8 63.8,45.6 63.8,45.6 C 63.8,45.6 64.1,45.6 64.1,45.6 C 64.1,45.6 64.3,45.4 64.3,45.4 C 64.3,45.4 64.5,45.4 64.5,45.4 C 64.5,45.4 64.8,45.2 64.8,45.2 C 64.8,45.2 65.0,45.2 65.0,45.2 C 65.0,45.2 65.3,45.0 65.3,45.0 C 65.3,45.0 65.4,45.0 65.4,45.0 C 65.4,45.0 65.7,44.7 65.7,44.7 C 65.7,44.7 65.9,44.7 65.9,44.7 C 65.9,44.7 66.1,44.5 66.1,44.5 C 66.1,44.5 66.4,44.5 66.4,44.5 C 66.4,44.5 66.6,44.3 66.6,44.3 C 66.6,44.3 66.8,44.3 66.8,44.3 C 66.8,44.3 67.1,44.1 67.1,44.1 C 67.1,44.1 67.3,44.1 67.3,44.1 C 67.3,44.1 67.5,43.9 67.5,43.9 C 67.5,43.9 67.8,43.9 67.8,43.9 C 67.8,43.9 68.0,43.6 68.0,43.6 C 68.0,43.6 68.2,43.6 68.2,43.6 C 68.2,43.6 68.5,43.4 68.5,43.4 C 68.5,43.4 68.7,43.4 68.7,43.4 C 68.7,43.4 68.9,43.2 68.9,43.2 C 68.9,43.2 69.2,43.2 69.2,43.2 C 69.2,43.2 69.4,43.0 69.4,43.0 C 69.4,43.0 69.6,43.0 69.6,43.0 C 69.6,43.0 69.9,42.8 69.9,42.8 C 69.9,42.8 70.1,42.8 70.1,42.8 C 70.1,42.8 70.3,42.5 70.3,42.5 C 70.3,42.5 70.6,42.5 70.6,42.5 C 70.6,42.5 70.8,42.3 70.8,42.3 C 70.8,42.3 71.0,42.3 71.0,42.3 C 71.0,42.3 71.3,42.1 71.3,42.1 C 71.3,42.1 71.5,42.1 71.5,42.1 C 71.5,42.1 71.7,41.9 71.7,41.9 C 71.7,41.9 72.0,41.9 72.0,41.9 C 72.0,41.9 72.2,41.7 72.2,41.7 C 72.2,41.7 72.4,41.7 72.4,41.7 C 72.4,41.7 72.7,41.4 72.7,41.4 C 72.7,41.4 72.9,41.4 72.9,41.4 C 72.9,41.4 73.1,41.2 73.1,41.2 C 73.1,41.2 73.4,41.2 73.4,41.2 C 73.4,41.2 73.6,41.0 73.6,41.0 C 73.6,41.0 73.8,41.0 73.8,41.0 C 73.8,41.0 74.1,40.8 74.1,40.8 C 74.1,40.8 74.3,40.8 74.3,40.8 C 74.3,40.8 74.5,40.5 74.5,40.5 C 74.5,40.5 74.8,40.5 74.8,40.5 C 74.8,40.5 75.0,40.3 75.0,40.3 C 75.0,40.3 75.2,40.3 75.2,40.3 C 75.2,40.3 75.5,40.1 75.5,40.1 C 75.5,40.1 75.7,40.1 75.7,40.1 C 75.7,40.1 76.0,39.9 76.0,39.9 C 76.0,39.9 76.2,39.9 76.2,39.9 C 76.2,39.9 76.4,39.7 76.4,39.7 C 76.4,39.7 76.7,39.7 76.7,39.7 C 76.7,39.7 76.9,39.4 76.9,39.4 C 76.9,39.4 77.1,39.4 77.1,39.4 C 77.1,39.4 77.4,39.2 77.4,39.2 C 77.4,39.2 77.6,39.2 77.6,39.2 C 77.6,39.2 77.8,39.0 77.8,39.0 C 77.8,39.0 78.1,39.0 78.1,39.0 C 78.1,39.0 78.3,38.8 78.3,38.8 C 78.3,38.8 78.5,38.8 78.5,38.8 C 78.5,38.8 78.8,38.6 78.8,38.6 C 78.8,38.6 79.0,38.6 79.0,38.6 C 79.0,38.6 79.2,38.3 79.2,38.3 C 79.2,38.3 79.5,38.3 79.5,38.3 C 79.5,38.3 79.7,38.1 79.7,38.1 C 79.7,38.1 79.9,38.1 79.9,38.1 C 79.9,38.1 80.2,37.9 80.2,37.9 C 80.2,37.9 80.4,37.9 80.4,37.9 C 80.4,37.9 80.6,37.7 80.6,37.7 C 80.6,37.7 80.9,37.7 80.9,37.7 C 80.9,37.7 81.1,37.4 81.1,37.4 C 81.1,37.4 81.3,37.4 81.3,37.4 C 81.3,37.4 81.6,37.2 81.6,37.2 C 81.6,37.2 81.8,37.2 81.8,37.2 C 81.8,37.2 82.0,37.0 82.0,37.0 C 82.0,37.0 82.3,37.0 82.3,37.0 C 82.3,37.0 82.5,36.8 82.5,36.8 C 82.5,36.8 82.7,36.8 82.7,36.8 C 82.7,36.8 83.0,36.6 83.0,36.6 C 83.0,36.6 83.2,36.6 83.2,36.6 C 83.2,36.6 83.4,36.3 83.4,36.3 C 83.4,36.3 83.7,36.3 83.7,36.3 C 83.7,36.3 83.9,36.1 83.9,36.1 C 83.9,36.1 84.1,36.1 84.1,36.1 C 84.1,36.1 84.4,35.9 84.4,35.9 C 84.4,35.9 84.6,35.9 84.6,35.9 C 84.6,35.9 84.8,35.7 84.8,35.7 C 84.8,35.7 85.1,35.7 85.1,35.7 C 85.1,35.7 85.3,35.5 85.3,35.5 C 85.3,35.5 85.5,35.5 85.5,35.5 C 85.5,35.5 85.8,35.2 85.8,35.2 C 85.8,35.2 86.0,35.2 86.0,35.2 C 86.0,35.2 86.2,35.0 86.2,35.0 C 86.2,35.0 86.5,35.0 86.5,35.0 C 86.5,35.0 86.7,34.8 86.7,34.8 C 86.7,34.8 86.9,34.8 86.9,34.8 C 86.9,34.8 87.2,34.6 87.2,34.6 C 87.2,34.6 87.4,34.6 87.4,34.6 C 87.4,34.6 87.6,34.4 87.6,34.4 C 87.6,34.4 87.9,34.4 87.9,34.4 C 87.9,34.4 88.1,34.1 88.1,34.1 C 88.1,34.1 88.3,34.1 88.3,34.1 C 88.3,34.1 88.6,33.9 88.6,33.9 C 88.6,33.9 88.8,33.9 88.8,33.9 C 88.8,33.9 89.0,33.7 89.0,33.7 C 89.0,33.7 89.3,33.7 89.3,33.7 C 89.3,33.7 89.5,33.5 89.5,33.5 C 89.5,33.5 89.7,33.5 89.7,33.5 C 89.7,33.5 90.0,33.3 90.0,33.3 C 90.0,33.3 90.2,33.3 90.2,33.3 C 90.2,33.3 90.4,33.0 90.4,33.0 C 90.4,33.0 90.7,33.0 90.7,33.0 C 90.7,33.0 90.9,32.8 90.9,32.8 C 90.9,32.8 91.1,32.8 91.1,32.8 C 91.1,32.8 91.4,32.6 91.4,32.6 C 91.4,32.6 91.6,32.6 91.6,32.6 C 91.6,32.6 91.8,32.4 91.8,32.4 C 91.8,32.4 92.1,32.4 92.1,32.4 C 92.1,32.4 92.3,32.2 92.3,32.2 C 92.3,32.2 92.5,32.2 92.5,32.2 C 92.5,32.2 92.7,31.9 92.7,31.9 C 92.7,31.9 93.0,31.9 93.0,31.9 C 93.0,31.9 93.2,31.7 93.2,31.7 C 93.2,31.7 93.4,31.7 93.4,31.7 C 93.4,31.7 93.7,31.5 93.7,31.5 C 93.7,31.5 93.9,31.5 93.9,31.5 C 93.9,31.5 94.1,31.3 94.1,31.3 C 94.1,31.3 94.4,31.3 94.4,31.3 C 94.4,31.3 94.6,31.1 94.6,31.1 C 94.6,31.1 94.8,31.1 94.8,31.1 C 94.8,31.1 95.1,30.8 95.1,30.8 C 95.1,30.8 95.3,30.8 95.3,30.8 C 95.3,30.8 95.5,30.6 95.5,30.6 C 95.5,30.6 95.8,30.6 95.8,30.6 C 95.8,30.6 96.0,30.4 96.0,30.4 C 96.0,30.4 96.2,30.4 96.2,30.4 C 96.2,30.4 96.5,30.2 96.5,30.2 C 96.5,30.2 96.7,30.2 96.7,30.2 C 96.7,30.2 96.9,30.0 96.9,30.0 C 96.9,30.0 97.2,30.0 97.2,30.0 C 97.2,30.0 97.4,29.7 97.4,29.7 C 97.4,29.7 97.6,29.7 97.6,29.7 C 97.6,29.7 97.9,29.5 97.9,29.5 C 97.9,29.5 98.1,29.5 98.1,29.5 C 98.1,29.5 98.3,29.3 98.3,29.3 C 98.3,29.3 98.6,29.3 98.6,29.3 C 98.6,29.3 98.8,29.1 98.8,29.1 C 98.8,29.1 99.0,29.1 99.0,29.1 C 99.0,29.1 99.3,28.9 99.3,28.9 C 99.3,28.9 99.5,28.9 99.5,28.9 C 99.5,28.9 99.7,28.6 99.7,28.6 C 99.7,28.6 100.0,28.6 100.0,28.6 C 100.0,28.6 100.0,28.6 100.0,28.6 L 8.5,81.1 Z";

</script>

<div class="soc-container {isFullscreen ? 'fullscreen' : ''}">
  <!-- Scanlines Overlay -->
  <div class="scanlines"></div>
  
  <div class="soc-topbar">
    <div class="soc-title">
      <h1><i class="ti ti-radar" style="color:#10b981; margin-right:8px;"></i>SOC Operations Center</h1>
      <div class="status-indicator">
        <span class="pulse-dot {isPaused ? 'paused' : ''}"></span>
        <span>{isPaused ? 'PAUSED' : 'LIVE'} <span class="dim">| {totalEvents} EVENTS PROCESSED</span></span>
      </div>
    </div>
    
    <!-- Mini EPS Chart Placeholder -->
    <div class="eps-chart">
       <span class="eps-label">EPS</span>
       <div class="eps-bars">
         {#each Array(10) as _, i}
           <div class="eps-bar" style="height: {Math.random() * 80 + 20}%;"></div>
         {/each}
       </div>
       <span class="eps-val">{Math.floor(Math.random() * 50 + 10)}/s</span>
    </div>

    <div class="soc-tabs">
      <button class:active={activeMonitor === 1} on:click={() => activeMonitor = 1}>Security Incident</button>
      <button class:active={activeMonitor === 2} on:click={() => activeMonitor = 2}>Global Attack</button>
      <button class:active={activeMonitor === 3} on:click={() => activeMonitor = 3}>Internal Threat</button>
    </div>
    <div class="soc-controls">
      <button on:click={() => isPaused = !isPaused} class="icon-btn" title="Pause/Play Live Feed">
        <i class="ti {isPaused ? 'ti-player-play' : 'ti-player-pause'}"></i>
      </button>
      <button on:click={toggleFullscreen} class="icon-btn" title="Fullscreen Wallboard">
        <i class="ti {isFullscreen ? 'ti-arrows-minimize' : 'ti-arrows-maximize'}"></i>
      </button>
    </div>
  </div>

  <div class="soc-content custom-scrollbar">
    {#if activeMonitor === 1}
      <div class="monitor-grid m1">
        <div class="summary-cards">
          <div class="kpi-card cyber">
            <span class="kpi-label">Active Alerts</span>
            <span class="kpi-val">{criticalHighEvents.length}</span>
            <div class="kpi-spark"><div class="spark-line w-75"></div></div>
          </div>
          <div class="kpi-card cyber critical">
            <span class="kpi-label">Critical Incidents</span>
            <span class="kpi-val">{criticalEvents.length}</span>
            <div class="kpi-spark"><div class="spark-line w-40"></div></div>
          </div>
          <div class="kpi-card cyber high">
            <span class="kpi-label">High Priority</span>
            <span class="kpi-val">{highEvents.length}</span>
            <div class="kpi-spark"><div class="spark-line w-60"></div></div>
          </div>
          <div class="kpi-card cyber">
            <span class="kpi-label">Attacker IPs</span>
            <span class="kpi-val">{topAttackers.length}</span>
            <div class="kpi-spark"><div class="spark-line w-90"></div></div>
          </div>
        </div>

        <div class="main-panels">
          <div class="panel cyber-panel critical-panel">
            <div class="panel-header"><i class="ti ti-alert-triangle"></i> CRITICAL INCIDENT PANEL</div>
            <div class="panel-body custom-scrollbar">
              {#each criticalHighEvents as event}
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <div class="critical-item severity-{event.severity}" on:click={() => window.location.href = '/dashboard/soar?ip=' + event.ip + '&time=' + (event.time || event.createdAt)}>
                  <div class="ci-head">
                    <span class="ci-sev">{event.severity.toUpperCase()}</span>
                    <span class="ci-time">{new Date(event.time || event.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <div class="ci-type">{event.type}</div>
                  <div class="ci-detail">Source: {event.ip || event.sourceIp}</div>
                  <div class="ci-action">INVESTIGATE ></div>
                </div>
              {/each}
              {#if criticalHighEvents.length === 0}
                <div class="empty-state terminal-text">> No critical incidents detected. Monitoring...</div>
              {/if}
            </div>
          </div>

          <div class="panel cyber-panel terminal-panel">
            <div class="panel-header"><i class="ti ti-terminal"></i> RAW LOG STREAM</div>
            <div class="panel-body custom-scrollbar terminal-feed">
              {#each events.slice(0, 50) as event}
                <div class="term-line {event.severity}">
                   <span class="t-time">[{new Date(event.time || event.createdAt).toISOString()}]</span>
                   <span class="t-ip">{event.ip || event.sourceIp}</span>
                   <span class="t-type">{event.type.replace(/ /g, '_').toUpperCase()}</span>
                   <span class="t-msg">{JSON.stringify(event.payload || {}).substring(0,60)}...</span>
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>

    {:else if activeMonitor === 2}
      <div class="monitor-grid m2">
        <div class="map-panel cyber-panel">
          <div class="panel-header"><i class="ti ti-world"></i> GLOBAL ATTACK RADAR</div>
          <div class="map-wrapper">
            <!-- Grid Lines -->
            <div class="grid-overlay"></div>
            
            <svg viewBox="0 0 100 100" class="world-map">
              <path d={worldPath} fill="var(--map-fill)" stroke="var(--map-stroke)" stroke-width="0.3" class="map-path" />
            </svg>
            
            <!-- Radar Target (Internal Network) -->
            <div class="map-target" style="left: 50%; top: 50%;">
              <div class="radar-sweep"></div>
              <div class="target-dot pulse-glow"></div>
              <div class="target-label">HQ</div>
            </div>

            <!-- Attackers -->
            {#each topAttackers as attacker}
              {@const pos = getPosFromIP(attacker.ip)}
              {@const controlX = (50 - pos.x) / 2}
              {@const controlY = (50 - pos.y) / 2 - 20}
              <div class="map-node" style="left: {pos.x}%; top: {pos.y}%;">
                <div class="node-dot severity-{attacker.severity} pulse"></div>
                <div class="node-tooltip">
                  {attacker.ip}<br/>{attacker.count} Events
                </div>
                <!-- Attack Curve -->
                <svg class="attack-line" style="position: absolute; top:0; left:0; width: 100vw; height: 100vh; pointer-events:none; z-index:-1; overflow:visible;">
                   <!-- Use Quadratic Bezier Curve Q for curved arc -->
                   <path d="M 0 0 Q {controlX}vw {controlY}vh {50 - pos.x}vw {50 - pos.y}vh" 
                         stroke="var(--color-{attacker.severity})" 
                         stroke-width="1.5" 
                         fill="none"
                         class="anim-arc" />
                </svg>
              </div>
            {/each}
          </div>
        </div>
        <div class="side-panel cyber-panel custom-scrollbar">
          <div class="panel-header"><i class="ti ti-target"></i> THREAT ACTORS</div>
          <div class="attacker-list">
            {#each topAttackers as attacker}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <div class="attacker-item" on:click={() => window.location.href = '/dashboard/explorer?q=' + attacker.ip}>
                <div class="ai-ip">{attacker.ip}</div>
                <div class="ai-stats">
                  <span class="ai-count">{attacker.count} EVT</span>
                  <span class="badge {attacker.severity}">{attacker.severity.substring(0,4)}</span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>

    {:else if activeMonitor === 3}
      <div class="monitor-grid m3">
        <div class="network-panel cyber-panel">
          <div class="panel-header"><i class="ti ti-sitemap"></i> LATERAL THREAT TOPOLOGY</div>
          <div class="network-wrapper cyber-grid">
             <div class="net-node internet glowing">EXTERNAL</div>
             <div class="net-edge vertical glowing"></div>
             <div class="net-node firewall">WAF / FIREWALL</div>
             <div class="net-edge vertical"></div>
             <div class="net-layer">
                <div class="net-node dmz">
                  <i class="ti ti-server"></i> Web Tier<br/><small>10.0.1.0/24</small>
                </div>
                <div class="net-node internal">
                  <i class="ti ti-box"></i> App Tier<br/><small>10.0.2.0/24</small>
                </div>
                <div class="net-node db">
                  <i class="ti ti-database"></i> DB Tier<br/><small>10.0.3.0/24</small>
                </div>
             </div>
             
             {#if events.length > 0}
               <div class="suspicious-overlay">
                 <div class="alert-box cyber-alert">
                   <div class="ab-icon"><i class="ti ti-radar"></i></div>
                   <div class="ab-content">
                     <div class="ab-title">ANOMALY DETECTED</div>
                     <div class="ab-tactic">MITRE: Initial Access (T1190)</div>
                   </div>
                 </div>
               </div>
             {/if}
          </div>
        </div>
        <div class="side-panel cyber-panel custom-scrollbar">
          <div class="panel-header"><i class="ti ti-shield-lock"></i> MITRE ATT&CK</div>
          <div class="lateral-list p-3">
             {#if events.length > 0}
               <div class="mitre-tactic detected">
                 <span class="m-code">TA0001</span> Initial Access
                 <div class="m-bar"><div class="fill" style="width:80%"></div></div>
               </div>
               <div class="mitre-tactic detected">
                 <span class="m-code">TA0002</span> Execution
                 <div class="m-bar"><div class="fill" style="width:40%"></div></div>
               </div>
               <div class="mitre-tactic">
                 <span class="m-code">TA0008</span> Lateral Movement
                 <div class="m-bar"><div class="fill" style="width:0%"></div></div>
               </div>
               <div class="mitre-tactic">
                 <span class="m-code">TA0010</span> Exfiltration
                 <div class="m-bar"><div class="fill" style="width:0%"></div></div>
               </div>
             {:else}
               <div class="empty-state terminal-text">> Awaiting network telemetry...</div>
             {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* =========================================================
     PURE DARK CYBERPUNK THEME (Overrides all global themes)
     ========================================================= */
  .soc-container {
    --bg-base: #050505;
    --bg-panel: #0a0a0c;
    --bg-header: #111116;
    --border-dim: #1a1a24;
    --border-glow: #2a2a35;
    
    --text-main: #e2e8f0;
    --text-dim: #64748b;
    --text-term: #34d399; /* Terminal green */
    
    --color-critical: #ff2a2a;
    --color-high: #ff8c00;
    --color-medium: #eab308;
    --color-low: #22c55e;
    --color-info: #0ea5e9;
    
    --map-fill: #111115;
    --map-stroke: #1e293b;
    
    display: flex;
    flex-direction: column;
    height: calc(100vh - 80px);
    background: var(--bg-base);
    color: var(--text-main);
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    font-family: 'Inter', -apple-system, sans-serif;
  }
  
  /* PURE DARK FORCE OVERRIDE for Light Mode */
  :global(body[data-theme="light"]) .soc-container {
    --bg-primary: #050505 !important;
    background: #050505 !important;
  }

  .soc-container.fullscreen {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    height: 100vh;
    z-index: 9999;
    border-radius: 0;
  }

  /* Scanlines Effect */
  .scanlines {
    position: absolute;
    top: 0; left: 0; width: 100%; height: 100%;
    background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.2));
    background-size: 100% 4px;
    pointer-events: none;
    z-index: 999;
    opacity: 0.3;
  }

  /* Top Bar */
  .soc-topbar {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 24px; background: var(--bg-header);
    border-bottom: 1px solid var(--border-dim);
    z-index: 10;
  }
  .soc-title h1 { margin: 0; font-size: 16px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #fff; }
  
  .status-indicator { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; color: var(--color-low); margin-top: 4px; }
  .pulse-dot { width: 6px; height: 6px; background: var(--color-low); border-radius: 50%; box-shadow: 0 0 8px var(--color-low); animation: pulse-dot 1.5s infinite; }
  .pulse-dot.paused { background: var(--color-medium); box-shadow: 0 0 8px var(--color-medium); animation: none; }
  .status-indicator:has(.paused) { color: var(--color-medium); }
  .dim { color: var(--text-dim); }

  @keyframes pulse-dot { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }

  /* EPS Sparkline */
  .eps-chart { display: flex; align-items: center; gap: 10px; background: rgba(0,0,0,0.3); padding: 4px 12px; border-radius: 4px; border: 1px solid var(--border-dim); }
  .eps-label { font-size: 10px; font-weight: 800; color: var(--color-info); }
  .eps-bars { display: flex; align-items: flex-end; gap: 2px; height: 20px; width: 40px; }
  .eps-bar { width: 3px; background: var(--color-info); opacity: 0.8; }
  .eps-val { font-family: monospace; font-size: 12px; color: #fff; width: 35px; text-align: right; }

  /* Tabs */
  .soc-tabs { display: flex; gap: 4px; background: #000; padding: 4px; border-radius: 6px; border: 1px solid var(--border-dim); }
  .soc-tabs button {
    background: transparent; border: none; color: var(--text-dim);
    padding: 6px 16px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
    border-radius: 4px; cursor: pointer; transition: 0.2s;
  }
  .soc-tabs button.active { background: rgba(14, 165, 233, 0.15); color: var(--color-info); border: 1px solid rgba(14, 165, 233, 0.3); box-shadow: inset 0 0 10px rgba(14, 165, 233, 0.1); }
  .soc-tabs button:hover:not(.active) { color: #fff; }

  .soc-controls { display: flex; gap: 8px; }
  .icon-btn { background: #000; border: 1px solid var(--border-dim); color: var(--text-main); width: 32px; height: 32px; border-radius: 4px; cursor: pointer; transition: 0.2s; }
  .icon-btn:hover { background: var(--border-dim); color: #fff; }

  /* Content Area */
  .soc-content { flex: 1; padding: 16px; position: relative; z-index: 10; overflow-y: auto; }
  .monitor-grid { display: flex; flex-direction: column; gap: 16px; height: 100%; }
  .m2, .m3 { flex-direction: row; }

  /* Cyber Panels */
  .cyber-panel {
    background: var(--bg-panel);
    border: 1px solid var(--border-dim);
    border-radius: 4px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .panel-header {
    background: rgba(0,0,0,0.4); border-bottom: 1px solid var(--border-dim);
    padding: 10px 16px; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: var(--text-dim);
    display: flex; align-items: center; gap: 8px;
  }
  .panel-body { flex: 1; overflow-y: auto; padding: 12px; }

  /* KPI Cards */
  .summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .kpi-card {
    background: var(--bg-panel); border: 1px solid var(--border-dim); padding: 16px; border-radius: 4px;
    border-top: 2px solid var(--color-info); position: relative; overflow: hidden;
  }
  .kpi-card.critical { border-top-color: var(--color-critical); }
  .kpi-card.high { border-top-color: var(--color-high); }
  .kpi-label { font-size: 11px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; }
  .kpi-val { font-size: 36px; font-weight: 900; margin-top: 8px; color: #fff; text-shadow: 0 0 15px rgba(255,255,255,0.2); display: block; }
  .kpi-spark { height: 2px; background: rgba(255,255,255,0.1); margin-top: 12px; width: 100%; }
  .spark-line { height: 100%; background: var(--color-info); box-shadow: 0 0 8px var(--color-info); }
  .kpi-card.critical .spark-line { background: var(--color-critical); box-shadow: 0 0 8px var(--color-critical); }
  .kpi-card.high .spark-line { background: var(--color-high); box-shadow: 0 0 8px var(--color-high); }
  .w-75 { width: 75%; } .w-40 { width: 40%; } .w-60 { width: 60%; } .w-90 { width: 90%; }

  /* Critical Items */
  .main-panels { display: flex; gap: 16px; flex: 1; min-height: 400px; }
  .critical-panel { flex: 1; }
  .terminal-panel { flex: 2; border-left: 2px solid var(--border-dim); }

  .critical-item {
    background: rgba(255, 42, 42, 0.05); border: 1px solid rgba(255, 42, 42, 0.2);
    padding: 12px; border-radius: 4px; margin-bottom: 8px; cursor: pointer; transition: 0.2s; position: relative;
  }
  .critical-item:hover { background: rgba(255, 42, 42, 0.1); border-color: var(--color-critical); box-shadow: 0 0 15px rgba(255,42,42,0.2); }
  .critical-item.severity-high { background: rgba(255, 140, 0, 0.05); border-color: rgba(255, 140, 0, 0.2); }
  .critical-item.severity-high:hover { border-color: var(--color-high); box-shadow: 0 0 15px rgba(255,140,0,0.2); }
  
  .ci-head { display: flex; justify-content: space-between; margin-bottom: 6px; }
  .ci-sev { font-size: 10px; font-weight: 800; color: #000; background: var(--color-critical); padding: 2px 6px; border-radius: 2px; letter-spacing: 1px;}
  .critical-item.severity-high .ci-sev { background: var(--color-high); }
  .ci-time { font-family: monospace; font-size: 11px; color: var(--text-dim); }
  .ci-type { font-weight: 700; font-size: 13px; color: #fff; margin-bottom: 4px; text-shadow: 0 0 5px rgba(255,255,255,0.3); }
  .ci-detail { font-family: monospace; font-size: 11px; color: var(--text-dim); }
  .ci-action { position: absolute; bottom: 12px; right: 12px; font-size: 10px; font-weight: 800; color: var(--color-critical); opacity: 0; transition: 0.2s; }
  .critical-item:hover .ci-action { opacity: 1; }
  .critical-item.severity-high .ci-action { color: var(--color-high); }

  /* Terminal Feed */
  .terminal-feed { background: #000; padding: 16px; font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.5; }
  .term-line { display: flex; gap: 12px; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px; }
  .t-time { color: var(--text-dim); width: 170px; flex-shrink: 0; }
  .t-ip { color: var(--color-info); width: 120px; flex-shrink: 0; font-weight: 700; }
  .t-type { color: #fff; width: 150px; flex-shrink: 0; }
  .t-msg { color: var(--text-term); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.8; }
  
  .term-line.critical .t-ip { color: var(--color-critical); }
  .term-line.critical .t-type { color: var(--color-critical); font-weight: 900; }
  .term-line.high .t-ip { color: var(--color-high); }

  /* Map Panel */
  .map-panel, .network-panel { flex: 3; position: relative; }
  .side-panel { flex: 1; min-width: 300px; }
  
  .map-wrapper {
    flex: 1; position: relative; background: #000; overflow: hidden;
  }
  /* Grid Overlay for Radar Feel */
  .grid-overlay {
    position: absolute; top:0; left:0; width:100%; height:100%;
    background-image: 
      linear-gradient(rgba(14, 165, 233, 0.1) 1px, transparent 1px),
      linear-gradient(90deg, rgba(14, 165, 233, 0.1) 1px, transparent 1px);
    background-size: 40px 40px;
    z-index: 1;
  }
  
  .world-map { width: 100%; height: 100%; opacity: 0.6; position: relative; z-index: 2; margin-top: -5%; filter: drop-shadow(0 0 10px rgba(14,165,233,0.3)); }
  .map-path { stroke-dasharray: 2 2; }
  
  .map-target { position: absolute; transform: translate(-50%, -50%); z-index: 10; text-align: center; }
  .target-dot { width: 10px; height: 10px; background: #fff; border-radius: 50%; box-shadow: 0 0 20px 5px var(--color-info); margin: 0 auto; position: relative; z-index: 11;}
  .target-label { font-size: 10px; font-weight: 800; margin-top: 6px; color: var(--color-info); text-shadow: 0 0 5px var(--color-info); letter-spacing: 1px; position: relative; z-index: 11;}
  
  /* Radar Sweep Animation */
  .radar-sweep {
    position: absolute; top: 50%; left: 50%; width: 300px; height: 300px;
    margin-top: -150px; margin-left: -150px;
    border-radius: 50%; border: 1px solid rgba(14, 165, 233, 0.2);
    background: conic-gradient(from 0deg, transparent 70%, rgba(14, 165, 233, 0.4) 100%);
    animation: sweep 4s linear infinite;
    z-index: 10;
  }
  @keyframes sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  .map-node { position: absolute; z-index: 20; transform: translate(-50%, -50%); }
  .node-dot { width: 6px; height: 6px; background: var(--color-critical); border-radius: 50%; box-shadow: 0 0 15px 2px var(--color-critical); }
  .node-dot.severity-high { background: var(--color-high); box-shadow: 0 0 15px 2px var(--color-high); }
  
  .node-tooltip {
    position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.8); border: 1px solid var(--border-dim);
    padding: 4px 8px; font-size: 10px; border-radius: 2px; font-family: monospace;
    white-space: nowrap; opacity: 0; pointer-events: none; transition: 0.2s; color: #fff;
  }
  .map-node:hover .node-tooltip { opacity: 1; }

  /* Animated Bezier Arcs */
  @keyframes dash-arc { to { stroke-dashoffset: -100; } }
  .anim-arc {
    stroke-dasharray: 4 12;
    animation: dash-arc 2s linear infinite;
    filter: drop-shadow(0 0 4px currentColor);
  }

  /* Attacker List */
  .attacker-list { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .attacker-item {
    display: flex; justify-content: space-between; align-items: center;
    background: rgba(255,255,255,0.02); padding: 12px; border-radius: 4px;
    border: 1px solid var(--border-dim); cursor: pointer; transition: 0.2s;
  }
  .attacker-item:hover { background: rgba(255,255,255,0.05); border-color: var(--text-dim); }
  .ai-ip { font-weight: 700; font-family: monospace; font-size: 13px; color: #fff; }
  .ai-stats { display: flex; align-items: center; gap: 8px; }
  .ai-count { font-size: 10px; font-weight: 800; color: var(--text-dim); }
  .badge { padding: 2px 6px; border-radius: 2px; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;}
  .badge.critical { background: var(--color-critical); color: #000; }
  .badge.high { background: var(--color-high); color: #000; }

  /* Network Panel */
  .cyber-grid {
    background-color: #000;
    background-image: 
      linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
    background-size: 30px 30px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 20px; position: relative; flex: 1;
  }
  
  .net-node {
    background: #000; border: 1px solid var(--border-dim);
    padding: 12px 24px; border-radius: 4px; font-weight: 700; font-size: 12px; letter-spacing: 1px;
    text-align: center; min-width: 140px; z-index: 10; position: relative; color: #fff;
    box-shadow: inset 0 0 20px rgba(0,0,0,0.5);
  }
  .net-node i { font-size: 16px; display: block; margin-bottom: 6px; color: var(--text-dim); }
  .net-node.internet { border-color: var(--color-info); box-shadow: 0 0 15px rgba(14,165,233,0.2), inset 0 0 10px rgba(14,165,233,0.1); color: var(--color-info); }
  .net-node.firewall { border-color: var(--color-high); box-shadow: 0 0 15px rgba(255,140,0,0.2); color: var(--color-high); }
  .net-layer { display: flex; gap: 40px; }
  .net-layer .net-node { border-color: var(--color-low); }
  .net-layer .net-node i { color: var(--color-low); }
  .net-layer .net-node small { font-weight: normal; font-size: 10px; color: var(--text-dim); display: block; margin-top: 4px; font-family: monospace;}
  .net-edge.vertical { width: 2px; height: 40px; background: var(--border-dim); }
  .net-edge.glowing { background: linear-gradient(to bottom, var(--color-info), var(--color-high)); }

  .suspicious-overlay { position: absolute; bottom: 20px; right: 20px; }
  .cyber-alert { 
    background: rgba(255,42,42,0.1); border: 1px solid var(--color-critical); padding: 12px 16px; border-radius: 4px; 
    display: flex; align-items: center; gap: 12px; box-shadow: 0 0 20px rgba(255,42,42,0.2); 
    backdrop-filter: blur(4px);
  }
  .ab-icon { font-size: 24px; color: var(--color-critical); animation: pulse-dot 1s infinite; }
  .ab-title { font-size: 11px; font-weight: 900; color: var(--color-critical); letter-spacing: 1px; margin-bottom: 2px; }
  .ab-tactic { font-size: 10px; font-family: monospace; color: #fff; }

  /* MITRE Tactics Sidebar */
  .p-3 { padding: 16px; }
  .mitre-tactic { margin-bottom: 16px; }
  .mitre-tactic .m-code { display: inline-block; width: 50px; font-family: monospace; color: var(--text-dim); font-size: 11px; }
  .mitre-tactic { font-size: 12px; font-weight: 700; color: var(--text-dim); }
  .mitre-tactic.detected { color: #fff; }
  .mitre-tactic.detected .m-code { color: var(--color-critical); }
  .m-bar { height: 4px; background: var(--border-dim); margin-top: 8px; border-radius: 2px; overflow: hidden; }
  .m-bar .fill { height: 100%; background: var(--text-dim); }
  .mitre-tactic.detected .m-bar .fill { background: var(--color-critical); box-shadow: 0 0 8px var(--color-critical); }

  .terminal-text { font-family: 'Courier New', monospace; font-size: 12px; opacity: 0.7; }
</style>
