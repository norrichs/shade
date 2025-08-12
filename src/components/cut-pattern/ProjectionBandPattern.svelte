<script lang="ts">
	import {
		isSuperGlobuleProjectionBandPattern,
		patternConfigStore,
		viewControlStore,
		type SuperGlobuleProjectionPattern
	} from '$lib/stores';
	import type { PatternedBand } from '$lib/types';
	import QuadPattern from '../pattern-svg/QuadPattern.svelte';
	import BandComponent from './BandComponent.svelte';
	import PatternedBandComponent from './PatternedBand.svelte';

	export let projectionPattern: SuperGlobuleProjectionPattern | undefined;
	if (isSuperGlobuleProjectionBandPattern(projectionPattern)) {
		console.debug('PROJECTION BAND PATTERN', projectionPattern.bandPatterns, $viewControlStore);
	}
	const update = (
		store: typeof $viewControlStore,
		projectionPattern: SuperGlobuleProjectionPattern | undefined
	) => {
		const { any, bands, facets } = store.showProjectionGeometry;
		const isValid = isSuperGlobuleProjectionBandPattern(projectionPattern);
		showPattern = any && (bands || facets) && isValid;
		bandPatterns = isValid ? projectionPattern.bandPatterns : [];
	};

	let showPattern = false;
	let bandPatterns: PatternedBand[] = [];

	$: update($viewControlStore, projectionPattern);
</script>

{#if showPattern}
	{#each bandPatterns || [] as band, index}
		<BandComponent {band} {index} showLabel>
			{#if band.projectionType === 'patterned'}
				<PatternedBandComponent {band} />
			{/if}
			<QuadPattern
				{band}
				showQuads={$patternConfigStore.patternViewConfig.showQuads}
				showLabels={$patternConfigStore.patternViewConfig.showLabels}
			/>
		</BandComponent>
	{/each}
{/if}
