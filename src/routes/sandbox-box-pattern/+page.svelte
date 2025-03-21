<script lang="ts">
	import { generateBoxPattern } from '$lib/patterns';
	import { transformPatternByQuad } from '$lib/patterns/quadrilateral';
	import { svgPathStringFromSegments } from '$lib/patterns/utils';
	import type { Quadrilateral } from '$lib/types';
	import CombinedNumberInput from '../../components/controls/CombinedNumberInput.svelte';

	let strokeWidth = 1;
	let rowCount = 1;
	let columnCount = 3;

	const quads: Quadrilateral[] = [
		{ p0: { x: 0, y: 0 }, p1: { x: 200, y: 0 }, p2: { x: 200, y: 120 }, p3: { x: 0, y: 100 } },
		{ p0: { x: 0, y: 100 }, p1: { x: 200, y: 120 }, p2: { x: 220, y: 190 }, p3: { x: 10, y: 170 } },
		{
			p0: { x: 10, y: 170 },
			p1: { x: 220, y: 190 },
			p2: { x: 170, y: 330 },
			p3: { x: -50, y: 310 }
		}
	];

	let boxPattern = generateBoxPattern({ size: 1, height: rowCount, width: columnCount });
	let mappedPatterns = quads.map((q) => transformPatternByQuad(boxPattern, q));
	$: {
		boxPattern = generateBoxPattern({ size: 1, height: rowCount, width: columnCount });
		mappedPatterns = quads.map((q) => transformPatternByQuad(boxPattern, q));
	}
</script>

<CombinedNumberInput bind:value={strokeWidth} min={0} max={20} step={0.1} label="Stroke" />
<CombinedNumberInput bind:value={rowCount} min={1} max={6} step={1} label="Row" />
<CombinedNumberInput bind:value={columnCount} min={1} max={6} step={1} label="Column" />
<div>
	<svg width="2000" height="1000" viewBox="-1000 -500 2000 1000">
		<rect width="100" height="100" fill="red" />
		{#each mappedPatterns as quad}
			<path
				d={svgPathStringFromSegments(quad)}
				fill="none"
				stroke="black"
				stroke-width={strokeWidth}
				stroke-linejoin="round"
			/>
		{/each}
	</svg>
</div>
