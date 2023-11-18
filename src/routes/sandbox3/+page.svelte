<script lang="ts">
	import { flatten } from '$lib/flatten/flatten copy2';
	import { onMount } from 'svelte';
	import CombinedNumberInput from '../../components/controls/CheckboxInput.svelte';
	import { T } from '@threlte/core';
	import {
		generateUnitFlowerOfLifeTriangle,
		getTransformStringFromTriangle,
		svgTriangle,
		svgUnitFlowerOfLife
	} from '$lib/patterns/flower-of-life';
	import { identity } from 'svelte/internal';
	import type {
		BandTesselationConfig,
		FlowerOfLifeConfig
	} from '$lib/patterns/flower-of-life.types';

	onMount(() => {
		// flattenAll();
	});

	const flattenAll = () => {
		flatten(document.getElementById('sandbox3-svg'));
	};
	const unitTriangle = {
		a: { x: 0, y: 0 },
		b: { x: 100, y: 0 },
		c: { x: 50, y: Math.sqrt(100 ** 2 - 50 ** 2) }
	};
	const tHeight = unitTriangle.c.y;
	const tWidth = unitTriangle.b.x;

	const showUnitGrid = false;
	const showMatched = true;
	const showBandTriangles = false;
	let circleWidth = 5;
	const offset1 = -30;
	const offset2 = -170;
	const offset3 = 200;

	let flowerConfig: BandTesselationConfig = {
		type: 'matched',
		mode: 'layout',
		tiles: [
			[
				{
					type: 'matched',
					width: 5,
					triangle: {
						a: { x: 0, y: 0 },
						b: { x: 300, y: 0 + offset1 },
						c: { x: 150 + offset2, y: 200 }
					}
				},
				{
					type: 'matched',
					width: 5,
					triangle: {
						a: { x: 450, y: 200 + offset1 },
						b: { x: 150 + offset2, y: 200 },
						c: { x: 300, y: 0 + offset1 }
					}
				}
			],
			[
				{
					type: 'matched',
					width: 5,
					triangle: {
						a: { x: 150 + offset2, y: 200 },
						b: { x: 450, y: 200 + offset1 },
						c: { x: 0 + offset2 + offset3, y: 400 }
					}
				},
				{
					type: 'matched',
					width: 5,
					triangle: {
						a: { x: 500, y: 400 },
						b: { x: 0 + offset2 + offset3, y: 400 },
						c: { x: 450, y: 200 + offset1 }
					}
				}
			]
		]
	};
	$: unitFlowerOfLifeTriangle = generateUnitFlowerOfLifeTriangle(
		{ type: 'specified', width: circleWidth },
		{ x: 0, y: 0 }
	);
</script>

<section class="control-row">
	<CombinedNumberInput bind:value={circleWidth} label="circle width" min={0} max={20} />
	<button on:click={flattenAll}>Flatten</button>
</section>

<svg id="sandbox3-svg" width="1000" height="1000" viewBox="-200 -200 1000 1000">
	{#if flowerConfig.type === 'matched' && showBandTriangles}
		<g fill="rgba(100,100,200,0.2)" stroke="rgba(255,0,0,0.5" stroke-width="0.5">
			{#if flowerConfig.type === 'matched'}
				{#each flowerConfig.tiles as row}
					<path d={svgTriangle(row[0].triangle)} />
					<path d={svgTriangle(row[1].triangle)} />
				{/each}
			{/if}
		</g>
	{/if}

	{#if showMatched}
		<g fill="rgba(200, 105, 10, 0.2" stroke="rgba(0,0,0,0.2)">
			{#each flowerConfig.tiles as row}
				{#each row as t, i}
					<path
						d={svgUnitFlowerOfLife(unitFlowerOfLifeTriangle)}
						transform={getTransformStringFromTriangle(t, i % 2 === 0)}
						fill-rule="evenodd"
					/>
				{/each}
			{/each}
		</g>
	{/if}

	{#if showUnitGrid}
		{#each tx as t (t.id)}
			<path
				id={`fol-${t.id}`}
				d={svgUnitFlowerOfLife()}
				stroke="black"
				fill="rgba(255, 100, 100, 0.5"
				transform={`
          translate(${t.anchor.x} ${t.anchor.y})
          rotate(${t.rotate})
          scale(${t.scaleX} ${t.scaleY})
          skewX(${t.skewX})
      `}
			/>
		{/each}
	{/if}
</svg>

<style>
	.control-row {
		width: 100%;
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
	}
</style>
