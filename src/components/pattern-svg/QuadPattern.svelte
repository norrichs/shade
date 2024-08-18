<script lang="ts">
	import { svgQuad } from '$lib/patterns/quadrilateral';
	import type { PatternedBand, Quadrilateral } from '$lib/types';

	export let band: PatternedBand;
	$: quads = band.facets
		.filter((facet) => !!facet.quad)
		.map((facet) => facet.quad) as Quadrilateral[];
</script>

{#each quads as quad}
	<g>
		<path d={svgQuad(quad)} fill="black" opacity="0.2" stroke="black" stroke-width="0.5" />
		<circle cx={quad.p0.x} cy={quad.p0.y} r="2" fill="red" />
		<circle cx={quad.p1.x} cy={quad.p1.y} r="2" fill="green" />
		<circle cx={quad.p2.x} cy={quad.p2.y} r="2" fill="blue" />
		<circle cx={quad.p3.x} cy={quad.p3.y} r="2" fill="purple" />
	</g>
{/each}
