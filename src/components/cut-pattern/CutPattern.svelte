<script lang="ts">
	import SvgLogger from '../svg-logger/SvgLogger.svelte';
	import LoggerControls from '../svg-logger/LoggerControls.svelte';
	import {
		expandAndCombine,
		expandStroke,
		generateLevelSetPatterns,
		generateStrutPatterns,
		getRenderableOnGeometry
	} from '$lib/cut-pattern/cut-pattern';
	import { bandPattern, config, config0, shapeData } from '$lib/stores';
	import type { PatternViewConfig, Patterns } from '$lib/types';
	import { show_svg } from '$lib/util';
	import PatternLabel from './PatternLabel.svelte';
	import { generateLabelPath } from '$lib/patterns/utils';
	import { svgPathStringFromSegments } from '$lib/patterns/flower-of-life';
	import { svgQuad } from '$lib/patterns/quadrilateral';

	let { levels, bands, struts } = $shapeData;

	let showBands = true;

	let showTabs = true;
	let useExpandStroke = false;
	let useLabels = true;
	let page: { width: number; height: number; unit: 'mm' | 'cm' | 'in' } | undefined = {
		width: 300,
		height: 300,
		unit: 'mm'
	};

	const colorCycle = (index: number) => {
		const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
		return colors[index % 6];
	};

	$: displayedLevels = getRenderableOnGeometry($config.renderConfig, levels);
	$: displayedStrutFacets = getRenderableOnGeometry($config.renderConfig, struts);

	type FlattenMode = 'native-replace' | 'recombine'; // WTF is this. Still relevant?

	let patterns: Patterns = {
		band: $bandPattern,
		strut: { projectionType: 'none' },
		level: { projectionType: 'none' }
	};

	$: viewBoxValue = getViewBox($config.patternViewConfig);

	$: {
		if ($config.patternConfig.showPattern.level === 'none') {
			patterns.level = { projectionType: 'none' };
		} else {
			patterns.level = generateLevelSetPatterns(displayedLevels, $config.patternConfig);
		}
	}
	$: {
		if ($config.patternConfig.showPattern.strut === 'none') {
			patterns.strut = { projectionType: 'none' };
		} else {
			patterns.strut = generateStrutPatterns($config.patternConfig, displayedStrutFacets);
		}
	}

	// const getViewBox = () => {
	// 	const { width, height, zoom, centerOffset } = $config.patternViewConfig;
	// 	const minX = -centerOffset.x - width / 2;
	// 	const minY = -centerOffset.y - height / 2;
	// 	const logZoom = 1 / Math.pow(10, zoom);

	// 	const viewBox = `${minX * logZoom} ${minY * logZoom} ${width * logZoom} ${height * logZoom}`;
	// 	console.debug('VIEWBOX', viewBox);

	// 	return '0 0 300 300';
	// };

	const getViewBox = (config: PatternViewConfig) => {
		const { width, height, zoom, centerOffset } = config;
		const minX = 0;
		const minY = 0;
		const logZoom = 1 / Math.pow(10, zoom);
		const viewBox = `${minX} ${minY} ${page.width * logZoom} ${page.height * logZoom}`;
		return viewBox;
	};

	let flattenedPatternedSVG: { bands: string[] } = { bands: [] };
</script>

