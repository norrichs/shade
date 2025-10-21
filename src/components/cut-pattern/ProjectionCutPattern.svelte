<script lang="ts">
	import {
		sliceProjectionPanelPattern,
		type ProjectionRange
	} from '$lib/projection-geometry/filters';
	import {
		isSuperGlobuleProjectionCutPattern,
		patternConfigStore,
		viewControlStore,
		superGlobulePatternStore,
		type SuperGlobuleProjectionPattern,
		type SuperGlobuleProjectionCutPattern,
		concatAddress_Tube,
		concatAddress_Band
	} from '$lib/stores';
	import { Vector3 } from 'three';
	import QuadPattern from '../pattern-svg/QuadPattern.svelte';
	import BandComponent from './BandComponent.svelte';
	import BandCutPatternComponent from './BandCutPatternComponent.svelte';
	import type { TubeCutPattern } from '$lib/types';

	export let projectionPattern: SuperGlobuleProjectionPattern | undefined;
	let tubes = isSuperGlobuleProjectionCutPattern(projectionPattern)
		? projectionPattern.projectionCutPattern.tubes
		: [];
	let origins: { tubes: { bands: Vector3[] }[] } = { tubes: [{ bands: [] }] };
	console.debug('ProjectionCutPattern', projectionPattern);
	// export let range: ProjectionRange = {};
	// export let showSelectedOnly: 'panel' | 'band' | false = false;

	const filtered = (
		store: typeof $superGlobulePatternStore,
		selectedGeometry: typeof $selectedProjectionGeometry,
		sliceRange: ProjectionRange = {}
	) => {
		console.debug('sliceRange', sliceRange, Object.keys(sliceRange).length > 0);
		const projectionPattern = store.projectionPattern;
		if (!isSuperGlobuleProjectionCutPattern(projectionPattern)) return null;
		const { bandPatterns } = projectionPattern as SuperGlobuleProjectionCutPattern;

		const pattern = sliceProjectionPanelPattern(projectionPanelPattern, sliceRange);

		// if (showSelectedOnly) {
		// 	if (!selectedGeometry) return pattern;
		// 	const filterFn = selectedGeometry.isSelectedOrPartner;
		// 	const filtered: ProjectionPanelPattern = {
		// 		...pattern,
		// 		tubes: pattern.tubes
		// 			.filter(({ address }) => filterFn(address))
		// 			.map((tube) => ({
		// 				...tube,
		// 				bands: tube.bands
		// 					.filter(({ address }) => filterFn(address))
		// 					.map((band) => ({
		// 						...band,
		// 						panels:
		// 							showSelectedOnly === 'panel'
		// 								? band.panels.filter(({ address }) => filterFn(address))
		// 								: band.panels
		// 					}))
		// 			}))
		// 	};
		// 	console.debug({ filtered });
		// 	return filtered;
		// }
		return pattern;
	};

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

	const updateTubes = (projectionPattern: SuperGlobuleProjectionPattern | undefined) => {
		if (!isSuperGlobuleProjectionCutPattern(projectionPattern)) tubes = [];
		else tubes = projectionPattern.projectionCutPattern.tubes;
	};
	const update = (
		store: typeof $viewControlStore,
		tubes: TubeCutPattern[]
	) => {
		const { any, bands, facets } = store.showProjectionGeometry;
		const isValid = isSuperGlobuleProjectionCutPattern(projectionPattern);
		showPattern = any && (bands || facets) && isValid;
		console.debug('update', { any, bands, facets, showPattern });

		origins = getCumulativeOrigins(tubes);
	};

	let showPattern = false;

	$: updateTubes($superGlobulePatternStore.projectionPattern);
	$: update($viewControlStore, tubes);
	$: show = isSuperGlobuleProjectionCutPattern($superGlobulePatternStore.projectionPattern);
	// $: pattern = filtered($superGlobulePatternStore.projectionPattern, range);
</script>

{#if showPattern}
	{#each tubes || [] as tube, t}
		<g id={`${concatAddress_Tube(tube.address)}`} transform={`translate(0, 0)`}>
			{#each tube.bands as band, b}
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
