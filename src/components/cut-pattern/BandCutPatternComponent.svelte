<script lang="ts">
	import { getMidPoint } from '$lib/patterns/utils';
	import type { TransformConfig } from '$lib/projection-geometry/types';
	import { patternConfigStore } from '$lib/stores';
	import type { BandCutPattern, CutPattern, Quadrilateral } from '$lib/types';
	import QuadPattern from '../pattern-svg/QuadPattern.svelte';
	import QuadLabels from './QuadLabels.svelte';

	export let band: BandCutPattern;
	export let renderAsSinglePath = false;
	export let highlightFirstFacet = false;
	export let partnerBands: { band: BandCutPattern; transform: TransformConfig }[] = [];
	export let partnerFacets: CutPattern[] = [];
	export let showQuadLabels = false;

	const RAINBOW = false;
	const FILL_RAINBOW = false;

	const colors = ['purple', 'blue', 'green', 'yellow', 'orange', 'red'];
</script>

<QuadPattern
	{band}
	showQuads={$patternConfigStore.patternViewConfig.showQuads}
	showLabels={$patternConfigStore.patternViewConfig.showLabels}
/>
{#if renderAsSinglePath}
	<path
		d={band.svgPath}
		fill="none"
		stroke-width={band.facets[0].strokeWidth}
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
{:else}
	{#each band.facets as facet, f}
		<path
			class={highlightFirstFacet && f === 0 ? 'highlighted' : undefined}
			d={facet.svgPath}
			fill={FILL_RAINBOW ? colors[f % colors.length] : 'none'}
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width={`${facet.strokeWidth || 1}`}
		/>
	{/each}
{/if}
{#if showQuadLabels}
	<QuadLabels {band} {showQuadLabels} />
{/if}

{#each partnerBands as { band, transform: { translate: { x, y }, rotate: { z: rot } } }, b}
	<g transform={`translate(${x}, ${y}) rotate(${rot})`}>
		<QuadPattern
			{band}
			showQuads={$patternConfigStore.patternViewConfig.showQuads}
			showLabels={$patternConfigStore.patternViewConfig.showLabels}
		/>
		{#each band.facets as facet, f}
			<path
				class={highlightFirstFacet && f === 0 ? 'highlighted' : undefined}
				d={facet.svgPath}
				fill="none"
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width={`${facet.strokeWidth || 1}`}
			/>
			{#if showQuadLabels}
				<QuadLabels {band} {showQuadLabels} />
			{/if}
		{/each}
	</g>
{/each}

{#each partnerFacets as facet, f}
	<path
		d={facet.svgPath}
		fill="none"
		stroke-linecap="round"
		stroke-linejoin="round"
		stroke-width={`${facet.strokeWidth || 1}`}
	/>
{/each}

<style>
	.highlighted {
		stroke: green;
		stroke-width: 4;
	}
</style>
