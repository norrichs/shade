<script lang="ts">
	import { patternConfigStore } from '$lib/stores';
	import PatternTile from './PatternTile.svelte';
	import { tiledPatternConfigs } from '$lib/shades-config';
	import { patterns } from '$lib/patterns';
	import type { TilingBasis } from '$lib/types';

	let {
		patternType,
		tilingBasis,
		size = 50
	}: {
		patternType: string;
		tilingBasis: TilingBasis;
		size?: number;
	} = $props();

	let strokeWidth = $derived(size >= 50 ? 2 : 0.5);
</script>

<button
	onclick={() => {
		if (patterns[patternType]) {
			$patternConfigStore.tiledPatternConfig = tiledPatternConfigs[patternType];
		}
	}}
>
	<PatternTile
		{patternType}
		rows={2}
		columns={2}
		width={size}
		height={size}
		active={patternType === $patternConfigStore.tiledPatternConfig.type}
		{tilingBasis}
		{strokeWidth}
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
