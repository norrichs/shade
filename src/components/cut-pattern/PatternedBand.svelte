<script lang="ts">
	import type { PatternedBand } from '$lib/types';
	
	export let band: PatternedBand;
	
	const RAINBOW = false

	const colors = ['purple', 'blue', 'green', 'yellow', 'orange', 'red'];

</script>

{#each band.facets as facet, f}
	<path
		d={facet.svgPath}
		fill="none"
		stroke-linecap="round"
		stroke-linejoin="round"
		stroke-width={`${facet.strokeWidth || 1}`}
		stroke={RAINBOW ? colors[f % colors.length] : undefined}
	/>
{/each}
