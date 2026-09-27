<script lang="ts">
	import { getMidPoint, svgPathStringFromSegments } from '$lib/patterns/utils';
	import type { TransformConfig } from '$lib/projection-geometry/types';
	import { patternConfigStore, mergedBandPaths, layerStrokes } from '$lib/stores';
	import { resolveBandRenderMode } from '$lib/cut-pattern/band-render-mode';
	import { concatPieces } from '$lib/cut-pattern/drop-holes';
	import type { BandCutPattern, CutPattern, Quadrilateral } from '$lib/types';
	import QuadPattern from '../pattern-svg/QuadPattern.svelte';
	import BoundsPattern from './BoundsPattern.svelte';
	import PathPointIndices from './PathPointIndices.svelte';
	import QuadLabels from './QuadLabels.svelte';

	let {
		band,
		renderAsSinglePath = false,
		highlightFirstFacet = false,
		partnerBands = [],
		showPartnerBands = false,
		partnerFacets = [],
		showPartnerFacets = false,
		showQuadLabels = false,
		showPathPointIndices = false,
		showAdjacentFacets = false,
		showOriginalPath = false,
		showBounds = false
	}: {
		band: BandCutPattern;
		renderAsSinglePath?: boolean;
		highlightFirstFacet?: boolean;
		partnerBands?: { band: BandCutPattern; transform: TransformConfig }[];
		showPartnerBands?: boolean;
		partnerFacets?: CutPattern[];
		showPartnerFacets?: boolean;
		showQuadLabels?: boolean;
		showPathPointIndices?: boolean;
		showAdjacentFacets?: boolean;
		showOriginalPath?: boolean;
		showBounds?: boolean;
	} = $props();

	const postTransformPF = false;
	const RAINBOW = false;
	const FILL_RAINBOW = false;
	const PARTNER_OFFSET = 0;

	const getTransformString = (transform: TransformConfig) => {
		const {
			translate: { x, y },
			rotate: { z: rotZ }
		} = transform;
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

	const colors = ['purple', 'blue', 'green', 'yellow', 'orange', 'red'];
</script>

<!-- QuadPattern emits a <g> + <path> per facet even when both toggles are off
     (the path is only CSS-hidden). Skipping it removes two DOM nodes per facet
     from the default view, which is roughly 35k nodes on a large model. -->
{#if $patternConfigStore.patternViewConfig.showQuads || $patternConfigStore.patternViewConfig.showLabels}
	<QuadPattern
		{band}
		showQuads={$patternConfigStore.patternViewConfig.showQuads}
		showLabels={$patternConfigStore.patternViewConfig.showLabels}
	/>
{/if}
<BoundsPattern {showBounds} bounds={band.bounds} />
{#if renderAsSinglePath}
	{@const pieces = $mergedBandPaths.get(band.id)}
	{@const hasMerged = !!pieces}
	{@const renderMode = resolveBandRenderMode({
		hasMerged,
		patternType: $patternConfigStore.patternTypeConfig.type
	})}
	{#if renderMode === 'merged-outlined' && pieces}
		<!-- One path per tagged piece; stroke from the layer map, so the preview
		     shows the colors the cut file carries. -->
		{#each pieces as piece, p (p)}
			<path
				d={svgPathStringFromSegments(piece.segments)}
				data-geometry={piece.geometry}
				fill="none"
				stroke={$layerStrokes[piece.geometry]}
				stroke-width={band.facets[0]?.strokeWidth ?? 1}
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{/each}
	{:else if renderMode === 'merged-tiled' && pieces}
		<!-- Preview-only silhouette: holes now render as separate paths, so the
		     evenodd fill needs its own concatenated path. Never exported. -->
		<path
			class="screen-only"
			d={svgPathStringFromSegments(concatPieces(pieces))}
			fill="rgba(200,200,200,0.1)"
			fill-rule="evenodd"
			stroke="none"
		/>
		{#each pieces as piece, p (p)}
			<path
				d={svgPathStringFromSegments(piece.segments)}
				data-geometry={piece.geometry}
				fill="none"
				stroke={$layerStrokes[piece.geometry]}
				stroke-width={1}
			/>
		{/each}
	{:else}
		<!-- One path PER FACET, each at its own dynamic stroke width. Drawing the
		     whole band as a single path forces a single width for every facet
		     (it used to take facets[0]'s), which silently discarded the
		     dynamicStrokeMin..Max variation that `applyStrokeWidth` computed —
		     and made the working view disagree with the "Prepare download"
		     union, which has always expanded each facet at its own width. -->
		{#each band.facets as facet, f (f)}
			<path
				d={facet.svgPath}
				fill="none"
				stroke-width={facet.strokeWidth ?? 1}
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{/each}
	{/if}
{:else}
	{#each band.facets as facet, f (f)}
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
	{#each partnerBands as { band, transform }, b (b)}
		<g transform={getTransformMatrix(transform)} class="partner-band">
			<QuadPattern
				{band}
				showQuads={$patternConfigStore.patternViewConfig.showQuads}
				showLabels={$patternConfigStore.patternViewConfig.showLabels}
			/>
			{#each band.facets as facet, f (f)}
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
	{#each partnerFacets as facet, f (f)}
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
