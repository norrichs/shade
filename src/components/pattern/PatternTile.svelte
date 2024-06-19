<script lang="ts">
	import { svgPathStringFromSegments } from '$lib/patterns/flower-of-life';
	import { patterns } from '$lib/patterns/patterns';
	import { scalePS } from '$lib/patterns/utils';

	export let patternType: string;
	export let width = 100;
	export let height = 100;
	export let rows: 1 | 2 | 3 = 1;
	export let columns: 1 | 2 | 3 | 4 | 5 = 1;
	export let active = false;

	const getPath = (patternType: string) => {
		const { getUnitPattern } = patterns[patternType];
		const unitPattern = getUnitPattern(rows, columns);
		const path = svgPathStringFromSegments(scalePS(unitPattern, Math.max(width, height)));
		return path;
	};

	$: tilePath = getPath(patternType);
</script>

<div class:active>
	<svg {width} {height} viewBox={`0 0 ${width} ${height}`}>
		<path
			d={tilePath}
			fill="none"
			stroke="black"
			stroke-width="2"
			stroke-linejoin="round"
			stroke-linecap="round"
		/>
	</svg>
</div>

<style>
	div {
		height: fit-content;
		padding: 8px;
		border-radius: 4px;
		border: 1px solid gray;
	}
	div:hover {
		background-color: deepskyblue;
	}
	.active {
		background-color: deepskyblue;
	}
	svg {
		overflow: visible;
	}
</style>