<div class="container">
	<header>
		<button on:click={() => show_svg('pattern-svg')}>Download</button>
		<button on:click={() => (useExpandStroke = !useExpandStroke)}
			>{useExpandStroke ? "Don't Expand Stroke" : 'Expand Stroke'}</button
		>
		<button on:click={() => (useLabels = !useLabels)}>{useLabels ? "Don't Label" : 'Label'}</button>
		<!-- <button on:click={() => zoomToPattern(patterns)}>Zoom To Pattern</button> -->
		<label for="showBands"> Bands </label>
		<input type="checkbox" name="showBands" bind:checked={showBands} />
		{#if flattenedPatternedSVG.bands.length > 0}
			<div>FLATTENED PATTERNED</div>
		{/if}
		<LoggerControls />
	</header>

	<div>test</div>

	<div>
		<div class="container-svg" class:showBands>
			<svg id="outer-svg" width="100%" height="100%" viewBox={viewBoxValue}>
				<svg
					id="pattern-svg"
					height={`${2000}${page.unit}`}
					width={`${2000}${page.unit}`}
					viewBox={`${-page.width} ${
						$config.patternViewConfig.centerOffset.y - page.height
					} ${2000} ${2000}`}
				>
					{#if page}
						<g stroke="red" fill="none" stroke-width="1">
							<rect
								x={`${-page.width}`}
								y={`${-page.height}`}
								width={page.width}
								height={page.height}
							/>
						</g>
					{/if}
					{#if flattenedPatternedSVG.bands.length > 0}
						{#each flattenedPatternedSVG.bands as band, b}
							<path d={band} fill="red" fill-rule="evenodd" id={`flattened-patterned-band-${b}`} />
						{/each}
					{/if}

					{#if patterns.level.projectionType !== 'none'}
						{#each patterns.level.levels as level, i}
							<path d={level.outline.svgPath} fill="green" stroke="black" stroke-width="0.3" />
						{/each}
					{/if}
					{#if $bandPattern.projectionType === 'outlined'}
						{#each $bandPattern.bands as band, i}
							<path
								d={[
									band.outline.svgPath,
									...(band.cutouts ? band.cutouts.map((cutout) => cutout.svgPath) : [])
								].join('')}
								fill="red"
								stroke="black"
								stroke-width="0.2"
								fill-rule="evenodd"
							/>
							<text x={band.outline.points[0].x} y={band.outline.points[0].y}>{i}</text>
						{/each}
					{:else if $bandPattern.projectionType === 'faceted'}
						{#each $bandPattern.bands as band, bandIndex}
							<g id={`facets-band-${bandIndex}`} transform={`translate(${-50 * bandIndex} 0)`}>
								{#each band.facets as facet, f}
									<path
										d={facet.svgPath}
										fill={`rgb(100, ${50 + (200 * f) / band.facets.length},100)`}
										stroke="orangered"
										stroke-width="0.2"
									/>
									{#if showTabs && facet.tab}
										<path
											d={facet.tab.svgPath}
											fill={`rgb(0, ${50 + (200 * f) / band.facets.length},255)`}
											stroke="orangered"
											stroke-width="0.2"
										/>
									{/if}
								{/each}
							</g>
						{/each}
					{:else if $bandPattern.projectionType === 'patterned'}
						{#each $bandPattern.bands as band, b}
							<g transform={`translate(${-250 + 50 * b} -50) scale(-1,-1)`}>
								<!-- {#if useExpandStroke}
									<path
										d={expandAndCombine(band).svgPath}
										fill="rgba(0,150,0,0.2)"
										stroke-width="0.1"
										stroke="black"
										fill-rule="evenodd"
									/> -->
								<!-- <path
									id={band.id || `transformed-band-svg-${b}`}
									d={band.svgPath}
									fill="orange"
									fill-rule="evenodd"
									stroke="black"
									stroke-width={0.05}
									transform={`translate(${-50 * b} 0) scale(-1,-1)`}
								/> -->
								<!-- {:else} -->
								{#each band.facets as facet, f}
									<!-- <g>
										<path
											d={svgQuad(facet.quad)}
											fill="black"
											opacity="0.2"
											stroke="black"
											stroke-width="0.5"
										/>
										<circle cx={facet.quad.p0.x} cy={facet.quad.p0.y} r="2" fill="red" />
										<circle cx={facet.quad.p1.x} cy={facet.quad.p1.y} r="2" fill="green" />
										<circle cx={facet.quad.p2.x} cy={facet.quad.p2.y} r="2" fill="blue" />
										<circle cx={facet.quad.p3.x} cy={facet.quad.p3.y} r="2" fill="purple" />
									</g> -->
									<!-- <g>
										<path
											d={svgQuad(facet.addenda[0].quad)}
											fill="green"
											opacity="0.2"
											stroke="black"
											stroke-width="0.5"
										/>
									</g> -->
									{#if useExpandStroke}
										<path
											d={expandStroke(facet.svgPath, (facet.strokeWidth || 1) / 2)}
											fill="rgba(255,150,0,0.2)"
											stroke-width="0.1"
											stroke="black"
											fill-rule="evenodd"
										/>
									{:else}
										<path
											d={facet.svgPath}
											fill="none"
											stroke-width={`${facet.strokeWidth || 1}`}
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke="black"
										/>
									{/if}
								{/each}
								{#if useLabels}
									<path
										d={svgPathStringFromSegments(
											generateLabelPath(b, {
												scale: 0.15,
												r: 20,
												origin: {
													x: band.tagAnchorPoint?.x || -20,
													y: band.tagAnchorPoint?.y || -30
												},
												angle: (Math.PI / 180) * 210
											})
										)}
										fill-rule="evenodd"
										fill="rgba(0,0,0,0.1)"
										stroke="black"
										stroke-width="0.5"
									/>
								{/if}
								<!-- {/if} -->
							</g>
						{/each}
					{/if}

					{#if patterns.strut.projectionType === 'outlined'}
						{#each patterns.strut.struts as strut, i}
							<path d={strut.outline.svgPath} fill="deeppink" stroke="black" stroke-width="0.3" />
						{/each}
					{:else if patterns.strut.projectionType === 'faceted'}
						{#each patterns.strut.struts as strut}
							{#each strut.facets as facet, f}
								<path
									d={facet.svgPath}
									fill={`rgb(100, ${50 + (200 * f) / strut.facets.length},100)`}
									stroke="orangered"
									stroke-width="0.2"
								/>
							{/each}
						{/each}
					{/if}

					<SvgLogger />
				</svg>
			</svg>

			<div class="view-control-box">
				<label for="svg-width">width</label>
				<input
					id="svg-width"
					type="number"
					bind:value={$config0.patternViewConfig.width}
					class="view-control"
				/>
				<label for="svg-height">height</label>
				<input
					id="svg-height"
					type="number"
					bind:value={$config0.patternViewConfig.height}
					class="view-control"
				/>
				<label for="svg-zoom">zoom</label>
				<input
					id="svg-zoom"
					type="number"
					min={-2}
					max={2}
					step={0.1}
					bind:value={$config0.patternViewConfig.zoom}
					class="view-control"
				/>
				<label for="svg-offset-x">offset x</label>
				<input
					id="svg-offset-x"
					type="number"
					bind:value={$config0.patternViewConfig.centerOffset.x}
					class="view-control"
					step={10}
				/>
				<label for="svg-offset-y">offset y</label>
				<input
					id="svg-offset-y"
					type="number"
					bind:value={$config0.patternViewConfig.centerOffset.y}
					class="view-control"
					step={10}
				/>
				<label for="svg-page-width">page width</label>
				<input
					id="svg-page-width"
					type="number"
					bind:value={page.width}
					class="view-control"
					step={10}
				/>
				<label for="svg-page-width">page height</label>
				<input
					id="svg-page-height"
					type="number"
					bind:value={page.height}
					class="view-control"
					step={10}
				/>
				<label for="svg-page-unit">page unit</label>
				<select id="svg-page-unit" bind:value={page.unit} class="view-control">
					<option>mm</option>
					<option>cm</option>
					<option>in</option>
				</select>
			</div>
		</div>
	</div>
</div>

<style>
	#outer-svg {
		background-color: beige;
	}
	#pattern-svg {
		background-color: red;
	}
	.patterned-path-transformed {
		fill: rgba(255, 20, 145, 0.288);
		stroke: deeppink;
	}

	.patterned-path-flattened {
		fill: rgba(102, 51, 153, 0.771);
		stroke: deeppink;
	}

	.container {
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
	}
	.container-svg {
		min-width: 2000px;
		display: none;
		flex-direction: column;
		margin-top: 10px;
		padding: 20px;
		box-shadow: 0 0 10px 2px black;
		position: relative;
	}
	.showBands {
		display: flex;
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
