<script lang="ts">
	import { generateBranched, patterns } from '$lib/patterns';
	import { isSamePoint, svgQuad, transformPatternByQuad } from '$lib/patterns/quadrilateral';
	import {
		getAngle,
		rotatePS,
		scalePS,
		svgPathStringFromSegments,
		translatePS
	} from '$lib/patterns/utils';
	import { tiledPatternConfigs } from '$lib/shades-config';
	import { patternConfigStore } from '$lib/stores';
	import {
		isLinePathSegment,
		isMovePathSegment,
		type BandAddressed,
		type BandPatternGenerator,
		type DynamicPath,
		type DynamicPathCollection,
		type GeometryAddress,
		type GlobuleAddressed,
		type LinePathSegment,
		type MovePathSegment,
		type PathSegment,
		type CutPattern,
		type PixelScale,
		type Point,
		type Quadrilateral,
		type TiledPatternConfig,
		type TilingBasis,
		type UnitPatternGenerator
	} from '$lib/types';
	import { point } from 'drizzle-orm/pg-core';
	import CombinedNumberInput from '../../components/controls/CombinedNumberInput.svelte';
	import Outline from '../../components/pattern-svg/Outline.svelte';
	import PatternTile from '../../components/pattern/PatternTile.svelte';
	import { quadBands } from './quads';
	import { degToRad } from 'three/src/math/MathUtils.js';
	import {
		generateTiledBandPattern,
		generateTiling,
		type GenerateTilingProps
	} from '$lib/cut-pattern/generate-tiled-pattern';
	import { adjustShieldTesselationAfterTiling } from '$lib/patterns/tiled-shield-tesselation-pattern';

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

	type PointLabel = { point: Point; label: string };

	type GroupedPoint = { point: Point; segments: { index: number; segment: PathSegment }[] };

	type Pattern = {
		path: PathSegment[];
		pathString: string;
		quad: Quadrilateral;
		pointLabels?: GroupedPoint[];
	};

	const getPath = (
		patternType: string,
		rows: number,
		columns: number,
		width: number,
		height: number,
		tilingBasis: TilingBasis
	) => {
		let mapped: Pattern;
		if (patterns[patternType]) {
			// if (tilingBasis === 'quadrilateral') {
			const { getPattern } = patterns[patternType] as unknown as UnitPatternGenerator;
			const unitPattern = getPattern(rows, columns);
			const quad: Quadrilateral = {
				p0: { x: 0, y: 0 },
				p1: { x: width, y: 0 },
				p2: { x: width, y: height },
				p3: { x: 0, y: height }
			};
			const path = transformPatternByQuad(unitPattern, quad);
			mapped = {
				quad,
				path,
				pathString: svgPathStringFromSegments(path),
				pointLabels: getPointLabels(path)
			};

			console.debug(mapped);
			return mapped;
		}

		return undefined;
	};

	const getPointLabels = (points: PathSegment[]) => {
		const groupedPoints: { point: Point; segments: { index: number; segment: PathSegment }[] }[] =
			[];
		for (let p = 0; p < points.length; p++) {
			const segment = points[p];
			if (isMovePathSegment(segment) || isLinePathSegment(segment)) {
				const point: Point = { x: segment[1], y: segment[2] };
				const existing = groupedPoints.find(
					(gP) => gP.point.x === point.x && gP.point.y === point.y
				);
				if (existing) {
					existing.segments.push({ index: p, segment: [...points[p]] });
				} else {
					groupedPoints.push({ point, segments: [{ index: p, segment: [...points[p]] }] });
				}
			}
		}
		return groupedPoints;
		// .map((gP) => {
		// 	return {
		// 		point: gP.point,
		// 		label: gP.segments
		// 			.map(
		// 				(segment) =>
		// 					`${segment.index}: ${segment.segment[0]} ${segment.segment[1]} ${segment.segment[2]}`
		// 			)
		// 			.join('\n')
		// 	};
		// });
	};

	const setMainPattern = (patternConfig: TiledPatternConfig) => {
		mainPatternConfig = patternConfig;
		mainPath = getPath(
			patternConfig.type,
			1,
			1,
			PATTERN_SIZE,
			(patternConfig.config.aspectRatio || 1) * PATTERN_SIZE,
			patternConfig.tiling
		);
	};

	const getSegmentsFromQuad = (
		q: Quadrilateral
	): [MovePathSegment, LinePathSegment, LinePathSegment, LinePathSegment] => {
		return [
			['M', q.p0.x, q.p0.y],
			['L', q.p1.x, q.p1.y],
			['L', q.p2.x, q.p2.y],
			['L', q.p3.x, q.p3.y]
		];
	};

	const generateCrossQuad = (
		quadBands: Quadrilateral[][],
		tiledBands: { facets: CutPattern[] }[],
		adjacentBands: PathSegment[][][]
	) => {
		let leftQuads = [getSegmentsFromQuad(quadBands[0][1]) as PathSegment[]];
		let rightQuads = [getSegmentsFromQuad(quadBands[2][1]) as PathSegment[]];
		const centerQuads = quadBands[1].map((quad) => getSegmentsFromQuad(quad));

		let leftTiles = [window.structuredClone(tiledBands[0].facets[1])];
		let rightTiles = [window.structuredClone(tiledBands[2].facets[1])];
		const centerTiles = tiledBands[1];

		const leftOffset = {
			x: quadBands[1][1].p0.x - quadBands[0][1].p1.x,
			y: quadBands[1][1].p0.y - quadBands[0][1].p1.y
		};
		const rightOffset = {
			x: quadBands[1][1].p1.x - quadBands[2][1].p0.x,
			y: quadBands[1][1].p1.y - quadBands[2][1].p0.y
		};

		leftQuads = [translatePS(leftQuads[0], leftOffset.x, leftOffset.y)];
		rightQuads = [translatePS(rightQuads[0], rightOffset.x, rightOffset.y)];
		leftTiles[0].path = translatePS(leftTiles[0].path, leftOffset.x, leftOffset.y);
		rightTiles[0].path = translatePS(rightTiles[0].path, rightOffset.x, rightOffset.y);

		const leftAngle =
			getAngle(quadBands[1][1].p0, quadBands[1][1].p3) -
			getAngle(quadBands[0][1].p1, quadBands[0][1].p2);
		const rightAngle =
			getAngle(quadBands[1][1].p1, quadBands[1][1].p2) -
			getAngle(quadBands[2][1].p0, quadBands[2][1].p3);

		leftQuads = [rotatePS(leftQuads[0], leftAngle, quadBands[1][1].p0)];
		rightQuads = [rotatePS(rightQuads[0], rightAngle, quadBands[1][1].p1)];
		leftTiles[0].path = rotatePS(leftTiles[0].path, leftAngle, quadBands[1][1].p0);
		rightTiles[0].path = rotatePS(rightTiles[0].path, rightAngle, quadBands[1][1].p1);

		return {
			left: { quads: leftQuads, tiles: leftTiles },
			center: { quads: centerQuads, tiles: centerTiles },
			right: { quads: rightQuads, tiles: rightTiles }
		};
	};

	const getTiledPatternConfig = (type: string, rows: number, columns: number) => {
		const config = tiledPatternConfigs[type];
		config.config.columnCount = columns;
		config.config.rowCount = rows;
		return config;
	};

	const showSegments = (
		segment: MovePathSegment | LinePathSegment,
		path: (MovePathSegment | LinePathSegment)[],
		indexLimit?: number
	) => {
		indexLimit ||= path.length;
		const hovered = path
			.map((seg, i) => ({ index: i % indexLimit, segment: seg }))
			.filter((seg) =>
				isSamePoint({ x: seg.segment[1], y: seg.segment[2] }, { x: segment[1], y: segment[2] }, 10)
			);
		// .filter((seg) => seg.segment[1] === segment[1] && seg.segment[2] === segment[2]);
		hovered.forEach((point) => console.debug(point.index, point.segment));
	};

	const generateTiledBands = ({ quadBands, tiledPatternConfig, address }: GenerateTilingProps) => {
		let { adjustAfterTiling } = patterns[tiledPatternConfig.type];
		if (tiledPatternConfig.type === 'tiledShieldTesselationPattern') {
			adjustAfterTiling = adjustShieldTesselationAfterTiling;
		}

		const tiling = generateTiling({
			quadBands,
			tiledPatternConfig,
			address
		});
		if (adjustAfterTiling) {
			const adjusted = adjustAfterTiling(tiling, tiledPatternConfig);
			adjacentBands = adjusted.adjacentBands;
			return adjusted.bands;
		}
		return tiling;
	};

	let rows = 1;
	let columns = 1;
	let size = 100;
	const bands = quadBands(200, 200);
	const ADDRESS: GeometryAddress<BandAddressed> = { s: 0, g: [0], b: 0 };
	const PIXEL_SCALE: PixelScale = { value: 1, unit: 'cm' };

	let mainPath: Pattern | undefined;
	let adjacentBands: PathSegment[][][];
	let showAdjacent = false;
	const MAIN_SIZE = 800;
	const PATTERN_SIZE = 600;

	$: mainPatternConfig = getTiledPatternConfig('tiledShieldTesselationPattern', rows, columns);

	$: tiledBands = generateTiledBands({
		quadBands: bands,
		tiledPatternConfig: mainPatternConfig,
		address: { s: 0, g: [0], b: 0 }
	});
	$: cross = generateCrossQuad(bands, tiledBands, adjacentBands);
