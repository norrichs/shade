<script lang="ts">
	import type { PageRect } from '$lib/cut-pattern/page-layout/types';

	let { pages = [], marginPx = 0 }: { pages?: PageRect[]; marginPx?: number } = $props();
</script>

{#each pages as page, i (i)}
	<g class="page-geometry">
		<rect
			x={page.x}
			y={page.y}
			width={page.width}
			height={page.height}
			fill="#ffffff"
			stroke="#bbbbbb"
			stroke-width="1"
		/>
		{#if marginPx > 0}
			<rect
				x={page.x + marginPx}
				y={page.y + marginPx}
				width={page.width - 2 * marginPx}
				height={page.height - 2 * marginPx}
				fill="none"
				stroke="#dddddd"
				stroke-width="1"
				stroke-dasharray="6 6"
			/>
		{/if}
	</g>
{/each}
