<script lang="ts">
	import {
		sliceProjectionCutPattern,
		type ProjectionRange
	} from '$lib/projection-geometry/filters';
	import {
		patternConfigStore,
		viewControlStore,
		labelTextDimensions,
		pageLayoutInfoStore
	} from '$lib/stores';
	import {
		buildEffectiveBoundsIndex,
		buildPivotIndex,
		buildTagAnchorIndex,
		effectiveBoundsForBand,
		type EffectiveBoundsContext
	} from '$lib/cut-pattern/band-layout';
	import { Vector3 } from 'three';
	import {
		computeWrappedOrigins,
		GAP_BETWEEN_BANDS,
		type WrapInput
	} from '$lib/cut-pattern/compute-wrapped-origins';
	import type {
		BandCutPattern,
		BandSortIndex,
		CutPattern,
		PatternSource,
		Point,
		PointConfig2,
		TubeCutPattern
	} from '$lib/types';
	import BandComponent from './BandComponent.svelte';
	import BandCutPatternComponent from './BandCutPatternComponent.svelte';
	import QuadPattern from '../pattern-svg/QuadPattern.svelte';
	import type { GlobuleAddress_Band, TransformConfig, Tube } from '$lib/projection-geometry/types';
	import { getTransform } from './distrubute-panels';
	import { concatAddress } from '$lib/util';
	import { resolveEndPartner } from '$lib/cut-pattern/resolve-partner-band';
	import { PATTERN_PORTAL_ID, LABEL_TEXT_PORTAL_ID, LABEL_TAG_PORTAL_ID } from './constants';
	import { buildBandCodeMap } from '$lib/cut-pattern/band-sort-index';
	import PageGeometry from './PageGeometry.svelte';
	import { buildPageGeom, PAGE_LAYOUT_ALGORITHMS } from '$lib/cut-pattern/page-layout/registry';
	import type { LayoutItem, PageLayoutResult } from '$lib/cut-pattern/page-layout/types';
	import { toastStore } from '$lib/stores/toastStore';

	let {
		tubes = [],
		sortIndex,
		selectionTarget = 'projection'
	}: {
		tubes?: TubeCutPattern[];
		sortIndex?: BandSortIndex;
		selectionTarget?: PatternSource;
	} = $props();

	type ResolvedBand = { band: BandCutPattern; tube: TubeCutPattern };

	const resolveBandWithTube = (ref: {
		globule: number;
		tube: number;
		band: number;
	}): ResolvedBand | undefined => {
		const tube = tubes.find(
			(t) => t.address.tube === ref.tube && t.address.globule === ref.globule
		);
		if (!tube) return undefined;
		const band = tube.bands.find((b) => b.address.band === ref.band);
		if (!band) return undefined;
		return { band, tube };
	};

	const resolveIndexBands = (index: BandSortIndex): ResolvedBand[] =>
		index.groups.flatMap((group) =>
			group.bands.map((ref) => resolveBandWithTube(ref)).filter((r): r is ResolvedBand => !!r)
		);

	let indexedBands = $derived(sortIndex ? resolveIndexBands(sortIndex) : undefined);

	let codeMap = $derived(sortIndex ? buildBandCodeMap(sortIndex) : undefined);
	const groupCodeFor = (address: { globule: number; tube: number; band: number }) =>
		codeMap?.get(`${address.globule}-${address.tube}-${address.band}`);

	let patternLabels = $derived($patternConfigStore.patternTypeConfig?.labels);
	let externalTagEnabled = $derived(patternLabels?.selfTag?.externalTag ?? false);
	let measuredLabelDims = $derived($labelTextDimensions);

	// Band bounds expanded to enclose the external self-tag label, so layout
	// packing reserves space for labels instead of overlapping them. Falls back
	// to raw geometry bounds when the label isn't shown. Computed once per band
	// per layout pass via `boundsIndex` (see below); the direct call is only a
	// fallback for a band that is not in the current band list.
	const boundsContext = (): EffectiveBoundsContext => ({
		labels: patternLabels,
		externalTagEnabled,
		measuredDims: measuredLabelDims,
		groupCodeFor
	});
	const effBoundsFor = (band: BandCutPattern) =>
		boundsIndex.has(band) ? boundsIndex.get(band) : effectiveBoundsForBand(band, boundsContext());

	const alignedY = (band: BandCutPattern, verticalAlignment: 'top' | 'bottom' | 'center') => {
		const bounds = effBoundsFor(band);
		switch (verticalAlignment) {
			case 'bottom':
				return -(bounds?.height || 0);
			case 'center':
				return -(bounds?.height || 0) / 2;
			case 'top':
			default:
				return 0;
		}
	};

	const getCumulativeOrigins = (
		tubes: TubeCutPattern[],
		gap: number = GAP_BETWEEN_BANDS,
		verticalAlignment: 'top' | 'bottom' | 'center' = 'center',
		lineWrap = false,
		wrapWidth?: number
	) => {
		const flatBands = tubes.flatMap((tube) => tube.bands);
		const inputs: WrapInput[] = flatBands.map((band) => {
			const bounds = effBoundsFor(band);
			return {
				width: bounds?.width || 0,
				height: bounds?.height || 0,
				left: bounds?.left || 0,
				top: bounds?.top || 0,
				alignedYOffset: alignedY(band, verticalAlignment)
			};
		});
		const flat = computeWrappedOrigins(inputs, { gap, lineWrap, wrapWidth });

		let cursor = 0;
		return {
			tubes: tubes.map((tube) => ({
				bands: tube.bands.map(() => flat[cursor++])
			}))
		};
	};

	const getFlatOrigins = (
		bands: ResolvedBand[],
		gap: number = GAP_BETWEEN_BANDS,
		verticalAlignment: 'top' | 'bottom' | 'center' = 'center',
		lineWrap = false,
		wrapWidth?: number
	): Vector3[] => {
		const inputs: WrapInput[] = bands.map(({ band }) => {
			const bounds = effBoundsFor(band);
			return {
				width: bounds?.width || 0,
				height: bounds?.height || 0,
				left: bounds?.left || 0,
				top: bounds?.top || 0,
				alignedYOffset: alignedY(band, verticalAlignment)
			};
		});
		return computeWrappedOrigins(inputs, { gap, lineWrap, wrapWidth });
	};

	const toLayoutItems = (bands: ResolvedBand[]): LayoutItem[] =>
		bands.map(({ band }) => {
			const bounds = effBoundsFor(band);
			return {
				width: bounds?.width || 0,
				height: bounds?.height || 0,
				left: bounds?.left || 0,
				top: bounds?.top || 0,
				alignedYOffset: 0 // page mode is top-aligned (flex-start)
			};
		});

	const getPartnerBands = (originBand: BandCutPattern, tubes: TubeCutPattern[]) => {
		const { meta } = originBand;
		if (!meta) return undefined;
		const IDENTITY_TRANSFORM: TransformConfig = {
			translate: { x: 0, y: 0, z: 0 },
			scale: { x: 1, y: 1, z: 1 },
			rotate: { x: 0, y: 0, z: 0 }
		};
		// End partners resolve by which of the partner's ends joins this band, not
		// by this band's own piece index — the same rule getEndPartnerTransforms
		// used to compute meta.startPartnerTransform / endPartnerTransform, so each
		// transform is applied to the band it was computed against. Resolution is
		// by address, never position: a tube holding pieces has more bands than
		// band indices.
		const startBand = resolveEndPartner(tubes, originBand, 'start')?.band;
		const endBand = resolveEndPartner(tubes, originBand, 'end')?.band;
		// An outer end with no partner is normal for a split piece; render the
		// ends that did resolve rather than dropping both.
		if (!startBand && !endBand) return undefined;
		return [
			...(startBand
				? [{ band: startBand, transform: meta.startPartnerTransform ?? IDENTITY_TRANSFORM }]
				: []),
			...(endBand
				? [{ band: endBand, transform: meta.endPartnerTransform ?? IDENTITY_TRANSFORM }]
				: [])
		];
	};

	const filtered = ({ tubes, range }: { tubes: TubeCutPattern[]; range: ProjectionRange }) => {
		const sliced = sliceProjectionCutPattern(tubes, range);
		return sliced;
	};

	let range = $derived($patternConfigStore.patternViewConfig.range);
	let layoutMode = $derived($patternConfigStore.patternViewConfig.patternLayoutMode ?? 'linear');
	let pageLayoutCfg = $derived($patternConfigStore.patternConfig.pageLayout);
	let wrapWidth = $derived($patternConfigStore.patternViewConfig.wrapWidth ?? 800);
	let gap = $derived($patternConfigStore.patternViewConfig.gap ?? GAP_BETWEEN_BANDS);

	let showPattern = $derived.by(() => {
		const { showGlobuleTubeGeometry, showProjectionGeometry, showVoronoiGeometry } =
			$viewControlStore;
		const any =
			showGlobuleTubeGeometry.any || showProjectionGeometry.any || showVoronoiGeometry.any;
		const bands =
			showGlobuleTubeGeometry.bands || showProjectionGeometry.bands || showVoronoiGeometry.bands;
		const facets =
			showGlobuleTubeGeometry.facets || showProjectionGeometry.facets || showVoronoiGeometry.facets;
		const isVoronoiSource = selectionTarget === 'voronoi' || selectionTarget === 'voronoiSurface';
		return (any || isVoronoiSource) && (bands || facets || isVoronoiSource);
	});

	let filteredTubes = $derived(filtered({ tubes, range }));

	// Flat, ordered band list for page mode: use the sort-index order when present,
	// else flatten filtered tubes in tube order.
	let pageBands = $derived.by((): ResolvedBand[] => {
		if (indexedBands) return indexedBands;
		return filteredTubes.flatMap((tube) => tube.bands.map((band) => ({ band, tube })));
	});

	// Per-band layout values, each computed once per pass and keyed by band identity.
	// Stable object identity here is what keeps BandComponent from re-rendering on
	// view-only changes: a fresh `pivot` object per render used to invalidate every band.
	let bandList = $derived(pageBands.map(({ band }) => band));
	let boundsIndex = $derived(buildEffectiveBoundsIndex(bandList, boundsContext()));
	let pivots = $derived(buildPivotIndex(bandList, boundsIndex));
	let tagAnchors = $derived(buildTagAnchorIndex(bandList));

	let pageResult = $derived.by((): PageLayoutResult | undefined => {
		if (layoutMode !== 'page' || !pageLayoutCfg) return undefined;
		const items = toLayoutItems(pageBands);
		// Use the single shared gap so all three layout modes stay consistent.
		const geom = { ...buildPageGeom(pageLayoutCfg), gap };
		const algo = PAGE_LAYOUT_ALGORITHMS[pageLayoutCfg.algorithm];
		return algo(items, geom);
	});

	// Publish the page count to the Page Layout editor. Guard on a value key so we
	// only write when it actually changes — an unconditional store write here
	// re-enters the reactive flush and trips effect_update_depth_exceeded.
	let lastPageInfoKey = '';
	$effect(() => {
		const pageCount = pageResult?.pages.length ?? 0;
		const overflow = !!pageResult?.overflow;
		const key = `${pageCount}:${overflow}`;
		if (key === lastPageInfoKey) return;
		lastPageInfoKey = key;
		pageLayoutInfoStore.set({ pageCount, overflow });
	});

	// Line-wrap is on in line-wrap mode, and also as the page-mode overflow fallback:
	// when a pattern is too large to fit a page we drop pages but still wrap, so
	// patterns stay visible without running off in one infinite row.
	let lineWrap = $derived(
		layoutMode === 'line-wrap' || (layoutMode === 'page' && !!pageResult?.overflow)
	);

	let origins = $derived(getCumulativeOrigins(filteredTubes, gap, 'center', lineWrap, wrapWidth));
	let flatOrigins = $derived(
		indexedBands ? getFlatOrigins(indexedBands, gap, 'center', lineWrap, wrapWidth) : undefined
	);

	// Raise a fit-error toast (with a scale-fixing action) when a pattern overflows.
	let lastOverflowKey = '';
	$effect(() => {
		const ov = pageResult?.overflow;
		if (!ov) {
			lastOverflowKey = '';
			return;
		}
		const key = `${ov.itemIndex}:${ov.requiredScale.toFixed(4)}`;
		if (key === lastOverflowKey) return;
		lastOverflowKey = key;
		// Round UP: a nearest-rounded value can land a hair under the required scale,
		// which leaves the pattern overflowing and makes "Fit page" look inert.
		const suggested = Math.ceil(ov.requiredScale * 10000) / 10000;
		toastStore.add({
			type: 'error',
			message: `A pattern is too large to fit the page. Increase pageScale to ~${suggested} to fit.`,
			dismissible: true,
			action: {
				label: 'Fit page',
				onClick: () => {
					$patternConfigStore.patternConfig.pageLayout.pageScale = suggested;
				}
			}
		});
	});

	let usePageLayout = $derived(layoutMode === 'page' && !!pageResult && !pageResult.overflow);
