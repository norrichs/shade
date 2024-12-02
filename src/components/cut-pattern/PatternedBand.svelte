<script lang="ts">
	import type { PatternedBand } from '$lib/types';
	import PatternLabel from './PatternLabel.svelte';
	import { patternConfigStore } from '$lib/stores';

	export let band: PatternedBand;
	export let index: number;
	export let showLabel = true;
</script>

<g transform={`translate(${-250 + 50 * index} -50) scale(-1,-1)`}>
	{#each band.facets as facet}
		<g fill="none" stroke-width={`${facet.strokeWidth || 1}`} stroke="black">
			<path d={facet.svgPath} stroke-linecap="round" stroke-linejoin="round" />
			<path
				d={facet.svgPath}
				stroke="red"
				stroke-linecap="round"
				stroke-linejoin="round"
				clip-path=""
			/>
		</g>
	{/each}
	{#if showLabel}
		<PatternLabel
			value={index}
			radius={5}
			scale={$patternConfigStore.tiledPatternConfig.labels?.scale || 0.1}
			angle={$patternConfigStore.tiledPatternConfig.labels?.angle || band.tagAngle}
			anchor={band.tagAnchorPoint || { x: -50, y: -50 }}
		/>
	{/if}
</g>
