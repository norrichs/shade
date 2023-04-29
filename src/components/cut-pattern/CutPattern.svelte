<script lang="ts">
	// import type { Ring, Level, StrutGroup, RibbonGroup } from '../../lib/shade';
	import { Vector3 } from 'three';
	import type { RotatedShapeLevel, Band } from '../../lib/rotated-shape';
	import {
		generateBandPatterns,
		generateLevelSetPattern,
		type FacetedBandPattern
	} from '../../lib/cut-pattern';
	import type {
		PatternConfig,
		BandPattern,
		OutlinedBandPattern,
		LevelSetPattern
	} from '../../lib/cut-pattern';
	import { getRenderable } from '../../lib/rotated-shape';
	import {
		renderConfig,
		bandConfig,
		patternConfig,
		patternViewConfig,
		type PatternViewConfig
	} from '../../lib/stores';
	import type { FacetPattern } from '../../lib/cut-pattern';

	export let rslevels: RotatedShapeLevel[] = [];
	export let rsbands: Band[] = [];

	let showRSBands = true;

	const getViewBox = (config: PatternViewConfig) => {
		const { width, height, zoom, centerOffset } = config;
		const minX = - centerOffset.x - (width / 2)
		const minY = - centerOffset.y - (height / 2)
		const logZoom = 1 / Math.pow(10, zoom)
		
		return `${minX * logZoom} ${minY * logZoom} ${width * logZoom} ${height * logZoom}`

	};

	let zoomLevel: number = 1000;
	let showPoints = true;
	let showTabs = true;

	$: displayedFacets = getRenderable($renderConfig, rsbands);

	let patterns: BandPattern;
	// let outlinedPattern: OutlinedBandPattern;
	// let facetedPattern: FacetedBandPattern;
	// let levelPattern: LevelSetPattern;

	const show_svg = () => {
		const svg = document.getElementById('pattern-svg');
		if (!svg) return;
		const serializer = new XMLSerializer();
		const svg_blob = new Blob([serializer.serializeToString(svg)], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(svg_blob);
		const svg_win = window.open(url, 'svg_win');
	};

	// const zoomToPattern = (pattern: BandPattern) => {
	// 	let maxX = 0,
	// 		minX = 0,
	// 		maxY = 0,
	// 		minY = 0;

	// 	if (pattern.projectionType === 'faceted') {
	// 		pattern.bands.forEach((band) => {
	// 			band.facets.forEach((facet) => {
	// 				const points_x = [facet.triangle.a.x, facet.triangle.b.x, facet.triangle.c.x];
	// 				if (facet.tab) {
	// 					points_x.push(facet.tab.triangle.a.x, facet.tab.triangle.b.x, facet.tab.triangle.c.x);
	// 				}
	// 				const points_y = [facet.triangle.a.y, facet.triangle.b.y, facet.triangle.c.y];
	// 				if (facet.tab) {
	// 					points_y.push(facet.tab.triangle.a.y, facet.tab.triangle.b.y, facet.tab.triangle.c.y);
	// 				}
	// 				points_x.forEach((x) => {
	// 					maxX = maxX > x ? maxX : x;
	// 					minX = minX < x ? minX : x;
	// 				});
	// 				points_y.forEach((y) => {
	// 					maxY = maxY > y ? maxY : y;
	// 					minY = minY < y ? minY : y;
	// 				});
	// 			});
	// 		});
	// 	}

	// 	// set a number of variables which are bound to the control of SVG viewport
	// 	// width and height (do not change)
	// 	//
	// 	console.debug(`${minX} ${minY} ${maxX} ${maxY}`);
	// 	viewBoxValue = `${minX} ${minY} ${maxX} ${maxY}`;
	// 	return `${minX} ${minY} ${maxX} ${maxY}`;
	// };

	$: viewBoxValue = getViewBox($patternViewConfig);

	$: {
		if ($patternConfig.projectionType === 'outlined') {
			patterns = generateBandPatterns(
				$patternConfig,
				$bandConfig.bandStyle,
				$bandConfig.tabStyle,
				displayedFacets
			) as OutlinedBandPattern;
		} else if ($patternConfig.projectionType === 'faceted') {
			patterns = generateBandPatterns(
				$patternConfig,
				$bandConfig.bandStyle,
				$bandConfig.tabStyle,
				displayedFacets
			) as FacetedBandPattern;
			console.debug('cutPattern faceted Pattern', patterns);
		} else if ($patternConfig.projectionType === 'levels') {
			patterns = generateLevelSetPattern(rslevels, $patternConfig);
			console.debug('cutPattern level Pattern', patterns);
		}
	}
</script>

<div class="container">
	<header>
		<button on:click={show_svg}>Download</button>
		<!-- <button on:click={() => zoomToPattern(patterns)}>Zoom To Pattern</button> -->
	</header>
	<div>
		<label for="showRSBands"> RSBands </label>
		<input type="checkbox" name="showRSBands" bind:checked={showRSBands} />
		<div class="container-svg" class:showRSBands>
			<svg
				id="pattern-svg"
				height={$patternViewConfig.height}
				width={$patternViewConfig.width}
				viewBox={viewBoxValue}
				xmlns="http://www.w3.org/2000/svg"
			>
				{#if patterns?.projectionType === 'outlined'}
					{#each patterns.bands as band, i}
						<path d={band.outline.svgPath} fill="red" stroke="black" stroke-width="0.2" />
						<text x={band.outline.points[0].x} y={band.outline.points[0].y}>{i}</text>
					{/each}
				{:else if patterns?.projectionType === 'faceted'}
					{#each patterns.bands as band}
						{#each band.facets as facet, f}
							<path
								d={facet.svgPath}
								fill={`rgb(100, ${50 + (200 * f) / band.facets.length},100)`}
								stroke="orangered"
								stroke-width="0.5"
							/>
							{#if showTabs && facet.tab}
								<path
									d={facet.tab.svgPath}
									fill={`rgb(0, ${50 + (200 * f) / band.facets.length},255)`}
									stroke="orangered"
									stroke-width="0.5"
								/>
							{/if}
							{#if showPoints && f === band.facets.length - 1}
								<!-- <circle
									cx={facet.triangle.a.x}
									cy={facet.triangle.a.y}
									r={zoomLevel / 100}
									fill="red"
									opacity="0.5"
								/> -->
								<text
									x={facet.triangle.a.x + zoomLevel / 50}
									y={facet.triangle.a.y + zoomLevel / 50}
									class="point-label-text">a</text
								>
								<!-- <circle
									cx={facet.triangle.b.x}
									cy={facet.triangle.b.y}
									r={zoomLevel / 100}
									fill="green"
									opacity="0.5"
								/> -->
								<text
									x={facet.triangle.b.x + zoomLevel / 50}
									y={facet.triangle.b.y + zoomLevel / 50}
									class="point-label-text">b</text
								>
								<!-- <circle
									cx={facet.triangle.c.x}
									cy={facet.triangle.c.y}
									r={zoomLevel / 100}
									fill="blue"
									opacity="0.5"
								/> -->
								<text
									x={facet.triangle.c.x + zoomLevel / 50}
									y={facet.triangle.c.y + zoomLevel / 50}
									class="point-label-text">c</text
								>
							{/if}
						{/each}
					{/each}
				{:else if patterns?.projectionType === 'levels'}
					{#each patterns.levels as level, i}
						<path d={level.outline.svgPath} fill="green" stroke="black" stroke-width="0.5" />
						<circle cx={0} cy={0} r={6} stroke="magenta" />
						<!-- <text x={level.outline.points[0].x} y={level.outline.points[0].y}>{i}</text> -->
					{/each}
				{/if}
			</svg>
			<div class="view-control-box">
				<label  for="svg-width">width</label>
				<input id="svg-width" type="number" bind:value={$patternViewConfig.width} class="view-control"/>
				<label  for="svg-height">height</label>
				<input id="svg-height" type="number" bind:value={$patternViewConfig.height} class="view-control"/>
				<label  for="svg-zoom">zoom</label>
				<input id="svg-zoom" type="number" min={-1} max={2} step={0.1} bind:value={$patternViewConfig.zoom} class="view-control"/>
				<label  for="svg-offset-x">offset x</label>
				<input id="svg-offset-x" type="number" bind:value={$patternViewConfig.centerOffset.x} class="view-control"/>
				<label  for="svg-offset-y">offset y</label>
				<input id="svg-offset-y" type="number" bind:value={$patternViewConfig.centerOffset.y} class="view-control"/>
			</div>
		</div>
	</div>
</div>

<style>
	.container {
		display: flex;
		flex-direction: row;
		justify-content: flex-start;
	}
	.container-svg {
		display: none;
		flex-direction: column;
		margin-top: 10px;
		padding: 20px;
		box-shadow: 0 0 10px 2px black;
		position: relative;
	}
	.showRings {
		display: flex;
	}
	.showStruts {
		display: flex;
	}
	.showRibbons {
		display: flex;
	}
	.showRSBands {
		display: flex;
	}
	.point-label-text {
		font-size: 5px;
		font-family: Arial, Helvetica, sans-serif;
	}
	.view-control-box {
		position: absolute;
		top: 20px;
		left: 20px;
	}
	.view-control {
		width: 50px;
	}
</style>
