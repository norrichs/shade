<script lang="ts">
	import {
		sliceProjectionCutPattern,
		type ProjectionRange
	} from '$lib/projection-geometry/filters';
	import {
		patternConfigStore,
		viewControlStore,
		labelTextDimensions,
		pageLayoutInfoStore,
		splitBudgetStore,
		splitBudgetWanted,
		mergedBandPathsRaw,
		bandContourIndexes,
		mergedBandPaths,
		postProcessConfig,
		loadedConfigName,
		exportPagesStore
	} from '$lib/stores';
	import { computeSplitBudget, EMPTY_SPLIT_BUDGET } from '$lib/cut-pattern/split-budget';
	import { createOverflowNotifier } from '$lib/cut-pattern/page-overflow-notice';
	import {
		buildEffectiveBoundsIndex,
		buildPivotIndex,
		buildTagAnchorIndex,
		effectiveBoundsForBand,
		type EffectiveBoundsContext
	} from '$lib/cut-pattern/band-layout';
	import { Vector3 } from 'three';
	import { get } from 'svelte/store';
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
		PageLayoutConfig,
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
	import { buildBandCodeMap } from '$lib/cut-pattern/band-sort-index';
	import {
		resolveIndexBands,
		groupCodeForBand,
		type ResolvedBand
	} from '$lib/cut-pattern/resolve-index-bands';
	import PageGeometry from './PageGeometry.svelte';
	import { buildPageGeom, PAGE_LAYOUT_ALGORITHMS } from '$lib/cut-pattern/page-layout/registry';
	import type { LayoutItem, PageLayoutResult } from '$lib/cut-pattern/page-layout/types';
	import { toastStore } from '$lib/stores/toastStore';
	import { placeBand } from '$lib/cut-pattern/page-post-process/place-bands';
	import { pagePostProcess } from '$lib/cut-pattern/page-post-process';
	import type { GlyphDict } from '$lib/cut-pattern/page-post-process/page-label';
	import PageAnnotations from './PageAnnotations.svelte';
	import { svgTextDictionary } from './SvgText/svg-text-store';
	import { processSvg } from './SvgText/svg-text';
	import Fonts from './SvgText/fonts';

	let {
		tubes = [],
		sortIndex,
		selectionTarget = 'projection'
	}: {
		tubes?: TubeCutPattern[];
		sortIndex?: BandSortIndex;
		selectionTarget?: PatternSource;
	} = $props();

	let indexedBands = $derived(sortIndex ? resolveIndexBands(tubes, sortIndex) : undefined);

	let codeMap = $derived(sortIndex ? buildBandCodeMap(sortIndex) : undefined);
	const groupCodeFor = (address: GlobuleAddress_Band) => groupCodeForBand(codeMap, address);

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
	// Page Layout controls (and the overflow toast's "Fit page") mutate
	// `pageLayout` IN PLACE, so the store re-emits the same object reference and
	// a plain `$derived` of it would never invalidate the layout. Key on its JSON
	// instead: a fresh copy only when a value really changed, so unrelated config
	// emissions (zoom, pan) still do not re-run the layout.
	let pageLayoutJson = $derived(
		JSON.stringify($patternConfigStore.patternConfig.pageLayout ?? null)
	);
	let pageLayoutCfg = $derived(JSON.parse(pageLayoutJson) as PageLayoutConfig | null);
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

	// The per-piece length budget and overflow preconditions the Splits panel
	// gates Auto-split on. Computed here because only this component has the
	// EFFECTIVE bounds the layout measures — geometry plus the external self-tag
	// footprint (`toLayoutItems` builds its items from the same index) — so the
	// panel cannot disagree with the layout about what overflows.
	//
	// Measured over EVERY collated band, not `pageBands`: `pageBands` is
	// range-sliced, while the panel proposes splits over every collated tube. A
	// sliced measurement would (a) call a tube outside the range non-overflowing
	// and grey out Auto-split, and (b) miss a taller tag footprint out there,
	// making `perPieceFootprint` — a MAX — too small and the budget over-promise,
	// which is the under-subtraction the solver cannot detect.
	//
	// Computed in every layout mode, not just `page`: the page size is configured
	// either way, and splits are not a page-mode-only feature. Skipped entirely
	// while nothing reads the budget (see `splitBudgetWanted`), because bands
	// outside the range are not in `boundsIndex` and cost a fresh measurement.
	let splitBudget = $derived.by(() => {
		if (!pageLayoutCfg || !$splitBudgetWanted) return EMPTY_SPLIT_BUDGET;
		const geom = buildPageGeom(pageLayoutCfg);
		const ctx = boundsContext();
		return computeSplitBudget(
			tubes.flatMap((tube) =>
				tube.bands.map((band) => {
					// Reuse the render pass's measurement where there is one; only a
					// band outside the rendered range is measured again here.
					const eff = boundsIndex.get(band) ?? effectiveBoundsForBand(band, ctx);
					return {
						width: eff?.width ?? 0,
						height: eff?.height ?? 0,
						rawHeight: band.bounds?.height ?? 0
					};
				})
			),
			{
				contentWidth: geom.contentWidth,
				contentHeight: geom.contentHeight,
				// Only skyline minimises over orientations; flex-wrap ignores the flag.
				allowRotation: pageLayoutCfg.algorithm === 'skyline' && !!pageLayoutCfg.allowRotation
			}
		);
	});

	// Same value-key guard as the page info above, for the same reason.
	let lastSplitBudgetKey = '';
	$effect(() => {
		const b = splitBudget;
		const key = `${b.measured}:${b.perPieceFootprint.toFixed(3)}:${b.pieceLengthBudget.toFixed(3)}:${b.lengthOverflow}:${b.widthBlocked}`;
		if (key === lastSplitBudgetKey) return;
		lastSplitBudgetKey = key;
		splitBudgetStore.set(b);
	});

	// A budget only means anything while the renderer that measured it is mounted.
	// Without this, unmounting the pattern pane with the Splits panel open leaves
	// the last budget published: change `pageScale`, click Auto-split, and the
	// proposals are sized against a page that no longer exists. Clearing it makes
	// Auto-split read "no bands measured" until a renderer publishes again.
	$effect(() => {
		return () => {
			lastSplitBudgetKey = '';
			splitBudgetStore.set(EMPTY_SPLIT_BUDGET);
		};
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

	// Raise a fit-error toast (with a scale-fixing action) when a pattern
	// overflows — and take it down again when it stops. The notifier owns the
	// replace-and-clear bookkeeping (`page-overflow-notice.ts`), the same shape
	// the dropped-splits notifier uses; the effect only reports the latest state.
	const notifyOverflow = createOverflowNotifier({
		add: toastStore.add,
		remove: toastStore.remove,
		applyScale: (scale) => {
			$patternConfigStore.patternConfig.pageLayout.pageScale = scale;
		}
	});
	$effect(() => {
		notifyOverflow(pageResult?.overflow);
	});

	let usePageLayout = $derived(layoutMode === 'page' && !!pageResult && !pageResult.overflow);

	// Stage 3 needs the same font dictionary SvgText lazily builds; build it here
	// if no label has rendered yet.
	if (!get(svgTextDictionary)) {
		svgTextDictionary.set(
			processSvg(Fonts.reliefSingleLine.keyString, Fonts.reliefSingleLine.svgString)
		);
	}
	// The processed font dictionary is a superset of what stage 3 reads.
	let glyphDict: GlyphDict | undefined = $derived($svgTextDictionary);
	let configName = $derived($loadedConfigName);

	// Stage 3: disconnects and page labels. Only prepared bands in a page layout
	// have final placement. Memoised by $derived on its inputs; view-only changes
	// (zoom, pan) do not touch any of them.
	let stage3 = $derived.by(() => {
		if (!usePageLayout || !pageResult || !pageLayoutCfg || $mergedBandPaths.size === 0) return null;
		const config = $postProcessConfig;
		const wantsLabel =
			!!config.pageLabel &&
			(config.pageLabel.pageNumber || config.pageLabel.configName || !!config.pageLabel.text);
		if (!config.disconnectSurround && !wantsLabel) return null;
		const pages = pageResult.pages;
		const bands = pageBands.flatMap(({ band }, i) => {
			const raw = $mergedBandPathsRaw.get(band.id);
			const index = $bandContourIndexes.get(band.id);
			const pieces = $mergedBandPaths.get(band.id);
			if (!raw || !index || !pieces) return [];
			return [
				placeBand({
					bandId: band.id,
					placement: {
						origin: pageResult.origins[i],
						rotation: pageResult.rotations[i] ?? 0,
						pivot: pivots.get(band) ?? { x: 0, y: 0 }
					},
					raw,
					index,
					pieces,
					pages
				})
			];
		});
		const geom = buildPageGeom(pageLayoutCfg);
		return pagePostProcess({
			bands,
			pages,
			pageScale: pageLayoutCfg.pageScale,
			marginPx: geom.marginPx,
			gap,
			config,
			configName,
			dict: glyphDict
		});
	});

	// Publish page rects for the exporters. Value-key guarded, as the page info
	// above. A layout with no pages (flex-wrap over zero items, e.g. an empty
	// range slice) publishes null: there is nothing to frame an export with.
	let lastExportPagesKey = '';
	$effect(() => {
		const value =
			usePageLayout && pageResult && pageLayoutCfg && pageResult.pages.length > 0
				? { pages: pageResult.pages, pageScale: pageLayoutCfg.pageScale }
				: null;
		const key = JSON.stringify(value);
		if (key === lastExportPagesKey) return;
		lastExportPagesKey = key;
		exportPagesStore.set(value);
	});

	// Page rects only mean anything while the renderer that laid them out is
	// mounted — cleared on unmount, as the split budget is.
	$effect(() => {
		return () => {
			lastExportPagesKey = '';
			exportPagesStore.set(null);
		};
	});

	// One toast per distinct set of pages whose label found no room.
	let lastUnplacedKey = '';
	$effect(() => {
		const unplaced = stage3?.pageLabels.filter((l) => l.unplaced).map((l) => l.page + 1) ?? [];
		const key = unplaced.join(',');
		if (key === lastUnplacedKey) return;
		lastUnplacedKey = key;
		if (unplaced.length)
			toastStore.add({ type: 'warning', message: `No room for the page label on page ${key}.` });
	});
</script>

{#if showPattern}
	{#if usePageLayout && pageResult}
		<PageGeometry pages={pageResult.pages} />
		<g id="cut-pattern">
			{#each pageBands as { band, tube }, i (concatAddress(band.address))}
				<BandComponent
					{band}
					{tube}
					{tubes}
					index={i}
					origin={pageResult.origins[i]}
					rotation={pageResult.rotations[i] ?? 0}
					pivot={pivots.get(band)}
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
		{#if stage3}
			<PageAnnotations result={stage3} />
		{/if}
	{:else if indexedBands && flatOrigins}
		<g id="cut-pattern">
			{#each indexedBands as { band, tube }, i (concatAddress(band.address))}
				<BandComponent
					{band}
					{tube}
					{tubes}
					index={i}
					origin={flatOrigins[i]}
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
	{:else}
		{#each filteredTubes || [] as tube, t}
			<g id={`${concatAddress(tube.address)}`}>
				{#each tube.bands || [] as band, b (concatAddress(band.address))}
					<BandComponent
						{band}
						{tube}
						{tubes}
						index={b}
						origin={origins.tubes[t].bands[b]}
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
{/if}
