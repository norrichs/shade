<script lang="ts">
	import { svgPathStringFromSegments } from '$lib/patterns/flower-of-life';
	import { getPathSize, translatePS } from '$lib/patterns/utils';
	import type { PathSegment, Point } from '$lib/types';
	import { numberPathSegments } from './number-path-segments';

	export let values: number[] = [];
	export let offsetBy = { x: 0, y: 0 };

	type PathSegmentCharacter = 'M' | 'A' | 'Z' | 'L' | 'Q' | 'C';

	const isPathSegmentCharacter = (
		str: string | PathSegmentCharacter
	): str is PathSegmentCharacter => ['M', 'A', 'Z', 'L', 'Q', 'C'].includes(str);
</script>

{#each values as value, i}
	<g fill="red">
		<path
			d={geLabelPath(value, { r: 10, offset: { x: offsetBy.x * i, y: offsetBy.y * i } })}
			fill-rule="evenodd"
		/>
		<circle cx="0" cy="0" r="10" fill="black" />
	</g>
{/each}

<style>
	.small {
		line-height: 20px;
		font: san-serif;
		font-weight: 900;
	}
</style>
