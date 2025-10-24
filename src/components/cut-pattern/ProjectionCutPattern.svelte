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
		concatAddress_Band
	} from '$lib/stores';
	import { Vector3 } from 'three';
	import type { TubeCutPattern } from '$lib/types';
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
	console.debug('ProjectionCutPattern', projectionPattern);


	const getCumulativeOrigins = (tubes: TubeCutPattern[]) => {
		const cumulativeOrigin = new Vector3(0, 0, 0);

		return {
			tubes: tubes.map((tube) => ({
				bands: tube.bands.map((band) => {
					const result = cumulativeOrigin.clone();
					cumulativeOrigin.set(cumulativeOrigin.x + band.bounds?.width || 0, 0, 0);
					return result;
				})
			}))
		};
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
		origins = getCumulativeOrigins(tubes);
		console.debug('update', tubes.length, { tubes, origins });
	};

	let showPattern = false;

	$: update($viewControlStore, tubes, range);
</script>

{#if showPattern}
	{#each filteredTubes || [] as tube, t}
		<g id={`${concatAddress_Tube(tube.address)}`} transform={`translate(50, 130)`}>
			{#each tube.bands || [] as band, b}

				<BandComponent {band} index={b} origin={origins.tubes[t].bands[b]} showLabel>
					{#if band.projectionType === 'patterned'}
						<BandCutPatternComponent {band} />
					{/if}
					<QuadPattern
						{band}
						showQuads={$patternConfigStore.patternViewConfig.showQuads}
						showLabels={$patternConfigStore.patternViewConfig.showLabels}
					/>
				</BandComponent>
			{/each}
		</g>
	{/each}
{/if}
