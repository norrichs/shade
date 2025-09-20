<script lang="ts">
	import { sliceProjectionPanelPattern, type ProjectionRange } from '$lib/projection-geometry/filters';
	import {
		isSuperGlobuleProjectionCutPattern,
		patternConfigStore,
		viewControlStore,
		superGlobulePatternStore,
		type SuperGlobuleProjectionPattern,
		type SuperGlobuleProjectionCutPattern
	} from '$lib/stores';
	import type { BandCutPattern } from '$lib/types';
	import QuadPattern from '../pattern-svg/QuadPattern.svelte';
	import BandComponent from './BandComponent.svelte';
	import BandCutPatternComponent from './BandCutPatternComponent.svelte';

	export let projectionPattern: SuperGlobuleProjectionPattern | undefined;
	export let range: ProjectionRange = {};
	export let showSelectedOnly: 'panel' | 'band' | false = false;

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
	const update = (
		store: typeof $viewControlStore,
		projectionPattern: SuperGlobuleProjectionPattern | undefined
	) => {
		const { any, bands, facets } = store.showProjectionGeometry;
		const isValid = isSuperGlobuleProjectionCutPattern(projectionPattern);
		showPattern = any && (bands || facets) && isValid;
		bandPatterns = isValid ? projectionPattern.bandPatterns : [];
	};

	let showPattern = false;
	let bandPatterns: BandCutPattern[] = [];

	$: update($viewControlStore, projectionPattern);
	$: show = isSuperGlobuleProjectionCutPattern($superGlobulePatternStore.projectionPattern);
	// $: pattern = filtered($superGlobulePatternStore.projectionPattern, range);
</script>

{#if showPattern}
	{#each bandPatterns || [] as band, index}
		<BandComponent {band} {index} showLabel>
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
{/if}
