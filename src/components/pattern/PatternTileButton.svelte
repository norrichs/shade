<script lang="ts">
	import { patternConfigStore } from '$lib/stores';
	import PatternTile from './PatternTile.svelte';
	import { tiledPatternConfigs } from '$lib/shades-config';
	import { patterns } from '$lib/patterns';
	import type { TilingBasis } from '$lib/types';

	export let patternType: string;
	export let tilingBasis: TilingBasis;
</script>

<button
	on:click={() => {
		if (patterns[patternType]) {
			$patternConfigStore.tiledPatternConfig = tiledPatternConfigs[patternType];
		}
	}}
>
	<PatternTile
		{patternType}
		rows={2}
		columns={2}
		width={50}
		height={50}
		active={patternType === $patternConfigStore.tiledPatternConfig.type}
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
