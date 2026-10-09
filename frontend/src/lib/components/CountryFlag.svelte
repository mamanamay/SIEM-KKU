<script lang="ts">
  export let country = '';
  const codes: Record<string,string> = {Russia:'ru',RU:'ru',China:'cn',CN:'cn',Brazil:'br',BR:'br','United States':'us',USA:'us',US:'us',Germany:'de',DE:'de',France:'fr',FR:'fr',Italy:'it',IT:'it',Ukraine:'ua',UA:'ua',Japan:'jp',JP:'jp',Thailand:'th',TH:'th'};
  $: code = codes[country] || '';
</script>
{#if code}<img class="country-flag" src="/flags/{code}.svg" alt="ธงชาติ {country}" width="32" height="22" />{:else}<i class="ti {country === 'Local Network' ? 'ti-network' : 'ti-world'}" aria-label={country || 'ไม่ทราบประเทศ'}></i>{/if}
<style>.country-flag {display:block; width:32px; height:22px; object-fit:fill; border-radius:3px; border:1px solid var(--border);}</style>
