<script lang="ts">
	import { generateBranched } from '$lib/patterns';
	import { tiledPatternConfigs } from '$lib/shades-config';
	import type { DynamicPathCollection, Quadrilateral } from '$lib/types';
	import CombinedNumberInput from '../../components/controls/CombinedNumberInput.svelte';
	import Outline from '../../components/pattern-svg/Outline.svelte';
	import PatternTile from '../../components/pattern/PatternTile.svelte';
	import { Vector3 } from 'three';

	let quadBand: Quadrilateral[] = [
		{
			a: new Vector3(0.4, 0, 0),
			d: new Vector3(0.3, 0.2, 0),
			c: new Vector3(0.7, 0.2, 0),
			b: new Vector3(0.6, 0, 0)
		},
		{
			a: new Vector3(0.3, 0.2, 0),
			d: new Vector3(0.25, 0.4, 0),
			c: new Vector3(0.75, 0.4, 0),
			b: new Vector3(0.7, 0.2, 0)
		},
		{
			a: new Vector3(0.25, 0.4, 0),
			d: new Vector3(0.25, 0.6, 0),
			c: new Vector3(0.75, 0.6, 0),
			b: new Vector3(0.75, 0.4, 0)
		},
		{
			a: new Vector3(0.25, 0.6, 0),
			d: new Vector3(0.3, 0.8, 0),
			c: new Vector3(0.7, 0.8, 0),
			b: new Vector3(0.75, 0.6, 0)
		},
		{
			a: new Vector3(0.3, 0.8, 0),
			d: new Vector3(0.4, 1, 0),
			c: new Vector3(0.6, 1, 0),
			b: new Vector3(0.7, 0.8, 0)
		}
	];
	quadBand = quadBand.map((quad) => {
		const scale = 500;
		return {
			a: quad.a.clone().multiplyScalar(scale),
			b: quad.b.clone().multiplyScalar(scale),
			c: quad.c.clone().multiplyScalar(scale),
			d: quad.d.clone().multiplyScalar(scale)
		};
	});

	const branchedPaths: DynamicPathCollection = generateBranched(quadBand, {
		rows: 1,
		columns: 1,
		variant: 0,
		minWidth: 1,
		maxWidth: 10
	});

	// let rows = 1;
	// let columns = 1;
</script>

<main>
	<header>
		<!-- <CombinedNumberInput label="rows" bind:value={rows} step={1} min={1} max={3}/> -->
		<section>
			{#each Object.values(tiledPatternConfigs) as pattern}
				<PatternTile
					patternType={pattern.type}
					tilingBasis={pattern.tiling}
					rows={2}
					columns={3}
					width={200}
					height={200}
				/>
			{/each}
		</section>
		<section>
			<svg width="800" height="800" overflow="visible">
				<!-- <Outline outlineSegments={branchedPaths} /> -->
			</svg>
		</section>
	</header>
</main>

<style>
	main {
		background-color: rgba(50, 50, 50);
	}
	section {
		border: 1px dotted yellow;
		padding: 40px;
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: 10px;
	}
</style>
