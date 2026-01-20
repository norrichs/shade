<script lang="ts">
	import type { Band, BandCutPattern } from '$lib/types';

	export let bounds: BandCutPattern['bounds'];
	export let showBounds = false;
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
