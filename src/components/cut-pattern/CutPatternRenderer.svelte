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

	const nullTransform: TransformConfig = {
		translate: { x: 0, y: 0, z: 0 },
		scale: { x: 1, y: 1, z: 1 },
		rotate: { x: 0, y: 0, z: 0 }
	};

	const getEndPartnerTransform = (
		originBand: BandCutPattern,
		partnerBand: BandCutPattern
	): TransformConfig => {
		const isStartOrigin =
			originBand.meta?.startPartnerBand &&
			isSameAddress(originBand.meta?.startPartnerBand, partnerBand.address);

		const isStartPartner =
			partnerBand.meta?.startPartnerBand &&
			isSameAddress(partnerBand.meta?.startPartnerBand, originBand.address);
		const originPair = isStartOrigin
			? [originBand.facets[0].quad?.b, originBand.facets[0].quad?.a]
			: [
					originBand.facets[originBand.facets.length - 1].quad?.d,
					originBand.facets[originBand.facets.length - 1].quad?.c
			  ];

		if (originBand.sideOrientation && originBand.sideOrientation === 'inside') originPair.reverse();

		if (!originPair[0] || !originPair[1]) return nullTransform;
		const partnerPair = isStartPartner
			? [partnerBand.facets[0].quad?.a, partnerBand.facets[0].quad?.b]
			: [
					partnerBand.facets[partnerBand.facets.length - 1].quad?.d,
					partnerBand.facets[partnerBand.facets.length - 1].quad?.c
			  ];
		if (partnerBand.sideOrientation && partnerBand.sideOrientation === 'inside')
			partnerPair.reverse();
		if (!partnerPair[0] || !partnerPair[1]) return nullTransform;
		console.debug('getEndPartnerTransform', {
			originIsInside: originBand.sideOrientation && originBand.sideOrientation === 'inside',
			partnerIsInside: partnerBand.sideOrientation && partnerBand.sideOrientation === 'inside',
			originPair,
			partnerPair
		});

		// Calculate the angle of each edge
		const originAngle = Math.atan2(
			originPair[1].y - originPair[0].y,
			originPair[1].x - originPair[0].x
		);
		const partnerAngle =
			Math.atan2(partnerPair[1].y - partnerPair[0].y, partnerPair[1].x - partnerPair[0].x) +
			(isStartPartner ? 0 : Math.PI);

		// Rotation needed to align partner edge with origin edge
		const rotation = originAngle - partnerAngle;

		// Calculate where the partner point ends up after rotation around origin (0,0)
		// Then translate to align with originPair[0]
		const cos = Math.cos(rotation);
		const sin = Math.sin(rotation);
		const partnerPoint = isStartPartner ? partnerPair[0] : partnerPair[1];
		const rotatedPartnerX = partnerPoint.x * cos - partnerPoint.y * sin;
		const rotatedPartnerY = partnerPoint.x * sin + partnerPoint.y * cos;

		const xOffset = originPair[0].x - rotatedPartnerX;
		const yOffset = originPair[0].y - rotatedPartnerY;

		return {
			translate: { x: xOffset, y: yOffset, z: 0 },
			scale: { x: 1, y: 1, z: 1 },
			rotate: { x: 0, y: 0, z: (rotation * 180) / Math.PI }
		};
	};

	const getPartnerBands = (
		originBand: BandCutPattern,
		tubes: TubeCutPattern[],
		addresses: (GlobuleAddress_Band | undefined)[]
	): { transform: TransformConfig; band: BandCutPattern }[] => {
		const partnerBands: BandCutPattern[] = [];
		addresses.forEach((a) => {
			if (a) partnerBands.push(tubes[a.tube].bands[a.band]);
		});

		return partnerBands.map((band) => ({
			transform: getEndPartnerTransform(originBand, band),
			band
		}));
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
							partnerBands={getPartnerBands(band, tubes, [
								band.meta?.endPartnerBand,
								band.meta?.startPartnerBand
							])}
							showQuadLabels
						/>
					{/if}
				</BandComponent>
			{/each}
		</g>
	{/each}
	<g id="label-text-container" />
{/if}
