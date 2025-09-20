<script lang="ts">
	import type { BandCutPattern } from '$lib/types';

	export let band: BandCutPattern;

	const RAINBOW = false;
	const FILL_RAINBOW = true;

	const colors = ['purple', 'blue', 'green', 'yellow', 'orange', 'red'];
	console.debug('BandCutPattern', band);
</script>

{#each band.facets as facet, f}
	<path
		d={facet.svgPath}
		fill={FILL_RAINBOW ? colors[f % colors.length] : 'none'}
		stroke-linecap="round"
		stroke-linejoin="round"
		stroke-width={`${facet.strokeWidth || 1}`}
		stroke={RAINBOW ? colors[f % colors.length] : undefined}
	/>
{/each}
