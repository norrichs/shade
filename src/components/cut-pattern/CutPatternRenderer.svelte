<script lang="ts">
	import {
		sliceProjectionCutPattern,
		type ProjectionRange
	} from '$lib/projection-geometry/filters';
	import { patternConfigStore, viewControlStore, labelTextDimensions } from '$lib/stores';
	import { buildSelfTagLines } from '$lib/cut-pattern/build-self-tag-lines';
	import { effectiveBandBounds } from '$lib/cut-pattern/label-footprint';
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
	import { concatAddress, isSameAddress } from '$lib/util';
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
	// to raw geometry bounds when the label isn't shown.
	const effBoundsFor = (band: BandCutPattern) => {
		const selfTagLines = buildSelfTagLines(
			concatAddress(band.address, 'tb-slash'),
			groupCodeFor(band.address),
			externalTagEnabled
		);
		return (
			effectiveBandBounds({
				band,
				labels: patternLabels,
				selfTagLines,
				measuredDims: measuredLabelDims
			}) ?? band.bounds
		);
	};

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
		const startTube = tubes[meta.startPartnerBand.tube];
		const endTube = tubes[meta.endPartnerBand.tube];
		if (!startTube || !endTube) return undefined;
		const startBand = startTube.bands[meta.startPartnerBand.band];
		const endBand = endTube.bands[meta.endPartnerBand.band];
		if (!startBand || !endBand) return undefined;
		return [
			{
				band: startBand,
				transform: meta.startPartnerTransform ?? IDENTITY_TRANSFORM
			},
			{
				band: endBand,
				transform: meta.endPartnerTransform ?? IDENTITY_TRANSFORM
			}
		];
	};

	const filtered = ({ tubes, range }: { tubes: TubeCutPattern[]; range: ProjectionRange }) => {
		const sliced = sliceProjectionCutPattern(tubes, range);
		return sliced;
	};

	const minPoint = (facets: CutPattern[]) => {
		let maxY: number = 0;
		let X: number = 0;
		facets.forEach((facet) =>
			facet.path.forEach((segment) => {
				if (segment[2] && segment[2] > maxY) {
					maxY = segment[2];
					X = segment[1] || 0;
				}
			})
		);
		return { x: X, y: maxY };
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

	let pageResult = $derived.by((): PageLayoutResult | undefined => {
		if (layoutMode !== 'page' || !pageLayoutCfg) return undefined;
		const items = toLayoutItems(pageBands);
		const geom = buildPageGeom(pageLayoutCfg);
		const algo = PAGE_LAYOUT_ALGORITHMS[pageLayoutCfg.algorithm];
		return algo(items, geom);
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
		const suggested = Number(ov.requiredScale.toFixed(4));
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

	let pageMarginPx = $derived(pageLayoutCfg ? buildPageGeom(pageLayoutCfg).marginPx : 0);
	let usePageLayout = $derived(layoutMode === 'page' && !!pageResult && !pageResult.overflow);
</script>

{#if showPattern}
	{#if usePageLayout && pageResult}
		<PageGeometry pages={pageResult.pages} marginPx={pageMarginPx} />
		{#each pageBands as { band, tube }, i (concatAddress(band.address))}
			<BandComponent
				{band}
				{tube}
				index={i}
				origin={pageResult.origins[i]}
				portal={true}
				tagAnchorPoint={band.tagAnchorPoint ?? minPoint(band.facets)}
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
				tagAnchorPoint={band.tagAnchorPoint ?? minPoint(band.facets)}
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
						tagAnchorPoint={band.tagAnchorPoint ?? minPoint(band.facets)}
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
