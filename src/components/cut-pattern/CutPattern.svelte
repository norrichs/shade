<script lang="ts">
	import SvgLogger from '../svg-logger/SvgLogger.svelte';
	import LoggerControls from '../svg-logger/LoggerControls.svelte';
	import type { Level, Band, Strut } from '$lib/generate-shape';
	import {
		generateBandPatterns,
		generateLevelSetPatterns,
		generateStrutPatterns
	} from '$lib/cut-pattern/cut-pattern';
	import { generateTiledBandPattern } from '$lib/cut-pattern/cut-pattern';
	import type {
		OutlinedBandPattern,
		FacetedBandPattern,
		FacetedStrutPattern,
		OutlinedStrutPattern,
		LevelSetPattern,
		PatternViewConfig,
		PatternedBandPattern,
		PathSegment
	} from '$lib/cut-pattern/cut-pattern.types';
	import { getRenderable } from '$lib/generate-shape';
	import { config, config0 } from '$lib/stores';
	import { svgTriangle } from '$lib/patterns/flower-of-life';
	import { simpleTriangle } from '$lib/patterns/utils';

	export let levels: Level[] = [];
	export let bands: Band[] = [];
	export let struts: Strut[] = [];

	let showBands = true;

	const getViewBox = (config: PatternViewConfig) => {
		const { width, height, zoom, centerOffset } = config;
		const minX = -centerOffset.x - width / 2;
		const minY = -centerOffset.y - height / 2;
		const logZoom = 1 / Math.pow(10, zoom);

		return `${minX * logZoom} ${minY * logZoom} ${width * logZoom} ${height * logZoom}`;
	};

	let showTabs = true;

	$: renderConfig = $config.renderConfig;

	$: displayedBandFacets = getRenderableOnGeometry(bands);
	$: displayedLevels = getRenderableOnGeometry(levels);
	$: displayedStrutFacets = getRenderableOnGeometry(struts);

	type Patterns = {
		band:
			| OutlinedBandPattern
			| FacetedBandPattern
			| PatternedBandPattern
			| { projectionType: 'none' };
		strut: OutlinedStrutPattern | FacetedStrutPattern | { projectionType: 'none' };
		level: LevelSetPattern | { projectionType: 'none' };
	};
	type FlattenMode = 'native-replace' | 'recombine';

	let patterns: Patterns = {
		band: { projectionType: 'none' },
		strut: { projectionType: 'none' },
		level: { projectionType: 'none' }
	};

	const getRenderableOnGeometry = <T extends Band[] | Level[] | Strut[]>(geometry: T) => {
		return getRenderable($config.renderConfig, geometry) as T;
	};

	const show_svg = () => {
		const svg = document.getElementById('pattern-svg');
		if (!svg) return;
		const serializer = new XMLSerializer();
		const svg_blob = new Blob([serializer.serializeToString(svg)], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(svg_blob);
		const svg_win = window.open(url, 'svg_win');
	};

	const updateBandPatterns = (facets: Band[]) => {
		if ($config.patternConfig.showPattern.band === 'none') {
			patterns.band = { projectionType: 'none' };
		} else if ($config.patternConfig.showPattern.band === 'patterned') {
			patterns.band = generateTiledBandPattern({
				bands: displayedBandFacets as Band[],
				tabStyle: $config.bandConfig.tabStyle,
				tiledPatternConfig: $config.tiledPatternConfig
			});
		} else {
			patterns.band = generateBandPatterns(
				$config.patternConfig,
				$config.cutoutConfig,
				$config.bandConfig.bandStyle,
				$config.bandConfig.tabStyle,
				displayedBandFacets
			);
		}
	};

	$: viewBoxValue = getViewBox($config.patternViewConfig);

	$: updateBandPatterns(displayedBandFacets);

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

	let experimental = {
		show: false,
		outer: `M 0 0 L 100 0 L 50 86.6z`,
		inner: `M 10 5 L 90 5 L 50 75z`,
		circle: [50, 28.9, 10]
	};

	let flattenedPatternedSVG: { bands: string[] } = { bands: [] };
</script>

<div class="container">
	<header>
		<button on:click={show_svg}>Download</button>
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
			<svg
				id="pattern-svg"
				height={$config.patternViewConfig.height}
				width={$config.patternViewConfig.width}
				viewBox={viewBoxValue}
				xmlns="http://www.w3.org/2000/svg"
			>
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

				{#if patterns.band.projectionType === 'outlined'}
					{#each patterns.band.bands as band, i}
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
				{:else if patterns.band.projectionType === 'faceted'}
					{#each patterns.band.bands as band}
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
					{/each}
				{:else if patterns.band.projectionType === 'patterned'}
					{#each patterns.band.bands as band, b}
						{#if band.facets.length > 0}
							{#each band.facets as facet}
								<!-- <path d={svgPathStringFromSegments(facet)} fill="blue" /> -->
							{/each}
						{/if}
						{#if band.svgPath}
							<path
								id={band.id || `transformed-band-svg-${b}`}
								d={band.svgPath}
								fill="orange"
								fill-rule="evenodd"
								stroke="black"
								stroke-width={0.05}
								transform={`translate(${-50 * b} 0)`}
							/>
						{:else}
							{#each band.facets as facet, f}
								<path
									id={`facet-svg-${b}-${f}`}
									class={`patterned-path-transformed band-svg-${b} facet-svg-${f}`}
									d={facet.svgPath}
									stroke="deeppink"
									stroke-width="0.2"
									transform={facet.svgTransform}
									fill-rule="evenodd"
								/>
								<path
									d={svgTriangle(simpleTriangle(facet.triangle))}
									class="cutpattern-outline"
									stroke-width="0.2"
								/>
								{#if showTabs && facet.tab}
									<path
										d={facet.tab.svgPath}
										fill={`rgb(0, ${50 + (200 * f) / band.facets.length},255)`}
										stroke="deeppink"
										stroke-width="0.2"
									/>
								{/if}
							{/each}
						{/if}
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
				
				<SvgLogger/>
				
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
					min={-1}
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
				/>
				<label for="svg-offset-y">offset y</label>
				<input
					id="svg-offset-y"
					type="number"
					bind:value={$config0.patternViewConfig.centerOffset.y}
					class="view-control"
				/>
			</div>
		</div>
	</div>
</div>

<style>
	#experiment-container {
		background-color: blue;
	}
	#pattern-svg {
		background-color: rgba(0, 0, 0, 0.03);
	}
	.patterned-path-transformed {
		fill: rgba(255, 20, 145, 0.288);
		stroke: deeppink;
	}

	.patterned-path-flattened {
		fill: rgba(102, 51, 153, 0.771);
		stroke: deeppink;
	}

	.cutpattern-outline {
		fill: rgba(145, 255, 0, 0.171);
		stroke: rgba(0, 0, 0, 0.28);
	}

	.container {
		display: flex;
		flex-direction: column;
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
