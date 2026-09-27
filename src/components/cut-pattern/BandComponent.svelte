<script lang="ts">
	import type { BandCutPattern, PatternSource, Point, TubeCutPattern } from '$lib/types';
	import type { Snippet } from 'svelte';
	import PatternLabel from './PatternLabel.svelte';
	import OnTabLabel from './OnTabLabel.svelte';
	import { resolveTabLabel } from '$lib/cut-pattern/resolve-tab-label';
	import {
		assemblerHighlight,
		dropLabelText,
		isPrepared,
		patternBandSpaces,
		patternConfigStore,
		sameGlobuleBand,
		selectedGlobuleTube,
		selectedProjection,
		selectedSurfaceProjection,
		selectedVoronoi,
		selectedVoronoiSurface,
		setAssemblerHighlightForBand
	} from '$lib/stores';
	import { HIGHLIGHT_PRIMARY, HIGHLIGHT_SECONDARY } from '$lib/highlight-colors';
	import type { Vector3 } from 'three';
	import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';
	import { concatAddress } from '$lib/util';
	import { buildSelfTagLines } from '$lib/cut-pattern/build-self-tag-lines';
	import { bandTransform } from '$lib/cut-pattern/band-transform';
	import {
		assemblerHighlightInPattern,
		geometrySourceOfPattern,
		patternBandSelectionToReal
	} from '$lib/cut-pattern/pattern-band-space';
	import SplitTargets from './SplitTargets.svelte';
	import {
		applySplitToggle,
		resolveSplitSubunitCount,
		splitQuadsForTube
	} from '$lib/cut-pattern/split-boundaries';
	import { interactionMode } from '../three-renderer/interaction-mode';
	import { get } from 'svelte/store';

	let {
		band,
		index,
		origin,
		rotation = 0,
		pivot = { x: 0, y: 0 },
		tube,
		tubes,
		showBounds = false,
		tagAnchorPoint,
		tagAngle,
		groupCode = undefined,
		selectionTarget = 'projection',
		children
	}: {
		band: BandCutPattern;
		index: number;
		origin: Vector3;
		rotation?: number;
		pivot?: Point;
		tube: TubeCutPattern;
		/** Every tube of the pattern, indexed by tube number: tab labels resolve end partners in them. */
		tubes: TubeCutPattern[];
		showBounds?: boolean;
		tagAnchorPoint: Point;
		tagAngle: number | undefined;
		groupCode?: string;
		selectionTarget?: PatternSource;
		children?: Snippet;
	} = $props();

	let patternTypeConfig = $derived($patternConfigStore.patternTypeConfig);
	let labels = $derived(patternTypeConfig.labels);
	let onTabEnabled = $derived(labels?.onTab?.enabled ?? false);
	let selfTagEnabled = $derived(labels?.selfTag?.enabled ?? false);
	let externalTagEnabled = $derived(labels?.selfTag?.externalTag ?? false);
	let selfTagLines = $derived(
		buildSelfTagLines(concatAddress(band.address, 'tb-slash'), groupCode, externalTagEnabled)
	);
	let hasTabs = $derived(!!band.tabs && band.tabs.length > 0);

	// Splitting: one `patternTypeConfig` serves every tube (`types.ts:1429`), so
	// this is not per-tube, and it is the same value generation judges splits
	// with — if the two diverged, a click would place a split that generation
	// then rejects.
	let subunitCount = $derived(resolveSplitSubunitCount(patternTypeConfig));
	let isSplitMode = $derived($interactionMode.type === 'quad-split-select');
	// Splits are persisted per tube as absolute quad indices, found by tube
	// number rather than by position in the array.
	let splitQuads = $derived(
		splitQuadsForTube($patternConfigStore.patternConfig.splits, band.address.tube)
	);

	/**
	 * Place or remove a split at one quad boundary.
	 *
	 * `quad` is already an absolute parent quad index, so this is correct whether
	 * the clicked band is an uncut band or a piece of an already-split one. The
	 * write is `.set(rebuilt)` (the `PatternView.svelte:39` idiom) because panels
	 * read `splits` through a `$derived` chain that would go stale on an in-place
	 * assignment. One click costs one regeneration, by design.
	 */
	const toggleSplit = (quad: number) => {
		patternConfigStore.set(applySplitToggle(get(patternConfigStore), band.address.tube, quad));
	};

	let colors = {
		default: 'orange',
		hovered: 'blue',
		focused: 'rebeccapurple'
	};

	let isFocused = $state(false);
	let isHovered = $state(false);
	let color = $derived(isHovered ? colors.hovered : isFocused ? colors.focused : colors.default);

	// Assembler cross-view highlight: fill this band's bounds when it (or its
	// ring) is the band clicked in the data grid.
	let highlightFill = $derived.by(() => {
		// Only a highlight of this pattern's source names bands in its space.
		const h = assemblerHighlightInPattern($assemblerHighlight, selectionTarget);
		if (!h) return null;
		if (sameGlobuleBand(band.address, h.band)) return HIGHLIGHT_PRIMARY;
		if (h.ring.some((b) => sameGlobuleBand(band.address, b))) return HIGHLIGHT_SECONDARY;
		return null;
	});

	const handleMouseOver = (address: GlobuleAddress_Band) => {
		isHovered = true;
	};
	const handleMouseOut = (address: GlobuleAddress_Band) => {
		isHovered = false;
	};

	/**
	 * Clicking a band in the SVG pattern selects it: it drives the per-source 3D
	 * facet selection AND the Assembler cross-view highlight, so the same band
	 * lights up in the 3D view and the data grid.
	 *
	 * Each source must go to its own selection store — they resolve addresses
	 * against different `Tube[]` arrays, so sending e.g. a voronoi address to
	 * `selectedProjection` looks it up in the projection's tubes and highlights the
	 * wrong band.
	 *
	 * The selection stores index 3D tubes by REAL band, and a pattern band counts
	 * only the bands that were patterned, so the address is mapped (a piece to its
	 * parent band, at its first triangle). The Assembler highlight stays in pattern
	 * space.
	 */
	const handleClick = (address: GlobuleAddress_Band) => {
		const facetAddress = patternBandSelectionToReal(
			$patternBandSpaces(geometrySourceOfPattern(selectionTarget), address.globule),
			{ address, parentQuadOffset: band.parentQuadOffset }
		);
		// No real band behind it only for a stale pattern: nothing to select in 3D.
		if (facetAddress) {
			if (selectionTarget === 'voronoiSurface') {
				$selectedVoronoiSurface = facetAddress;
			} else if (selectionTarget === 'voronoi') {
				$selectedVoronoi = facetAddress;
			} else if (selectionTarget === 'surfaceProjection') {
				$selectedSurfaceProjection = facetAddress;
			} else if (selectionTarget === 'globule') {
				$selectedGlobuleTube = facetAddress;
			} else {
				$selectedProjection = facetAddress;
			}
		}
		setAssemblerHighlightForBand(geometrySourceOfPattern(selectionTarget), address);
	};
