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
	import { bandPattern, configStore, configStore0, globuleStore } from '$lib/stores/stores';
	import type { PatternViewConfig, Patterns } from '$lib/types';
	import { show_svg } from '$lib/util';
	import { generateLabelPath } from '$lib/patterns/utils';
	import { svgPathStringFromSegments } from '$lib/patterns/flower-of-life';
	import { svgQuad } from '$lib/patterns/quadrilateral';
	import DynamicBand from '../pattern-svg/DynamicBand.svelte';
	import CutPatternControl from './CutPatternControl.svelte';
	import QuadPattern from '../pattern-svg/QuadPattern.svelte';

	let { levels, struts } = $globuleStore;

	let showBands = true;
	let showQuadPattern = false;
	let showTabs = true;
	let useExpandStroke = false;
	let useLabels = true;

	const colorCycle = (index: number) => {
		const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
		return colors[index % 6];
	};

	$: displayedLevels = getRenderableOnGeometry($configStore.renderConfig, levels || []);
	$: displayedStrutFacets = getRenderableOnGeometry($configStore.renderConfig, struts || []);

	type FlattenMode = 'native-replace' | 'recombine'; // WTF is this. Still relevant?

	let patterns: Patterns = {
		band: $bandPattern,
		strut: { projectionType: 'none' },
		level: { projectionType: 'none' }
	};

	$: viewBoxValue = getViewBox($configStore.patternViewConfig);

	$: {
		if ($configStore.patternConfig.showPattern.level === 'none') {
			patterns.level = { projectionType: 'none' };
		} else {
			patterns.level = generateLevelSetPatterns(displayedLevels, $configStore.patternConfig);
		}
	}
	$: {
		if ($configStore.patternConfig.showPattern.strut === 'none') {
			patterns.strut = { projectionType: 'none' };
		} else {
			patterns.strut = generateStrutPatterns($configStore.patternConfig, displayedStrutFacets);
		}
	}

	const getViewBox = (config: PatternViewConfig) => {
		const { width, height, zoom, centerOffset } = config;
		const minX = 0;
		const minY = 0;
		const logZoom = 1 / Math.pow(10, zoom);
		const viewBox = `${minX} ${minY} ${$configStore.patternConfig.page.width * logZoom} ${
			$configStore.patternConfig.page.height * logZoom
		}`;
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
		<button on:click={() => (showQuadPattern = !showQuadPattern)}
			>{showQuadPattern ? "Don't show quads" : 'Show quads'}</button
		>
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
					height={`${2000}${$configStore.patternConfig.page.unit}`}
					width={`${2000}${$configStore.patternConfig.page.unit}`}
					viewBox={`${
						$configStore.patternViewConfig.centerOffset.x - $configStore.patternConfig.page.width
					} ${
						$configStore.patternViewConfig.centerOffset.y - $configStore.patternConfig.page.height
					} ${2000} ${2000}`}
				>
					{#if $configStore.patternConfig.page}
						<g stroke="red" fill="none" stroke-width="1">
							<rect
								x={`${-$configStore.patternConfig.page.width}`}
								y={`${-$configStore.patternConfig.page.height}`}
								width={$configStore.patternConfig.page.width}
								height={$configStore.patternConfig.page.height}
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
						{#if $configStore.tiledPatternConfig.tiling === 'band'}
							{#each $bandPattern.bands as band, b}
								<g transform={`translate(${-250 + 50 * b} -50) scale(-1,-1)`}>
									<DynamicBand
										{band}
										bandIndex={b}
										minWidth={$configStore0.tiledPatternConfig.config.dynamicStrokeMin}
										maxWidth={$configStore0.tiledPatternConfig.config.dynamicStrokeMax}
										variant={0}
										outlined={false}
									/>
								</g>
							{/each}
						{:else}
							{#each $bandPattern.bands as band, b}
								<g transform={`translate(${-250 + 50 * b} -50) scale(-1,-1)`}>
									{#if showQuadPattern}
										<QuadPattern {band} />
									{/if}
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

									{#each band.facets.filter((facet) => !!facet.quad) as facet, f}
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
											<g fill="none" stroke-width={`${facet.strokeWidth || 1}`} stroke="black">
												<path d={facet.svgPath} stroke-linecap="round" stroke-linejoin="round" />
												<path
													d={facet.svgPath}
													stroke="red"
													stroke-linecap="round"
													stroke-linejoin="round"
													clip-path=""
												/>
											</g>
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
			<CutPatternControl />
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
</style>
