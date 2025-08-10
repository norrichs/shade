<script lang="ts">
	import {
		isSuperGlobuleProjectionBandPattern,
		patternConfigStore,
		viewControlStore,
		type SuperGlobuleProjectionPattern
	} from '$lib/stores';
	import QuadPattern from '../pattern-svg/QuadPattern.svelte';
	import BandComponent from './BandComponent.svelte';
	import PatternedBand from './PatternedBand.svelte';

	export let projectionPattern: SuperGlobuleProjectionPattern | undefined;
</script>

{#if $viewControlStore.showProjectionGeometry.any && $viewControlStore.showProjectionGeometry.bands && isSuperGlobuleProjectionBandPattern(projectionPattern)}
	{#each projectionPattern.bandPatterns || [] as band, index}
		<BandComponent {band} {index} showLabel>
			{#if band.projectionType === 'patterned'}
				<PatternedBand {band} />
			{/if}
			<QuadPattern
				{band}
				showQuads={$patternConfigStore.patternViewConfig.showQuads}
				showLabels={$patternConfigStore.patternViewConfig.showLabels}
			/>
		</BandComponent>
	{/each}
{/if}
