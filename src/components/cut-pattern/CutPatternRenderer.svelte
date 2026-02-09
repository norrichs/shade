<script lang="ts">
	import {
		sliceProjectionCutPattern,
		type ProjectionRange
	} from '$lib/projection-geometry/filters';
	import { patternConfigStore, viewControlStore } from '$lib/stores';
	import { Vector3 } from 'three';
	import type { BandCutPattern, CutPattern, Point, PointConfig2, TubeCutPattern } from '$lib/types';
	import BandComponent from './BandComponent.svelte';
	import BandCutPatternComponent from './BandCutPatternComponent.svelte';
	import QuadPattern from '../pattern-svg/QuadPattern.svelte';
	import type { GlobuleAddress_Band, TransformConfig, Tube } from '$lib/projection-geometry/types';
	import { getTransform } from './distrubute-panels';
	import { concatAddress, isSameAddress } from '$lib/util';
	import { PATTERN_PORTAL_ID, LABEL_TEXT_PORTAL_ID, LABEL_TAG_PORTAL_ID } from './constants';

	let {
		tubes = []
	}: {
		tubes?: TubeCutPattern[];
	} = $props();

	const GAP_BETWEEN_BANDS = 20;

	const getCumulativeOrigins = (
		tubes: TubeCutPattern[],
		gap: number = 20,
		verticalAlignment: 'top' | 'bottom' | 'center' = 'center'
	) => {
		const cumulativeOrigin = new Vector3(0, 0, 0);

		const origins = {
			tubes: tubes.map((tube) => ({
				bands: tube.bands.map((band) => {
					let y;
					switch (verticalAlignment) {
						case 'bottom':
							y = -(band.bounds?.height || 0);
							break;
						case 'center':
							y = -(band.bounds?.height || 0) / 2;
							break;
						case 'top':
							y = 0;
						default:
							y = 0;
					}
					const result = new Vector3(cumulativeOrigin.x, y, 0);
					const x = cumulativeOrigin.x + (band.bounds?.width || 0) + gap;

					cumulativeOrigin.set(x, y, 0);
					return result;
				})
			}))
		};

		return origins;
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
		const { showGlobuleTubeGeometry, showProjectionGeometry } = $viewControlStore;
		const any = showGlobuleTubeGeometry.any || showProjectionGeometry.any;
		const bands = showGlobuleTubeGeometry.bands || showProjectionGeometry.bands;
		const facets = showGlobuleTubeGeometry.facets || showProjectionGeometry.facets;
		return any && (bands || facets);
	});

	let filteredTubes = $derived(filtered({ tubes, range }));
	let origins = $derived(getCumulativeOrigins(filteredTubes, GAP_BETWEEN_BANDS, 'center'));
</script>

{#if showPattern}
	{#each filteredTubes || [] as tube, t}
		<g id={`${concatAddress(tube.address)}`}>
			{#each tube.bands || [] as band, b (concatAddress(band.address))}
				<BandComponent
					{band}
					index={b}
					origin={origins.tubes[t].bands[b]}
					showLabel
					portal={true}
					tagAnchorPoint={minPoint(band.facets)}
					tagAngle={band.tagAngle}
					showBounds={false}
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
	<!-- <svg><g id={PATTERN_PORTAL_ID} /></svg> -->
	<svg id={LABEL_TAG_PORTAL_ID} />
	<svg id={LABEL_TEXT_PORTAL_ID} />
{/if}
