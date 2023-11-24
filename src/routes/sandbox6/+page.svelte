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
		getInsetPolygon,
		generateCarnationPattern,
		type CarnationPattern
	} from '../../lib/patterns/quadrilateral';

	import { logger } from '../../components/svg-logger/logger';

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
</script>

<main>
	<section>
		<svg viewBox="-100 -100 600 2000" width="600" height="2000">
			<g stroke="black" stroke-width="1" fill="none">
				<path d={`M 0 0 L 100 0 L 100 100 L 0 100 L 0 0 Z`} />
				<path d={svgPathStringFromSegments(generateCarnationPattern(100))} />
			</g>
			<g stroke="black" stroke-width="1" fill="none" transform="translate(0 500)">
				<path d={svgQuad(quad)} />
				<path d={svgPathStringFromSegments(transformedCarnation)} />
			</g>
		</svg>
	</section>
</main>
