<script lang="ts">
	import { tiledPatternConfigs } from '$lib/shades-config';
	import PatternTile from '../../components/pattern/PatternTile.svelte';
</script>

<section>
	{#each Object.keys(tiledPatternConfigs) as patternType}
		<PatternTile {patternType} rows={3} columns={5} width={100} height={100} />
	{/each}
</section>

<style>
	section {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
	}
</style>
