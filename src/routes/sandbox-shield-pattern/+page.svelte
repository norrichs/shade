<script lang="ts">
	import { svgQuad, transformPatternByQuad } from '$lib/patterns/quadrilateral';
	import { generateShieldTesselationTile } from '$lib/patterns/tiled-shield-tesselation-pattern';
	import { svgPathStringFromSegments } from '$lib/patterns/utils';
	import type { Quadrilateral } from '$lib/types';
	import { Vector3 } from 'three';

	const quads: Quadrilateral[] = [
		{
			a: new Vector3(0, 0, 0),
			b: new Vector3(500, 0, 0),
			c: new Vector3(500, 500, 0),
			d: new Vector3(0, 500, 0)
		},
		{
			a: new Vector3(0, 500, 0),
			b: new Vector3(-500, 500, 0),
			c: new Vector3(-400, 800, 0),
			d: new Vector3(-100, 800, 0)
		}
	];

	const unitPattern = generateShieldTesselationTile({
		size: 1,
		rows: 1,
		columns: 1,
		variant: 'rect',
		sideOrientation: 'inside'
	});

	const invertedUnitPattern = generateShieldTesselationTile({
		size: 1,
		rows: 1,
		columns: 1,
		variant: 'rect',
		sideOrientation: 'outside'
	});

	const mapped = quads.map((quad, q) =>
		transformPatternByQuad(q === 0 ? unitPattern : invertedUnitPattern, quad)
	);
</script>

<div>
	<svg width={600} height={600} viewBox="-700 -200 1400 1400">
		{#each quads as quad, q}
			<g transform={`${q === 1 ? 'translate(500,0)' : undefined}`}>
				<path d={svgQuad(quad)} class="quad" />
				<path
					d={svgPathStringFromSegments(mapped[q])}
					class={`pattern ${q === 0 ? 'primary' : 'inverted'}`}
				/>
			</g>
		{/each}
	</svg>
</div>

<style>
	svg {
		border: 1px solid magenta;
	}
	.quad {
		fill: rgba(0, 0, 0, 0.1);
		stroke: black;
		stroke-width: 0.5;
	}
	.pattern {
		fill: none;
		stroke: black;
		stroke-width: 4px;
	}
	.inverted {
		stroke: red;
		stroke-width: 4px;
	}
</style>
