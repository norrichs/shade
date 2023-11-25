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
		type CarnationPattern
	} from '../../lib/patterns/quadrilateral';

	import { logger } from '../../components/svg-logger/logger';
	import { LineSegment, Point, Shape } from '$lib/patterns/shapes';
	import SvgLogger from '../../components/svg-logger/SvgLogger.svelte';

	const quad: Quadrilateral = {
		p0: { x: 0, y: 0 },
		p1: { x: 300, y: -20 },
		p2: { x: 340, y: 200 },
		p3: { x: -20, y: 175 }
	};

	const quadTransform = getQuadrilateralTransformMatrix(quad);
	const transformedCarnation = transformPatternByQuad<CarnationPattern>(
		generateCarnationPattern(1),
		quad
	);

	const line0 = new LineSegment({ p0: new Point(0, 0), p1: new Point(100, 0) });
	const line1 = new LineSegment({ prev: line0, p1: new Point(100, 300) });
	const line2 = new LineSegment({ prev: line1, p1: new Point(0, 300) });
	const line3 = new LineSegment({ prev: line2, p1: new Point(0, 0) });
	const shape0 = new Shape({ segments: [line0, line1, line2, line3], isPermeable: true });
	const shape1 = new Shape({
		segments: [
			[0, 0],
			[400, 0],
			[359, 400],
			[200, 350],
			[300, 250],
			[0, 300]
		]
	});
	const offsetShape1 = shape1.clone();
	offsetShape1.offsetShape(-10)


</script>

<main>
	<section>
		<svg viewBox="-100 -100 600 2000" width="600" height="2000">

			<g>
				<path d={shape1.svgPath} fill="red" />
				{#each offsetShape1.segments as seg, i}
					<path d={svgLines([seg.p0, seg.p1])} stroke="green" stroke-width="1" />
				{/each}
			</g>
			<!-- <SvgLogger /> -->
		</svg>
	</section>
</main>
