<script lang="ts">
	// import type { Ring, Level, StrutGroup, RibbonGroup } from '../../lib/shade';
	import { Vector3 } from 'three';
	import type { RotatedShapeLevel, Band } from '../../lib/rotated-shape';
	import { generateBandPatterns } from '../../lib/cut-pattern';
	import type {
		PatternConfig,
		BandPattern,
		OutlinedBandPattern,
		ProjectedBandPattern,
		FlattenedBandPattern
	} from '../../lib/cut-pattern';
	import { getRenderable } from '../../lib/rotated-shape';
	import { renderConfig, bandConfig } from '../../lib/stores';
	import type { FacetPattern } from '$lib/cut-pattern copy';

	export let rslevels: RotatedShapeLevel[] = [];
	export let rsbands: Band[] = [];

	let showRSBands = true;

	const getViewBox = (width: number = 100, center: boolean = true, height?: number) => {
		if (center) {
			return !height
				? `-${0} -${width} ${width} ${width}`
				: `-${width / 2} -${height / 2} ${width} ${height}`;
		}
		return !height
			? `-${width / 100} -${(width * 9) / 10} ${width} ${width}`
			: `-${10} -${10} ${width} ${height}`;
	};

	let zoomLevel: number = 300;
	let showPoints = true;
	let showTabs = true;

	let patternConfig: PatternConfig = {
		projectionType: 'outlined',
		axis: 'z',
		origin: new Vector3(190, -150, 0),
		direction: new Vector3(0, 1, 0),
		offset: new Vector3(0, 25, 0),
		bandStyle: $bandConfig.bandStyle
	};

	$: displayedFacets = getRenderable($renderConfig, rsbands);

	let patterns: BandPattern;
	let outlinedPattern: OutlinedBandPattern;
	let flattenedPattern: FlattenedBandPattern;
	let projectedPattern: ProjectedBandPattern;

	const show_svg = () => {
		const svg = document.getElementById('pattern-svg');
		if (!svg) return;
		const serializer = new XMLSerializer();
		const svg_blob = new Blob([serializer.serializeToString(svg)], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(svg_blob);
		const svg_win = window.open(url, 'svg_win');
	};

	const zoomToPattern = (pattern: BandPattern) => {
		let maxX = 0,
			minX = 0,
			maxY = 0,
			minY = 0;

		if (pattern.projectionType === 'faceted') {
			pattern.bands.forEach((band) => {
				band.facets.forEach((facet) => {
					const points_x = [facet.triangle.a.x, facet.triangle.b.x, facet.triangle.c.x];
					if (facet.tab) {
						points_x.push(facet.tab.triangle.a.x, facet.tab.triangle.b.x, facet.tab.triangle.c.x);
					}
					const points_y = [facet.triangle.a.y, facet.triangle.b.y, facet.triangle.c.y];
					if (facet.tab) {
						points_y.push(facet.tab.triangle.a.y, facet.tab.triangle.b.y, facet.tab.triangle.c.y);
					}
					points_x.forEach((x) => {
						maxX = maxX > x ? maxX : x;
						minX = minX < x ? minX : x;
					});
					points_y.forEach((y) => {
						maxY = maxY > y ? maxY : y;
						minY = minY < y ? minY : y;
					});
				});
			});
		}

		// set a number of variables which are bound to the control of SVG viewport
		// width and height (do not change)
		//
		console.debug(`${minX} ${minY} ${maxX} ${maxY}`);
		viewBoxValue = `${minX} ${minY} ${maxX} ${maxY}`;
		return `${minX} ${minY} ${maxX} ${maxY}`;
	};
	let viewBoxValue = getViewBox(zoomLevel, true);

	$: {
		patterns = generateBandPatterns(patternConfig, $bandConfig.tabStyle, displayedFacets);
		if (patterns) {
			// viewBoxValue = zoomToPattern(patterns)
			console.debug(
				'patterns',
				patterns,
				'patternConfig',
				patternConfig,
				'displayedFacets',
				displayedFacets
			);
			if (patterns.projectionType === 'outlined') {
				outlinedPattern = patterns;
			} else if (patterns.projectionType === 'faceted') {
				flattenedPattern = patterns;
			}
		}
	}
</script>

<div class="container">
	{#if rsbands.length > 0}
		<header>
			<button on:click={show_svg}>Download</button>
			<button on:click={() => zoomToPattern(patterns)}>Zoom To Pattern</button>
		</header>
		<div>
			<label for="showRSBands"> RSBands </label>
			<input type="checkbox" name="showRSBands" bind:checked={showRSBands} />
			<div class="container-svg" class:showRSBands>
				<div>
					<span>zoom</span><input type="number" bind:value={zoomLevel} />
					<span>points</span><input type="checkbox" bind:checked={showPoints} />
				</div>
				<svg
					id="pattern-svg"
					height="500"
					width="500"
					viewBox={viewBoxValue}
					xmlns="http://www.w3.org/2000/svg"
				>
					{#if outlinedPattern}
						{#each outlinedPattern.bands as band, i}
							<path d={band.outline.svgPath} fill="red" stroke="black" stroke-width="1" />
							<text x={band.outline.points[0].x} y={band.outline.points[0].y}>{i}</text>
						{/each}
					{:else if flattenedPattern}
						{#each flattenedPattern.bands as band}
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
									<circle
										cx={facet.triangle.a.x}
										cy={facet.triangle.a.y}
										r={zoomLevel / 100}
										fill="red"
										opacity="0.5"
									/>
									<text
										x={facet.triangle.a.x + zoomLevel / 50}
										y={facet.triangle.a.y + zoomLevel / 50}
										class="point-label-text">a</text
									>
									<circle
										cx={facet.triangle.b.x}
										cy={facet.triangle.b.y}
										r={zoomLevel / 100}
										fill="green"
										opacity="0.5"
									/>
									<text
										x={facet.triangle.b.x + zoomLevel / 50}
										y={facet.triangle.b.y + zoomLevel / 50}
										class="point-label-text">b</text
									>
									<circle
										cx={facet.triangle.c.x}
										cy={facet.triangle.c.y}
										r={zoomLevel / 100}
										fill="blue"
										opacity="0.5"
									/>
									<text
										x={facet.triangle.c.x + zoomLevel / 50}
										y={facet.triangle.c.y + zoomLevel / 50}
										class="point-label-text">c</text
									>
								{/if}
							{/each}
						{/each}
					{:else}{/if}
				</svg>
			</div>
		</div>
	{/if}
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
</style>
