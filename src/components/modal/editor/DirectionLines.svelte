<script lang="ts">
	import type { BezierConfig } from '$lib/types';

	let { curveDef, canvScale }: { curveDef: BezierConfig[]; canvScale: number } = $props();
</script>

{#each curveDef as curve}
	<line
		x1={curve.points[0].x}
		y1={curve.points[0].y}
		x2={curve.points[1].x}
		y2={curve.points[1].y}
		stroke="rgba(0,0,0,0.2)"
		stroke-width={2 * canvScale}
	/>

	<line
		x1={curve.points[2].x}
		y1={curve.points[2].y}
		x2={curve.points[3].x}
		y2={curve.points[3].y}
		stroke="rgba(0,0,0,0.2)"
		stroke-width={2 * canvScale}
	/>
{/each}
