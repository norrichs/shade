<script lang="ts">
	import type { PatternedBand } from '$lib/types';

	export let band: PatternedBand;
  export let index: number
</script>

<g transform={`translate(${-250 + 50 * index} -50) scale(-1,-1)`}>
	{#each band.facets as facet}
		<g fill="none" stroke-width={`${facet.strokeWidth || 1}`} stroke="black">
			<path d={facet.svgPath} stroke-linecap="round" stroke-linejoin="round" />
			<path
				d={facet.svgPath}
				stroke="red"
				stroke-linecap="round"
				stroke-linejoin="round"
				clip-path=""
			/>
		</g>
	{/each}
</g>
