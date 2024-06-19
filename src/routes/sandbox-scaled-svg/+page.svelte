<script lang="ts">
	import { show_svg } from '$lib/util';
	// @ts-expect-error
	import outline from 'svg-path-outline';
	import PatternLabels from '../../components/cut-pattern/PatternLabels.svelte';
	import {
		generateLabelPath,
		getAngle,
		rotatePS,
		scalePS,
		transformPS,
		translatePS
	} from '$lib/patterns/utils';
	import { svgPathStringFromSegments } from '$lib/patterns/flower-of-life';
	import type { PathSegment, Point } from '$lib/types';
	import CombinedNumberInput from '../../components/controls/CombinedNumberInput.svelte';

	const p0 = { x: 0, y: 0 };
	const p1 = { x: -100, y: 0 };

	let shape: PathSegment[] = [
		// ['M', p0.x, p0.y],
		// ['L', p1.x, p1.y]
		['M', -100, -100],
		['L', 100, -50],
		['Q', -100, 30, -10, 100],
		['L', -200, 100],
		['L', -100, -100],
		['Z']
	];

	let angle = 0;
	let translateX = 50;
	let translateY = 0;
	let scale = 1;

	$: derivedAngle = getAngle(p0, p1);
	$: transformed = transformPS(shape, {
		scale,
		angle: (angle * Math.PI) / 180,
		translateX,
		translateY
	});
</script>

<section>
	<button on:click={() => show_svg('test-svg')}> Download </button>
	<div>{(derivedAngle * 180) / Math.PI}</div>
	<CombinedNumberInput label="Angle" bind:value={angle} min={-360} max={360} step={1} />
	<CombinedNumberInput label="Translate X" bind:value={translateX} min={-500} max={500} step={1} />
	<CombinedNumberInput label="Translate Y" bind:value={translateY} min={-500} max={500} step={1} />
	<CombinedNumberInput label="Scale" bind:value={scale} min={0.01} max={100} step={0.01} />
	<svg id="test-svg" width={2000} height={2000} viewBox="-500 -500 2000 2000">
		<!-- <g fill-rule="evenodd" fill="rgba(0,0,0,0.1)" stroke="black" stroke-width="1">
			<path d={svgPathStringFromSegments(transformed)} />
			<circle cx={translateX} cy={translateY} r="5" fill="red" stroke="black" stroke-width="2" />
		</g> -->
		{#each [5, 30, 22, 143] as labelNumber, i}
			<path
				d={svgPathStringFromSegments(
					generateLabelPath(labelNumber, {
						scale,
						r: 20,
						origin: { x: (i + 1) * translateX, y: (i + 1) * translateY },
						angle: (angle * Math.PI) / 180
					})
				)}
				fill-rule="evenodd"
				fill="rgba(0,0,0,0.1)"
				stroke="black"
				stroke-width="0.5"
			/>
			<circle cx={(i + 1) * translateX} cy={(i + 1) * translateY} r="5" fill="red" stroke="black" />
		{/each}
	</svg>
</section>

<style>
	svg {
		background-color: dimgray;
	}
</style>
