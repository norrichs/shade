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
	import { CubicBezierSegment } from '$lib/patterns/shapes/CubicBezierSegment';

	let showLogger = true;
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
	console.debug("transformedCarnation", transformedCarnation)

	const shape0 = new Shape({
		segments: [
			new CubicBezierSegment({
				p0: new Point(0, 0),
				p1: new Point(0, 50),
				p2: new Point(50, 95),
				p3: new Point(100, 95),
				isEdge: false
			}),
			new CubicBezierSegment({
				p0: new Point(100, 95),
				p1: new Point(100, 145),
				p2: new Point(50, 200),
				p3: new Point(0, 200),
				isEdge: false
			}),
			new LineSegment({ p0: new Point(0, 200), p1: new Point(0, 0), isEdge: true })
		]
	});
	const shape1 = new Shape({
		segments: [
			new LineSegment({ p1: new Point(200, -10), p0: new Point(0, 0), isEdge: true }),
			new CubicBezierSegment({
				p0: new Point(200, -10),
				p1: new Point(200, 40),
				p2: new Point(150, 92.5),
				p3: new Point(100, 95),
				isEdge: false
			}),
			new CubicBezierSegment({
				p0: new Point(100, 95),
				p1: new Point(50, 97.5),
				p2: new Point(0, 50),
				p3: new Point(0, 0),
				isEdge: false
			})
		]
	});
	const shape2 = new Shape({
		segments: [
			new CubicBezierSegment({
				p0: new Point(100, 95),
				p1: new Point(100, 145),
				p2: new Point(150, 200),
				p3: new Point(200, 200),
				isEdge: false
			}),
			new CubicBezierSegment({
				p0: new Point(200, 200),
				p1: new Point(200, 250),
				p2: new Point(150, 300),
				p3: new Point(100, 300),
				isEdge: false
			}),
			new CubicBezierSegment({
				p0: new Point(100, 300),
				p1: new Point(50, 300),
				p2: new Point(0, 250),
				p3: new Point(0, 200),
				isEdge: false
			}),
			new CubicBezierSegment({
				p0: new Point(0, 200),
				p1: new Point(50, 200),
				p2: new Point(100, 145),
				p3: new Point(100, 95),
				isEdge: false
			})
		]
	});
	const insetShape0 = shape0.clone();
	const insetShape1 = shape1.clone();
	const insetShape2 = shape2.clone();
	insetShape0.offsetShape(-10);
	insetShape1.offsetShape(-10);
	insetShape2.offsetShape(-10);

</script>

<main>
	<header>
		<div>
			<span>show logger</span><input type="checkbox" bind:checked={showLogger} />
		</div>
	</header>
	<section>
		<svg viewBox="-100 -100 2000 2000" width="4000" height="4000">
			<g transform="translate(0, 0)" fill="none">
				<g>
					<path d={shape0.svgPath} stroke="black" stroke-width="0.2"/>
					<path d={shape1.svgPath} stroke="black" stroke-width="0.2" />
					<path d={shape2.svgPath} stroke="black" stroke-width="0.2" />
				</g>
				<g>
					<path
						id="insetShape0"
						d={insetShape0.svgPath}
						stroke="rgba(100,200,100, 1)"
						fill="rgba(100,200,100, 0.2)"
					/>
					<path
						id="insetShape1"
						d={insetShape1.svgPath}
						stroke="rgba(200,100, 100,1)"
						fill="rgba(200,100, 100, 0.2)"
					/>
					<path
						id="insetShape2"
						d={insetShape2.svgPath}
						stroke="rgba(100,100, 200, 1)"
						fill="rgba(100,100, 200, 0.2)"
					/>
				</g>
			</g>
			{#if showLogger}
				<SvgLogger />
			{/if}
		</svg>
	</section>
</main>
