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

	let range = $derived($patternConfigStore.patternViewConfig.range);
	let filteredTubes: TubeCutPattern[] = $state([]);
	let origins: { tubes: { bands: Vector3[] }[] } = $state({ tubes: [{ bands: [] }] });
	let showPattern = $state(false);

	const getCumulativeOrigins = (
		tubes: TubeCutPattern[],
		gap: number = 20,
		verticalAlignment: 'top' | 'bottom' | 'center' = 'center'
	) => {
		const cumulativeOrigin = new Vector3(0, 0, 0);

		const origins = {
			tubes: tubes.map((tube) => ({
				bands: tube.bands.map((band) => {
					console.debug('band', band.bounds?.height);
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

					console.debug('y', y, verticalAlignment);
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
		return [
			{
				band: tubes[meta.startPartnerBand.tube].bands[meta.startPartnerBand.band],
				transform: meta.startPartnerTransform ?? IDENTITY_TRANSFORM
			},
			{
				band: tubes[meta.endPartnerBand.tube].bands[meta.endPartnerBand.band],
				transform: meta.endPartnerTransform ?? IDENTITY_TRANSFORM
			}
		];
	};

	const filtered = ({ tubes, range }: { tubes: TubeCutPattern[]; range: ProjectionRange }) => {
		const sliced = sliceProjectionCutPattern(tubes, range);
		return sliced;
	};

	const update = (
		store: typeof $viewControlStore,
		tubes: TubeCutPattern[],
		range: ProjectionRange
	) => {
		const { showGlobuleTubeGeometry, showProjectionGeometry } = store;
		const any = showGlobuleTubeGeometry.any || showProjectionGeometry.any;
		const bands = showGlobuleTubeGeometry.bands || showProjectionGeometry.bands;
		const facets = showGlobuleTubeGeometry.facets || showProjectionGeometry.facets;
		showPattern = any && (bands || facets);

		filteredTubes = filtered({ tubes, range });
		origins = getCumulativeOrigins(filteredTubes, GAP_BETWEEN_BANDS, 'center');
		console.debug('origins', origins);
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

	$effect(() => {
		update($viewControlStore, tubes, range);
	});
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
