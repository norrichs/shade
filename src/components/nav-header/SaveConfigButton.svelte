<script lang="ts">
	import { configStore } from '$lib/stores/stores';
</script>

{#if $configStore.isModified}
	<button disabled={!$configStore.isModified}>Save</button>
{/if}