</script>

<!-- `role="button"` + `tabindex` make the group genuinely focusable: it previously
     carried the selection on `onfocus` alone, which can never fire on a plain
     <g>, so clicking a band in the pattern did nothing at all. -->
<g
	transform={bandTransform(origin, rotation, pivot)}
	id={`band-${band.id}`}
	role="button"
	tabindex="0"
	onmouseover={() => handleMouseOver(band.address)}
	onmouseout={() => handleMouseOut(band.address)}
	onclick={() => handleClick(band.address)}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleClick(band.address);
		}
	}}
	onfocus={() => (isFocused = true)}
	onblur={() => (isFocused = false)}
	stroke={color}
>
	{#if showBounds && band.bounds}<rect
			class="screen-only"
			x={band.bounds.left}
			y={band.bounds.top}
			width={band.bounds.width}
			height={band.bounds.height}
			fill="rgba(0, 0, 0, 0.05)"
			stroke="red"
			stroke-width={0.1}
		/>{/if}
	{#if highlightFill && !$isPrepared && band.bounds}<rect
			class="screen-only"
			x={band.bounds.left}
			y={band.bounds.top}
			width={band.bounds.width}
			height={band.bounds.height}
			fill={highlightFill}
			fill-opacity={0.45}
			stroke={highlightFill}
			stroke-width={1}
		/>{/if}
	{@render children?.()}
	<!-- Existing splits draw at all times except in the prepared view, which is a
	     preview of the cut file; every legal boundary becomes clickable only while
	     split mode is on. Mounted only when it has something to draw:
	     `splitQuads` is a fresh array on every `patternConfigStore` write, so an
	     unconditional mount would re-run the child's derived for every band on
	     every config change. -->
	{#if !$isPrepared && (isSplitMode || splitQuads.length > 0)}
		<SplitTargets
			{band}
			{subunitCount}
			{splitQuads}
			interactive={isSplitMode}
			onToggle={toggleSplit}
		/>
	{/if}
	{#if onTabEnabled && hasTabs && !($isPrepared && $dropLabelText)}
		{#each band.tabs ?? [] as tab, tabIndex (tabIndex)}
			<OnTabLabel
				outer={tab.outer}
				base={tab.base}
				text={resolveTabLabel(tab, band, tube, tubes)}
				padding={labels?.onTab?.padding ?? 1}
				color={labels?.onTab?.color ?? 'black'}
			/>
		{/each}
	{/if}
	{#if selfTagEnabled}
		<PatternLabel
			id={`band-self-${band.id}`}
			bandId={band.id}
			{color}
			value={index}
			radius={(labels?.selfTag?.height ?? 16) / 4}
			height={labels?.selfTag?.height ?? 14}
			angle={band.tagAngle ?? labels?.selfTag?.angle ?? 0}
			autoAngle={band.tagAnchorAutoAngle}
			anchor={tagAnchorPoint || { x: -50, y: -50 }}
			addressStrings={selfTagLines}
			padding={labels?.selfTag?.padding ?? 10}
			stemLength={labels?.selfTag?.stemLength ?? 20}
			stemWidth={labels?.selfTag?.stemWidth ?? 4}
		/>
	{/if}
</g>
