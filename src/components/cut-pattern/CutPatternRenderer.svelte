<script lang="ts">
	import {
		sliceProjectionCutPattern,
		type ProjectionRange
	} from '$lib/projection-geometry/filters';
	import { patternConfigStore, viewControlStore } from '$lib/stores';
	import { Vector3 } from 'three';
	import type { BandCutPattern, BandSortIndex, CutPattern, Point, PointConfig2, TubeCutPattern } from '$lib/types';
	import BandComponent from './BandComponent.svelte';
	import BandCutPatternComponent from './BandCutPatternComponent.svelte';
	import QuadPattern from '../pattern-svg/QuadPattern.svelte';
	import type { GlobuleAddress_Band, TransformConfig, Tube } from '$lib/projection-geometry/types';
	import { getTransform } from './distrubute-panels';
	import { concatAddress, isSameAddress } from '$lib/util';
	import { PATTERN_PORTAL_ID, LABEL_TEXT_PORTAL_ID, LABEL_TAG_PORTAL_ID } from './constants';

	let {
		tubes = [],
		sortIndex,
		selectionTarget = 'projection'
	}: {
		tubes?: TubeCutPattern[];
		sortIndex?: BandSortIndex;
		selectionTarget?: string;
	} = $props();

	type ResolvedBand = { band: BandCutPattern; tube: TubeCutPattern };

	const resolveBandWithTube = (ref: { globule: number; tube: number; band: number }): ResolvedBand | undefined => {
		const tube = tubes.find((t) => t.address.tube === ref.tube && t.address.globule === ref.globule);
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

	const GAP_BETWEEN_BANDS = 20;

	const alignedY = (band: BandCutPattern, verticalAlignment: 'top' | 'bottom' | 'center') => {
		switch (verticalAlignment) {
			case 'bottom':
				return -(band.bounds?.height || 0);
			case 'center':
				return -(band.bounds?.height || 0) / 2;
			case 'top':
			default:
				return 0;
		}
	};

	const getCumulativeOrigins = (
		tubes: TubeCutPattern[],
		gap: number = 20,
		verticalAlignment: 'top' | 'bottom' | 'center' = 'center'
	) => {
		const cumulativeOrigin = new Vector3(0, 0, 0);

		const origins = {
			tubes: tubes.map((tube) => ({
				bands: tube.bands.map((band) => {
					const y = alignedY(band, verticalAlignment);
					const result = new Vector3(cumulativeOrigin.x, y, 0);
					const x = cumulativeOrigin.x + (band.bounds?.width || 0) + gap;
					cumulativeOrigin.set(x, y, 0);
					return result;
				})
			}))
		};

		return origins;
	};

	const getFlatOrigins = (
		bands: ResolvedBand[],
		gap: number = 20,
		verticalAlignment: 'top' | 'bottom' | 'center' = 'center'
	): Vector3[] => {
		let x = 0;
		return bands.map(({ band }) => {
			const y = alignedY(band, verticalAlignment);
			const origin = new Vector3(x, y, 0);
			x += (band.bounds?.width || 0) + gap;
			return origin;
		});
	};

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

	let showPattern = $derived.by(() => {
		const { showGlobuleTubeGeometry, showProjectionGeometry, showVoronoiGeometry } =
			$viewControlStore;
		const any =
			showGlobuleTubeGeometry.any || showProjectionGeometry.any || showVoronoiGeometry.any;
		const bands =
			showGlobuleTubeGeometry.bands || showProjectionGeometry.bands || showVoronoiGeometry.bands;
		const facets =
			showGlobuleTubeGeometry.facets ||
			showProjectionGeometry.facets ||
			showVoronoiGeometry.facets;
		const isVoronoiSource =
			selectionTarget === 'voronoi' || selectionTarget === 'voronoiSurface';
		return (any || isVoronoiSource) && (bands || facets || isVoronoiSource);
	});

	let filteredTubes = $derived(filtered({ tubes, range }));
	let origins = $derived(getCumulativeOrigins(filteredTubes, GAP_BETWEEN_BANDS, 'center'));
	let flatOrigins = $derived(indexedBands ? getFlatOrigins(indexedBands, GAP_BETWEEN_BANDS, 'center') : undefined);
</script>

{#if showPattern}
	{#if indexedBands && flatOrigins}
		{#each indexedBands as { band, tube }, i (concatAddress(band.address))}
			<BandComponent
				{band}
				{tube}
				index={i}
				origin={flatOrigins[i]}
				portal={true}
				tagAnchorPoint={band.tagAnchorPoint ?? minPoint(band.facets)}
				tagAngle={band.tagAngle}
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
