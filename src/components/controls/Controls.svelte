<script lang="ts">
	export let showControl: string;
</script>

{#if showControl === 'Struts'}
	<StrutControl />
{:else if showControl === '3D'}
	<ShowControl />
{:else if showControl === 'Levels'}
	<LevelControl />
{:else if showControl === 'Cut'}
	<CutControl />
{:else if showControl === 'Pattern'}
	<TilingControl />
{/if}
