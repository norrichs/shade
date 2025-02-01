<script lang="ts">
	import type { PatternedBand } from '$lib/types';
	
	export let band: PatternedBand;
</script>

{#each band.facets as facet}
	<path
		d={facet.svgPath}
		fill="none"
		stroke-linecap="round"
		stroke-linejoin="round"
		stroke-width={`${facet.strokeWidth || 1}`}
	/>
{/each}
