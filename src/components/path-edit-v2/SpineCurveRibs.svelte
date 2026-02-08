<script lang="ts">
	import type { BezierConfig } from '$lib/types';
	import { spineCurveRibStore as ribs, curveStore } from './spineCurveRibStore';

	let { curves }: { curves: BezierConfig[] } = $props();

	$effect(() => {
		curveStore.set(curves);
	});
</script>

<g>
	{#each $ribs as rib}
		<circle cx={rib.anchor.x} cy={rib.anchor.y} r="5" fill="red" />
		<path
			d={`M ${rib.rib1.x} ${rib.rib1.y} L ${rib.anchor.x} ${rib.anchor.y} L ${rib.rib2.x} ${rib.rib2.y}`}
			stroke="black"
			stroke-width={3}
			fill="none"
		/>
	{/each}
</g>
