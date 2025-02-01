<script lang="ts">
	import { generateBranched } from '$lib/patterns';
	import { tiledPatternConfigs } from '$lib/shades-config';
	import type { DynamicPathCollection, Quadrilateral } from '$lib/types';
	import CombinedNumberInput from '../../components/controls/CombinedNumberInput.svelte';
	import Outline from '../../components/pattern-svg/Outline.svelte';
	import PatternTile from '../../components/pattern/PatternTile.svelte';

	let quadBand: Quadrilateral[] = [
		{
			p0: { x: 0.4, y: 0 },
			p3: { x: 0.3, y: 0.2 },
			p2: { x: 0.7, y: 0.2 },
			p1: { x: 0.6, y: 0 }
		},
		{
			p0: { x: 0.3, y: 0.2 },
			p3: { x: 0.25, y: 0.4 },
			p2: { x: 0.75, y: 0.4 },
			p1: { x: 0.7, y: 0.2 }
		},
		{
			p0: { x: 0.25, y: 0.4 },
			p3: { x: 0.25, y: 0.6 },
			p2: { x: 0.75, y: 0.6 },
			p1: { x: 0.75, y: 0.4 }
		},
		{
			p0: { x: 0.25, y: 0.6 },
			p3: { x: 0.3, y: 0.8 },
			p2: { x: 0.7, y: 0.8 },
			p1: { x: 0.75, y: 0.6 }
		},
		{
			p0: { x: 0.3, y: 0.8 },
			p3: { x: 0.4, y: 1 },
			p2: { x: 0.6, y: 1 },
			p1: { x: 0.7, y: 0.8 }
		}
	];
	quadBand = quadBand.map((quad) => {
		const scale = 500;
		return {
			p0: { x: quad.p0.x * scale, y: quad.p0.y * scale },
			p1: { x: quad.p1.x * scale, y: quad.p1.y * scale },
			p2: { x: quad.p2.x * scale, y: quad.p2.y * scale },
			p3: { x: quad.p3.x * scale, y: quad.p3.y * scale }
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
				<Outline paths={branchedPaths} />
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