</script>

<header>
	<section>
		<div>
			<CombinedNumberInput label="rows" bind:value={rows} step={1} min={1} max={3} />
			<CombinedNumberInput label="columns" bind:value={columns} step={1} min={1} max={3} />
			<CombinedNumberInput label="size" bind:value={size} step={1} min={1} max={1000} />
		</div>
		{#each Object.values(tiledPatternConfigs) as pattern}
			<button on:click={() => setMainPattern(getTiledPatternConfig(pattern.type, rows, columns))}>
				<PatternTile
					patternType={pattern.type}
					tilingBasis={pattern.tiling}
					{rows}
					{columns}
					width={size}
					height={(pattern.config.aspectRatio || 1) * size}
				/>
			</button>
		{/each}
	</section>
	<!-- <section>
    <svg width="800" height="800" overflow="visible">
      <Outline outlineSegments={branchedPaths} />
    </svg>
  </section> -->
</header>
<main>
	<section>
		{#if mainPath?.pathString && mainPatternConfig}
			<svg
				width={MAIN_SIZE}
				height={MAIN_SIZE}
				viewBox={`${-MAIN_SIZE / 2 + PATTERN_SIZE / 2} ${
					-MAIN_SIZE / 2 + PATTERN_SIZE / 2
				} ${MAIN_SIZE} ${MAIN_SIZE}`}
			>
				<rect
					x="0"
					y="0"
					width={PATTERN_SIZE}
					height={PATTERN_SIZE * (mainPatternConfig.config.aspectRatio || 1)}
					stroke="black"
					fill="none"
				/>
				<path
					d={mainPath.pathString}
					fill="none"
					stroke="black"
					stroke-width="2"
					stroke-linejoin="round"
					stroke-linecap="round"
				/>

				<g>
					{#each mainPath.path.filter((seg) => seg[0] === 'M') as segment, i}
						<circle
							cx={segment[1]}
							cy={segment[2]}
							r="8"
							fill="none"
							stroke="red"
							stroke-width="2"
							class="origin"
						/>
					{/each}
					{#each mainPath.path.filter((seg) => seg[0] === 'L') as segment, i}
						<circle
							cx={segment[1]}
							cy={segment[2]}
							r="4"
							fill="green"
							stroke="none"
							class="destination"
						/>
					{/each}
					{#if mainPath.pointLabels}
						<g>
							{#each mainPath.pointLabels as pl, p}
								{#each pl.segments as segment, s}
									<rect
										x={pl.point.x + s * 24}
										y={pl.point.y - 20}
										width={20}
										height={20}
										fill="white"
										stroke={segment.segment[0] === 'M' ? 'red' : 'green'}
									/>
									<text
										id={`point-label-${segment.index}`}
										class="label-text"
										x={pl.point.x + s * 24 + 2}
										y={pl.point.y - 2}
									>
										{segment.index}
									</text>
								{/each}
							{/each}
						</g>
					{/if}
				</g>
			</svg>
		{/if}
	</section>
	<section>
		{#if mainPath}
			<svg
				width={MAIN_SIZE * 1.5}
				height={MAIN_SIZE}
				viewBox={`${-MAIN_SIZE / 2} ${-MAIN_SIZE / 2 + PATTERN_SIZE / 2} ${
					MAIN_SIZE * 1.5
				} ${MAIN_SIZE}`}
			>
				{#if adjacentBands && showAdjacent}
					<g fill="none" stroke="magenta" stroke-width="5" opacity="0.3">
						{#each adjacentBands[1] as facet}
							<path d={svgPathStringFromSegments(facet)} />
						{/each}
					</g>
				{/if}
				<g>
					{#each cross.left.quads as quad}
						<path
							d={svgPathStringFromSegments(quad)}
							fill="red"
							opacity="0.25"
							stroke="red"
							stroke-width={0.5}
						/>
					{/each}
					{#each cross.center.quads as quad}
						<path
							d={svgPathStringFromSegments(quad)}
							fill="grey"
							opacity="0.25"
							stroke="grey"
							stroke-width={0.5}
						/>
					{/each}
					{#each cross.right.quads as quad}
						<path
							d={svgPathStringFromSegments(quad)}
							fill="blue"
							opacity="0.25"
							stroke="red"
							stroke-width={0.5}
						/>
					{/each}
				</g>
				<g>
					{#each Object.entries(bands[1][0]) as point}
						<text x={point[1].x} y={point[1].y}>{point[0]}</text>
					{/each}
				</g>
				<g fill="none" stroke-width="1" stroke="black">
					{#each cross.center.tiles.facets as facet, f}
						<path
							d={svgPathStringFromSegments(facet.path)}
							stroke={f % 2 === 0 ? 'black' : 'green'}
						/>
						<!-- {#each facet.path as segment}
							<circle
								cx={segment[1]}
								cy={segment[2]}
								r="4"
								fill={segment[0] === 'M' ? 'red' : 'green'}
								on:mouseover={showSegments(segment, facet.path)}
							/>
						{/each} -->
					{/each}
					<path d={svgPathStringFromSegments(cross.left.tiles[0].path)} stroke="red" />
					<!-- {#each cross.left.tiles[0].path as segment}
						<circle
							cx={segment[1]}
							cy={segment[2]}
							r="4"
							fill={segment[0] === 'M' ? 'red' : 'green'}
							on:mouseover={showSegments(segment, cross.left.tiles[0].path)}
						/>
					{/each} -->
					<path d={svgPathStringFromSegments(cross.right.tiles[0].path)} stroke="blue" />

					<!-- {#each cross.right.tiles[0].path as segment}
						<circle
							cx={segment[1]}
							cy={segment[2]}
							r="4"
							fill={segment[0] === 'M' ? 'red' : 'green'}
							on:mouseover={showSegments(segment, [
								...cross.right.tiles[0].path,
								...cross.center.tiles.facets[1].path
							], cross.right.tiles[0].path.length)}
						/>
					{/each} -->
				</g>
			</svg>
		{/if}
	</section>
</main>

<style>
	main {
		background-color: rgb(238, 239, 252);
		display: flex;
		flex-direction: row;
	}
	section {
		border: 1px dotted yellow;
		padding: 40px;
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: 10px;
	}
	svg {
		background-color: bisque;
	}
	.label-text {
		background: white;
	}
</style>
