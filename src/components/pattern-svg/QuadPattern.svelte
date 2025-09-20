<script lang="ts">
	import { svgQuad } from '$lib/patterns/quadrilateral';
	import { getMidPoint } from '$lib/patterns/utils';
	import type { BandCutPattern, CutPattern, Point, Quadrilateral } from '$lib/types';

	export let band: BandCutPattern;
	export let showQuads = false;
	export let showLabels = true;

	$: facets = band.facets
		.filter((facet) => !!facet.quad)
		.map((facet: CutPattern, i) => {
			const labelPoint =
				facet.quad === undefined ? { x: 0, y: 0 } : getMidPoint(facet.quad.p0, facet.quad.p2);
			return {
				label: facet.label,
				labelPoint,
				quad: facet.quad
			};
		}) as { label: string; labelPoint: Point; quad: Quadrilateral }[];
</script>

{#each facets as facet}
	<g class="svg-pattern-quad">
		<path
			d={svgQuad(facet.quad)}
			class={` ${showQuads ? 'show' : 'hide'}`}
			stroke="none"
			fill="none"
		/>
		{#if showLabels}<text
				stroke="none"
				font-size="10px"
				x={facet.labelPoint.x}
				y={facet.labelPoint.y}>{facet.label}</text
			>{/if}
		{#if showQuads}
			<g stroke="none">
				<circle cx={facet.quad.p0.x} cy={facet.quad.p0.y} r="2" fill="rgb(0,0,255)" />
				<circle cx={facet.quad.p1.x} cy={facet.quad.p1.y} r="2" fill="rgb(50,0,150)" />
				<circle cx={facet.quad.p2.x} cy={facet.quad.p2.y} r="2" fill="rgb(150,0,50)" />
				<circle cx={facet.quad.p3.x} cy={facet.quad.p3.y} r="2" fill="rgb(255,0,0)" />
			</g>
		{/if}
	</g>
{/each}

<style>
	.show {
		fill: black;
		opacity: 0.25;
	}
	.hide {
		fill: black;
		opacity: 0;
	}
</style>
