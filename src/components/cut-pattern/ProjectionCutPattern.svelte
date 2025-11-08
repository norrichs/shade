<script lang="ts">
	import {
		sliceProjectionCutPattern,
		sliceProjectionPanelPattern,
		type ProjectionRange
	} from '$lib/projection-geometry/filters';
	import {
		isSuperGlobuleProjectionCutPattern,
		patternConfigStore,
		viewControlStore,
		type SuperGlobuleProjectionPattern,
		concatAddress_Tube,
		concatAddress_Band,

		concatAddress

	} from '$lib/stores';
	import { Vector3 } from 'three';
	import type { CutPattern, TubeCutPattern } from '$lib/types';
	import BandComponent from './BandComponent.svelte';
	import BandCutPatternComponent from './BandCutPatternComponent.svelte';
	import QuadPattern from '../pattern-svg/QuadPattern.svelte';

	export let projectionPattern: SuperGlobuleProjectionPattern | undefined;

	$: range = $patternConfigStore.patternViewConfig.range;
	$: tubes = isSuperGlobuleProjectionCutPattern(projectionPattern)
		? projectionPattern.projectionCutPattern.tubes
		: [];

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

	const filtered = ({
		projectionPattern,
		range
	}: {
		projectionPattern?: SuperGlobuleProjectionPattern;
		range: ProjectionRange;
	}) => {
		if (!isSuperGlobuleProjectionCutPattern(projectionPattern)) return [];
		console.debug('filtered', { projectionPattern, range });
		const sliced = sliceProjectionCutPattern(projectionPattern.projectionCutPattern.tubes, range);
		console.debug('slicedTubes', { sliced });
		return sliced;
	};

	const update = (
		store: typeof $viewControlStore,
		tubes: TubeCutPattern[],
		range: ProjectionRange
	) => {
		if (!isSuperGlobuleProjectionCutPattern(projectionPattern)) tubes = [];

		const { any, bands, facets } = store.showProjectionGeometry;
		const isValid = isSuperGlobuleProjectionCutPattern(projectionPattern);
		showPattern = any && (bands || facets) && isValid;

		filteredTubes = filtered({ projectionPattern, range });
		origins = getCumulativeOrigins(tubes, 20);
		console.debug('update', tubes.length, { tubes, origins });
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
		<g id={`${concatAddress(tube.address)}`} >
			{#each tube.bands || [] as band, b (concatAddress(band.address))}
				<BandComponent
					{band}
					index={b}
					origin={origins.tubes[t].bands[b]}
					showLabel
					tagAnchorPoint={minPoint(band.facets)}
					tagAngle={band.tagAngle}
					showBounds={false}
				>
					{#if band.projectionType === 'patterned'}
						<QuadPattern
							{band}
							showQuads={$patternConfigStore.patternViewConfig.showQuads}
							showLabels={$patternConfigStore.patternViewConfig.showLabels}
						/>
						<BandCutPatternComponent {band} />
					{/if}
				</BandComponent>
			{/each}
		</g>
	{/each}
	<g id="label-text-container"></g>
{/if}
