<script lang="ts">
	import type { BandCutPattern } from '$lib/types';

	let { bounds, showBounds = false }: { bounds: BandCutPattern['bounds']; showBounds?: boolean } =
		$props();
</script>

{#if showBounds && bounds}
	<g class="bounds">
		<rect x={bounds.left} y={bounds.top} width={bounds.width} height={bounds.height} />
	</g>
{/if}

<style>
	.bounds {
		fill: rgba(0, 0, 50, 0.6);
		stroke: none;
	}
</style>
