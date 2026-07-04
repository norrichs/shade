<script lang="ts">
	import type { PageRect } from '$lib/cut-pattern/page-layout/types';

	let { pages = [] }: { pages?: PageRect[] } = $props();
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
	</g>
{/each}
