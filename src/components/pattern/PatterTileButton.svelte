<script lang="ts">
	import { config0 } from '$lib/stores';
	import PatternTile from './PatternTile.svelte';
	import type { patterns } from '$lib/patterns/patterns';
	import { tiledPatternConfigs } from '$lib/shades-config';

	export let patternType: string;
</script>

<button on:click={() => ($config0.tiledPatternConfig = tiledPatternConfigs[patternType])}>
	<PatternTile
		{patternType}
		rows={2}
		columns={2}
		width={50}
		height={50}
		active={patternType === $config0.tiledPatternConfig.type}
	/>
</button>

<style>
	button {
		padding-block: 0;
		padding-inline: 0;
		padding: 0;
		border: none;
	}
</style>
