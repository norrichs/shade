<script lang="ts">
	import { svgTriangle } from '$lib/patterns/flower-of-life';
	import { svgQuad } from '$lib/patterns/quadrilateral';
	import { getMidPoint } from '$lib/patterns/utils';
	import type { BandCutPattern, CutPattern, Point, Quadrilateral } from '$lib/types';

	let {
		band,
		showQuads = false,
		showLabels = true,
		showTriangles = false
	}: {
		band: BandCutPattern;
		showQuads?: boolean;
		showLabels?: boolean;
		showTriangles?: boolean;
	} = $props();

	let facets = $derived(
		band.facets
			.filter((facet) => !!facet.quad)
			.map((facet: CutPattern, i) => {
				const labelPoint =
					facet.quad === undefined ? { x: 0, y: 0 } : getMidPoint(facet.quad.a, facet.quad.c);
				return {
					label: facet.label,
					labelPoint,
					quad: facet.quad,
					triangles: facet.triangles
				};
			}) as { label: string; labelPoint: Point; quad: Quadrilateral; triangles?: any }[]
	);
</script>

{#each facets as facet, facetIndex}
	<g class="svg-pattern-quad">
		<path
			d={svgQuad(facet.quad)}
			class={`${showQuads ? 'show' : 'hide'}${facetIndex % 2 === 1 ? ' odd' : ''}`}
			stroke="black"
			stroke-width={1}
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
				<circle cx={facet.quad.a.x} cy={facet.quad.a.y} r="2" fill="rgb(0,0,255)" />
				<circle cx={facet.quad.b.x} cy={facet.quad.b.y} r="2" fill="rgb(50,0,150)" />
				<circle cx={facet.quad.c.x} cy={facet.quad.c.y} r="2" fill="rgb(150,0,50)" />
				<circle cx={facet.quad.d.x} cy={facet.quad.d.y} r="2" fill="rgb(255,0,0)" />
			</g>
		{/if}
		{#if showTriangles && facet.triangles}
			<path d={svgTriangle(facet.triangles[0])} stroke="black" fill="rgba(0,255,0,0.1)" />
			<path d={svgTriangle(facet.triangles[1])} stroke="none" fill="rgba(255,0,0,0.1)" />
		{/if}
	</g>
{/each}

<style>
	.show {
		fill: black;
		opacity: 0.1;
	}
	.odd {
		fill: gray;
	}
	.hide {
		fill: black;
		opacity: 0;
	}
</style>
