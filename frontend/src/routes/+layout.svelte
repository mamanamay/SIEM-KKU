<script>
  import '../app.css';
  import { page } from '$app/stores';
  import Notification from '$lib/components/Notification.svelte';
</script>

<svelte:head>
</svelte:head>

<Notification modern={!$page.url.pathname.startsWith('/wallboard')} />
<slot />
