<script lang="ts">
	import type { PathSegment } from '$lib/cut-pattern/cut-pattern.types';
	import { svgPathStringFromSegments } from '$lib/patterns/flower-of-life';
	import type { Point } from '$lib/patterns/flower-of-life.types';
	import {
		transformShapeByQuadrilateralTransform,
		type Quadrilateral,
		type QuadrilateralTransformMatrix,
		svgLines,
		svgQuad,
		addScaled,
		getQuadrilateralTransformMatrix,
		svgTX,
		transformPatternByQuad,
		generateHexPattern,
		extractShapesFromMappedHexPatterns,
		svgPathStringFromInsettablePolygon,
		getInsetPolygon
	} from '../../lib/patterns/quadrilateral';
	import { logger } from '../../components/svg-logger/logger';

	const hexPatternString = (size: number, index: number): string => {
		const unit = size / (2 * Math.sqrt(3));
		const h = size / 4;
		const segments: [PathSegment[], PathSegment[]] = [
			[
				['M', 0, unit / 2],
				['L', h, 0],
				['L', 2 * h, unit / 2],
				['L', 3 * h, 0],
				['L', 4 * h, unit / 2],
				['M', 0, unit / 2],
				['L', 0, (3 * unit) / 2],
				['M', 2 * h, unit / 2],
				['L', 2 * h, (3 * unit) / 2],
				['M', 4 * h, unit / 2],
				['L', 4 * h, (3 * unit) / 2]
			],
			[
				['M', 0, 0],
				['L', h, unit / 2],
				['L', 2 * h, 0],
				['L', 3 * h, unit / 2],
				['L', 4 * h, 0],
				['M', h, unit / 2],
				['L', h, (3 * unit) / 2],
				['M', 3 * h, unit / 2],
				['L', 3 * h, (3 * unit) / 2]
			]
		];
		return svgPathStringFromSegments(segments[index % 2]);
	};

	const unitHexPattern = generateHexPattern(1);
	const getUnitTransforms = (size: number) => {
		const width = size;
		const height = (3 * size) / (4 * Math.sqrt(3));
		return [
			`translate(0,0)`,
			`translate(0, ${height})`,
			`translate(0, ${2 * height})`,
			`translate(0, ${3 * height})`,
			`translate(0, ${4 * height})`
		];
	};
	let unitSize = 100;
	let unitTransforms = getUnitTransforms(unitSize);

	let unitSquare: Quadrilateral = {
		p0: { x: 0, y: 0 },
		p1: { x: 0, y: 1 },
		p2: { x: 1, y: 1 },
		p3: { x: 1, y: 0 }
	};

	const quads: Quadrilateral[] = [
		{
			p0: { x: 0, y: 0 },
			p1: { x: 320, y: -10 },
			p2: { x: 330, y: 170 },
			p3: { x: 0, y: 160 }
		},
		{
			p0: { x: 0, y: 160 },
			p1: { x: 330, y: 170 },
			p2: { x: 205, y: 325 },
			p3: { x: -45, y: 375 }
		},
		{
			p0: { x: -45, y: 375 },
			p1: { x: 205, y: 325 },
			p2: { x: 180, y: 425 },
			p3: { x: -25, y: 575 }
		}
	];
	const insetWidth = 10;
	const transforms = quads.map((q) => {
		return getQuadrilateralTransformMatrix(q);
	});

	const mappedPatterns = quads.map((q) => transformPatternByQuad(unitHexPattern, q));
	const mappedPatternPaths = mappedPatterns.map((pattern) => svgPathStringFromSegments(pattern));

	const shapes = extractShapesFromMappedHexPatterns(mappedPatterns, quads);
	// console.debug('shapes', shapes);
	const insetShapes = {
		holes: shapes.holes.map((polygon, i) => getInsetPolygon(polygon, insetWidth, i === 6))
	};
	console.debug('inset shapes', shapes.holes, insetShapes);
	let limit = [0,20];
	console.debug('logger', $logger);

	const finalHoles = insetShapes.holes.map((hole) => svgPathStringFromInsettablePolygon(hole))
	const final = svgPathStringFromSegments(shapes.outline).concat(finalHoles.join(" "))
</script>

<main>
	<section>
		<svg viewBox="-100 -100 600 2000" width="600" height="2000">
			<defs>
				<marker id="circle-marker" refX="4" refY="4" viewBox="0 0 8 8" fill="rgba(0,0,0,0.2)">
					<circle cx="4" cy="4" r="4" />
				</marker>
			</defs>
			<!-- <g fill="none">
				{#each quads as quad, i}
					<path d={svgLines(Object.values(quad))} stroke="red" />
					<path
						d={svgLines(
							transformShapeByQuadrilateralTransform(
								Object.values(unitSquare),
								transforms[i],
								quad.p0
							)
						)}
						fill="rgba(200,0,0,.1)"
					/>
					<path class="hex" d={mappedPatternPaths[i]} stroke="magenta" />
				{/each}
			</g>
			<g fill="rgba(0,0,0,0.2)">
				<path d={svgPathStringFromSegments(shapes.outline)} />
				{#each shapes.holes as hole, i}
					{#if i >= limit[0] && i <= limit[1]}
						<path d={svgPathStringFromInsettablePolygon(hole)} />
					{/if}
				{/each}
			</g>
			<g fill="rgba(0, 200,0,.4)" stroke="black">
				{#each insetShapes.holes as hole, i}
					{#if i >= limit[0] && i <= limit[1]}
						<path class={`inset-shape-${i}`} d={svgPathStringFromInsettablePolygon(hole)} />
					{/if}
				{/each}
			</g> -->
			<g>
				<path d={final} fill-rule="evenodd"/>
			</g>
			<!-- <g id="logger-svg">
				{#each $logger.debug as dbg, i}
					<path d={dbg} stroke={$logger.config.colors[i % $logger.config.colors.length]} stroke-width="2"/>
				{/each}
			</g> -->
		</svg>
	</section>
</main>
