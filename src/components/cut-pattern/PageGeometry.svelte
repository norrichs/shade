<script lang="ts">
	import type { PageRect } from '#lib/cut-pattern/page-layout/types.js';
	import {
		registrationMarkPath,
		registrationMarkRect
	} from '#lib/cut-pattern/page-layout/registration-mark.js';
	import { svgPathStringFromSegments } from '#lib/patterns/utils.js';
	import { layerStrokes } from '#lib/stores/index.js';

	let {
		pages = [],
		marginPx = 0,
		markSize
	}: {
		pages?: PageRect[];
		marginPx?: number;
		/** Registration-mark side in pattern units; absent when marks are off. */
		markSize?: number;
	} = $props();
</script>

{#each pages as page, i (i)}
	<g class="page-geometry">
		<rect
			x={page.x}
			y={page.y}
			width={page.width}
			height={page.height}
			fill="#ffffff"
			data-geometry="page-outline"
			stroke={$layerStrokes['page-outline']}
			stroke-width="1"
			vector-effect="non-scaling-stroke"
		/>
		{#if markSize}
			<path
				d={svgPathStringFromSegments(
					registrationMarkPath(registrationMarkRect(page, marginPx, markSize))
				)}
				data-geometry="registration-mark"
				fill="none"
				stroke={$layerStrokes['registration-mark']}
				stroke-width={1}
			/>
		{/if}
	</g>
{/each}
