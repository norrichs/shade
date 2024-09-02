<script lang="ts">
	import { config } from '$lib/stores';
</script>

{#if $config.isModified}
	<button disabled={!$config.isModified}>Save</button>
{/if}
