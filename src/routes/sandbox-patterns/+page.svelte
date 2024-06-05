<script lang="ts">
	import { svgPathStringFromSegments } from '$lib/patterns/flower-of-life';
	import { generateAuxetic } from '$lib/patterns/patterns';
	import type { PathSegment } from '$lib/types';
</script>

<section>
	<svg width="200" height="200" viewBox="-50 -50 200 200" class="pattern-svg">
		<g fill="none" stroke="black">
			<path d={svgPathStringFromSegments(generateAuxetic({ size: 1, rows: 2, columns: 3 }))} />
		</g>
	</svg>
</section>

<style>
	.pattern-svg {
		/* border: 1px solid blue; */
	}
</style>
