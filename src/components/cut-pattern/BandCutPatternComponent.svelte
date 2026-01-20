<script lang="ts">
	import { getMidPoint, svgPathStringFromSegments } from '$lib/patterns/utils';
	import type { TransformConfig } from '$lib/projection-geometry/types';
	import { patternConfigStore } from '$lib/stores';
	import type { BandCutPattern, CutPattern, Quadrilateral } from '$lib/types';
	import QuadPattern from '../pattern-svg/QuadPattern.svelte';
	import BoundsPattern from './BoundsPattern.svelte';
	import PathPointIndices from './PathPointIndices.svelte';
	import QuadLabels from './QuadLabels.svelte';

	export let band: BandCutPattern;
	export let renderAsSinglePath = false;
	export let highlightFirstFacet = false;
	export let partnerBands: { band: BandCutPattern; transform: TransformConfig }[] = [];
	export let showPartnerBands = false;
	export let partnerFacets: CutPattern[] = [];
	export let showPartnerFacets = false;
	export let showQuadLabels = false;
	export let showPathPointIndices = false;
	export let showAdjacentFacets = false;
	export let showOriginalPath = false;
	export let showBounds = false;

	const postTransformPF = false;
	const RAINBOW = false;
	const FILL_RAINBOW = false;
	const PARTNER_OFFSET = 0;

	const getTransformString = (transform: TransformConfig) => {
		const {
			translate: { x, y },
			rotate: { z: rotZ }
		} = transform;
		console.debug('BandCutPattern partner transform', transform);
		return `translate(${x}, ${y}) rotate(${rotZ})`;
	};

	const getTransformMatrix = (transform: TransformConfig) => {
		const {
			translate: { x: translateX, y: translateY },
			rotate: { z: theta }
		} = transform;
		// Must be 100% equivalent to: `translate(${translateX}, ${translateY}) rotate(${theta})`
		// In SVG, transform lists are applied right-to-left, so this is: Rotate, then Translate.
		const thetaRad = (theta * Math.PI) / 180;
		const cos = Math.cos(thetaRad);
		const sin = Math.sin(thetaRad);
		return `matrix(${cos} ${sin} ${-sin} ${cos} ${translateX} ${translateY + PARTNER_OFFSET})`;
	};

	// const getTransformMatrix = (transform: TransformConfig) => {
	// 	const {
	// 		translate: { x, y },
	// 		rotate: { z: rotZ }
	// 	} = transform;
	// 	const theta = (rotZ * Math.PI) / 180;
	// 	const cosTheta = Math.cos(theta);
	// 	const sinTheta = Math.sin(theta);
	// 	return `matrix(
	// 	${cosTheta} ${sinTheta} ${-sinTheta} ${cosTheta} ${x * cosTheta - y * sinTheta} ${
	// 		x * sinTheta + y * cosTheta
	// 	})`;
	// };

	const colors = ['purple', 'blue', 'green', 'yellow', 'orange', 'red'];
</script>

<QuadPattern
	{band}
	showQuads={$patternConfigStore.patternViewConfig.showQuads}
	showLabels={$patternConfigStore.patternViewConfig.showLabels}
/>
<BoundsPattern {showBounds} bounds={band.bounds} />
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
		{#if showOriginalPath && facet.meta?.originalPath}
			<path
				d={svgPathStringFromSegments(facet.meta?.originalPath)}
				fill="none"
				stroke="black"
				stroke-width={2}
				opacity="0.1"
			/>
		{/if}
		{#if showAdjacentFacets && facet.meta?.prevBandPath}
			<path
				d={svgPathStringFromSegments(facet.meta?.prevBandPath)}
				fill="none"
				stroke="green"
				stroke-width={2}
				opacity="0.3"
			/>
		{/if}
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

<PathPointIndices {band} {showPathPointIndices} />

{#if showPartnerBands && partnerBands?.length}
	{#each partnerBands as { band, transform }, b}
		<g transform={getTransformMatrix(transform)} class="partner-band">
			<QuadPattern
				{band}
				showQuads={$patternConfigStore.patternViewConfig.showQuads}
				showLabels={$patternConfigStore.patternViewConfig.showLabels}
			/>
			{#each band.facets as facet, f}
				<path
					class={highlightFirstFacet && f === 0 ? 'highlighted-partner' : undefined}
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
			<PathPointIndices {band} {showPathPointIndices} />
		</g>
	{/each}
{/if}

{#if showPartnerFacets}
	{#each partnerFacets as facet, f}
		<path
			transform={postTransformPF ? getTransformMatrix(partnerBands[f].transform) : undefined}
			class="partner-facet"
			d={svgPathStringFromSegments(facet.path)}
			fill="none"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke={['red', 'blue'][f % 2]}
			stroke-width={1}
		/>
	{/each}
{/if}

<style>
	.highlighted {
		stroke: green;
		stroke-width: 4;
	}
	.highlighted-partner {
		stroke: red;
		stroke-width: 4;
	}
	.partner-band {
		filter: opacity(1);
	}
</style>
