<script lang="ts">
  export let name = 'shield';
  export let size = 20;
  const paths: Record<string, string> = {
    shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z M9 12l2 2 4-4',
    user: 'M20 21v-2a7 7 0 0 0-14 0v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    lock: 'M6 10h12a1 1 0 0 1 1 1v9H5v-9a1 1 0 0 1 1-1Z M8 10V7a4 4 0 0 1 8 0v3 M12 14v2',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    hidden: 'm3 3 18 18 M10 5c7-2 12 7 12 7s-1 2-3 4 M6 6c-2 2-4 6-4 6s4 7 10 7c2 0 4-1 5-2 M10 10a3 3 0 0 0 4 4',
    arrow: 'M4 12h16 m-6-6 6 6-6 6',
    back: 'M20 12H4 m6-6-6 6 6 6',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1',
    moon: 'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z',
    alert: 'm12 3 10 18H2L12 3Z M12 9v4 M12 17v.01',
    check: 'm5 12 4 4L19 6',
    key: 'M8 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 12h10 M18 12v3 M21 12v2',
    building: 'M4 21V6l8-3 8 3v15 M2 21h20 M9 21v-5h6v5 M8 8v1 M16 8v1 M8 12v1 M16 12v1',
    radar: 'M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 12l7-7 M12 12v.01',
    bolt: 'm13 2-9 12h7l-1 8 10-12h-7l1-8Z',
  };
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[name] || paths.shield} /></svg>