</script>

{#if showPattern}
	{#if usePageLayout && pageResult}
		<PageGeometry pages={pageResult.pages} />
		{#each pageBands as { band, tube }, i (concatAddress(band.address))}
			<BandComponent
				{band}
				{tube}
				index={i}
				origin={pageResult.origins[i]}
				rotation={pageResult.rotations[i] ?? 0}
				pivot={pivots.get(band)}
				portal={true}
				tagAnchorPoint={tagAnchors.get(band)!}
				tagAngle={band.tagAngle}
				groupCode={groupCodeFor(band.address)}
				showBounds={false}
				{selectionTarget}
			>
				{#if band.projectionType === 'patterned'}
					<BandCutPatternComponent
						{band}
						renderAsSinglePath={true}
						highlightFirstFacet={false}
						partnerBands={getPartnerBands(band, tubes)}
						showQuadLabels={false}
						showPathPointIndices={false}
						partnerFacets={[
							band.meta?.translatedStartPartnerFacet,
							band.meta?.translatedEndPartnerFacet
						].filter((el) => el !== undefined)}
						showPartnerBands={false}
						showAdjacentFacets={false}
						showBounds={false}
					/>
				{/if}
			</BandComponent>
		{/each}
	{:else if indexedBands && flatOrigins}
		{#each indexedBands as { band, tube }, i (concatAddress(band.address))}
			<BandComponent
				{band}
				{tube}
				index={i}
				origin={flatOrigins[i]}
				portal={true}
				tagAnchorPoint={tagAnchors.get(band)!}
				tagAngle={band.tagAngle}
				groupCode={groupCodeFor(band.address)}
				showBounds={false}
				{selectionTarget}
			>
				{#if band.projectionType === 'patterned'}
					<BandCutPatternComponent
						{band}
						renderAsSinglePath={true}
						highlightFirstFacet={false}
						partnerBands={getPartnerBands(band, tubes)}
						showQuadLabels={false}
						showPathPointIndices={false}
						partnerFacets={[
							band.meta?.translatedStartPartnerFacet,
							band.meta?.translatedEndPartnerFacet
						].filter((el) => el !== undefined)}
						showPartnerBands={false}
						showAdjacentFacets={false}
						showBounds={false}
					/>
				{/if}
			</BandComponent>
		{/each}
	{:else}
		{#each filteredTubes || [] as tube, t}
			<g id={`${concatAddress(tube.address)}`}>
				{#each tube.bands || [] as band, b (concatAddress(band.address))}
					<BandComponent
						{band}
						{tube}
						index={b}
						origin={origins.tubes[t].bands[b]}
						portal={true}
						tagAnchorPoint={tagAnchors.get(band)!}
						tagAngle={band.tagAngle}
						groupCode={groupCodeFor(band.address)}
						showBounds={false}
						{selectionTarget}
					>
						{#if band.projectionType === 'patterned'}
							<BandCutPatternComponent
								{band}
								renderAsSinglePath={true}
								highlightFirstFacet={false}
								partnerBands={getPartnerBands(band, tubes)}
								showQuadLabels={false}
								showPathPointIndices={false}
								partnerFacets={[
									band.meta?.translatedStartPartnerFacet,
									band.meta?.translatedEndPartnerFacet
								].filter((el) => el !== undefined)}
								showPartnerBands={false}
								showAdjacentFacets={false}
								showBounds={false}
							/>
						{/if}
					</BandComponent>
				{/each}
			</g>
		{/each}
	{/if}
	<!-- <svg><g id={PATTERN_PORTAL_ID} /></svg> -->
	<svg id={LABEL_TAG_PORTAL_ID} />
	<svg id={LABEL_TEXT_PORTAL_ID} />
{/if}
