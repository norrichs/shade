<script lang="ts">
	import type { PathSegment } from '$lib/cut-pattern/cut-pattern.types';
	import { svgPathStringFromSegments } from '$lib/patterns/flower-of-life';
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
		getInsetPolygon,
		generateCarnationPattern,
		type CarnationPattern,
		extractShapesFromMappedCarnationPatterns
	} from '../../lib/patterns/quadrilateral';

	import { logger } from '../../components/svg-logger/logger';
	import { LineSegment, Point, Shape } from '$lib/patterns/shapes';
	import SvgLogger from '../../components/svg-logger/SvgLogger.svelte';
	import { CubicBezierSegment } from '$lib/patterns/shapes/CubicBezierSegment';
	import CombinedNumberInput from '../../components/controls/CombinedNumberInput.svelte';

	let showLogger = true;
	const quads: Quadrilateral[] = [
		{
			p0: { x: 0, y: 0 },
			p1: { x: 300, y: -20 },
			p2: { x: 340, y: 200 },
			p3: { x: -20, y: 175 }
		},
		{
			p0: { x: -20, y: 175 },
			p1: { x: 340, y: 200 },
			p2: { x: 222, y: 500 },
			p3: { x: -10, y: 555 }
		},
		{
			p0: { x: -10, y: 555 },
			p1: { x: 222, y: 500 },
			p2: { x: 340, y: 725 },
			p3: { x: 10, y: 700 }
		}
	];

	let carnationStrength = 0.5;
	let carnationWidth = 20;

	const transformedCarnations = quads.map((quad) => {
		const transformedCarnation = transformPatternByQuad<CarnationPattern>(
			generateCarnationPattern(1, carnationStrength),
			quad
		);
		return transformedCarnation;
	});

	let shapes = extractShapesFromMappedCarnationPatterns(transformedCarnations, quads);
	$: {
		updateShapes(carnationWidth);
	}
	const updateShapes = (width: number) => {
		console.debug('updateShapes', width);
		shapes.forEach((shape) => shape.offsetShape(-width));
		shapes = shapes;
	};

	console.debug('transformedCarnation', transformedCarnations);
</script>

<main>
	<header>
		<div>
			<span>show logger</span><input type="checkbox" bind:checked={showLogger} />
			<CombinedNumberInput bind:value={carnationWidth} label="Width" step={0.1} min={0} max={20} />
		</div>
	</header>
	<section>
		<div>{carnationWidth}</div>
		<svg viewBox="-100 -100 2000 2000" width="4000" height="4000">
			<g transform="translate(0, 0)">
				<g fill="none" stroke-width={0.5} stroke="black">
					{#each quads as quad, i}
						<path d={svgQuad(quad)} />
						<path d={svgPathStringFromSegments(transformedCarnations[i])} />
					{/each}
				</g>
				<g fill="red" stroke-width={2} stroke="black">
					{#each shapes as shape, i}
						<path d={shape.svgPath} />
					{/each}
				</g>
			</g>
			{#if showLogger}
				<SvgLogger />
			{/if}
		</svg>
	</section>
</main>
