<script lang="ts">
	import { configStore0 } from '$lib/stores/stores';
	import PatternTile from './PatternTile.svelte';
	import { tiledPatternConfigs } from '$lib/shades-config';
	import { patterns } from '$lib/patterns/patterns';
	import type { TilingBasis } from '$lib/types';

	export let patternType: string;
	export let tilingBasis: TilingBasis;
</script>

<button
	on:click={() => {
		console.debug('click', patternType);
		if (patterns[patternType]) {
			$configStore0.tiledPatternConfig = tiledPatternConfigs[patternType];
		}
	}}
>
	<PatternTile
		{patternType}
		rows={2}
		columns={2}
		width={50}
		height={50}
		active={patternType === $configStore0.tiledPatternConfig.type}
		{tilingBasis}
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
