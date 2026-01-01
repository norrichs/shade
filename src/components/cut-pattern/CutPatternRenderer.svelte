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

	// export let projectionPattern: SuperGlobuleProjectionPattern | undefined;
	export let tubes: TubeCutPattern[] = [];

	$: range = $patternConfigStore.patternViewConfig.range;
	let filteredTubes: TubeCutPattern[] = [];
	let origins: { tubes: { bands: Vector3[] }[] } = { tubes: [{ bands: [] }] };

	const getCumulativeOrigins = (tubes: TubeCutPattern[], gap: number = 20) => {
		const cumulativeOrigin = new Vector3(0, 0, 0);

		const origins = {
			tubes: tubes.map((tube) => ({
				bands: tube.bands.map((band) => {
					const result = cumulativeOrigin.clone();
					cumulativeOrigin.set(cumulativeOrigin.x + (band.bounds?.width || 0) + gap, 0, 0);
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
		origins = getCumulativeOrigins(tubes, 20);
	};

	let showPattern = false;

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

	$: update($viewControlStore, tubes, range);
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
					portal={false}
					tagAnchorPoint={minPoint(band.facets)}
					tagAngle={band.tagAngle}
					showBounds={false}
				>
					{#if band.projectionType === 'patterned'}
						<BandCutPatternComponent
							{band}
							renderAsSinglePath={false}
							highlightFirstFacet
							partnerBands={getPartnerBands(band, tubes)}
							showQuadLabels
						/>
					{/if}
				</BandComponent>
			{/each}
		</g>
	{/each}
	<g id="label-text-container" />
{/if}
