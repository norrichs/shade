<script lang="ts">
	import { patternConfigStore } from '$lib/stores';
	import PatternTile from './PatternTile.svelte';
	import { tiledPatternConfigs } from '$lib/shades-config';
	import { patterns } from '$lib/patterns';
	import { tilePatternSpecStore } from '$lib/stores/tilePatternSpecStore';
	import { algorithms } from '$lib/patterns/pattern-registry';
	import type { TilingBasis, TiledPatternConfig } from '$lib/types';
	import { get } from 'svelte/store';

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

	const resolveBaseConfig = (type: string): TiledPatternConfig => {
		const direct = tiledPatternConfigs[type];
		if (direct) return direct;
		const variant = get(tilePatternSpecStore).variants.find((v) => v.id === type);
		const algorithmId = variant?.algorithm;
		const algorithm = algorithms.find((a) => a.algorithmId === algorithmId);
		const builtInId = algorithm?.defaultSpec.id;
		if (builtInId && tiledPatternConfigs[builtInId]) {
			return { ...tiledPatternConfigs[builtInId], type };
		}
		return { ...tiledPatternConfigs['tiledShieldTesselationPattern'], type };
	};
</script>

<button
	onclick={() => {
		if (!patterns[patternType]) return;
		$patternConfigStore.patternTypeConfig = resolveBaseConfig(patternType);
	}}
>
	<PatternTile
		{patternType}
		rows={2}
		columns={2}
		width={size}
		height={size}
		active={patternType === $patternConfigStore.patternTypeConfig.type}
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
