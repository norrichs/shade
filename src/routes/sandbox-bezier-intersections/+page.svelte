<script lang="ts">
	import { getCubicBezierIntersection } from '$lib/util';
	import type { Intersector } from '$lib/util';
	import { CubicBezierCurve, Vector2 } from 'three';

	const w = 500;
	const h = 500;

	const getPathFromCubicBezier = (cb: CubicBezierCurve) => {
		const pathString = `
      M ${cb.v0.x} ${cb.v0.y}
      C ${cb.v1.x} ${cb.v1.y} ${cb.v2.x} ${cb.v2.y} ${cb.v3.x} ${cb.v3.y}
    `;
		console.debug('pathString', pathString);
		return pathString;
	};

	let intersector: Intersector = { dimension: 'y', value: 50 };
	let cubicBez = new CubicBezierCurve(
		new Vector2(0, 0),
		new Vector2(100, 100),
		new Vector2(100, 400),
		new Vector2(0, 500)
	);
	let intersectionPoints = getCubicBezierIntersection(cubicBez, intersector);
</script>

<section>
	<svg width={w} height={h} viewBox="-${w / 2} -${h / 2} ${w} ${h}">
		<g fill="none" stroke="green" stroke-width="2">
			<path d={`M 0 ${intersector.value} L 2000 ${intersector.value}`} />
			<path d={getPathFromCubicBezier(cubicBez)} />
		</g>
		<g>
			{#if Array.isArray(intersectionPoints)}
				{#each intersectionPoints as point}
					<circle cx={point.x} cy={point.y} r={4} />
				{/each}
			{:else if !!intersectionPoints}
				<circle cx={intersectionPoints.x} cy={intersectionPoints.y} r={4} />
			{/if}
		</g>
	</svg>
</section>

<style>
	svg {
		border: 1px solid black;
	}
</style>
