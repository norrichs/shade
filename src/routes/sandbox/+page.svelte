<script lang="ts">
	import type { FlowerOfLifeConfig } from '$lib/flower-of-life_deprecated';
	import { PointLight, TangentSpaceNormalMap } from 'three';

	interface Circle {
		x: number;
		y: number;
		r: number;
	}
	interface Point {
		x: number;
		y: number;
	}
	interface Triangle {
		[key: string]: Point;
		a: Point;
		b: Point;
		c: Point;
	}
	interface Ellipse {
		r0: number;
		r1: number;
		center?: Point;
		rotation: number;
	}

	const c = { x: 0, y: 0, r: 100 };

	const containingSquare = (c: Circle) => {
		const { x, y, r } = c;
		return `M ${x - r} ${y - r}
            L ${x + r} ${y - r}
            L ${x + r} ${y + r}
            L ${x - r} ${y + r}
            z
    `;
	};

	const arcCircle = (c: Circle): string => {
		const { x, y, r } = c;
		return `M ${x + r} ${y}
          A ${r} ${r} 0 0 0 ${x - r} ${y}
          A ${r} ${r} 0 0 0 ${x + r} ${y}
          z `;
	};

	let gXF = 1;
	let gYF = 1;
	let gA = 60;

	const skewedArc = (c: Circle, angle: number, xFactor: number, yFactor: number) => {
		const { x, y, r } = c;
		const rY = r * xFactor;
		const rX = r * yFactor;
		const a = angle * 1.1;
		return `M ${x + r} ${y}
          A ${rX} ${rY} ${angle} 0 0 ${x - r} ${y}
          A ${rX} ${rY} ${angle} 1 0 ${x + r} ${y}

    `;
	};

	let unitCircle: Circle = { x: 0, y: 0, r: 100 };
	let unitTriangle: Triangle = {
		a: { x: 0, y: 0 },
		b: { x: 200, y: 0 },
		c: { x: 100, y: Math.sqrt(200 * 200 - 100 * 100) }
	};
	let testSkewAngleDeg = 10;

	// Utility
	const midpoint = (p1: Point, p2: Point): Point => ({
		x: (p1.x + p2.x) / 2,
		y: (p1.y + p2.y) / 2
	});
	const getLength = (p1: Point, p2: Point): number =>
		Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
	const radToDeg = (n: number) => (n * 180) / Math.PI;
	const degToRad = (n: number) => (n * Math.PI) / 180;
	const translate = (shape: Triangle, offset: Point) => {
		const newShape = { ...shape };
		for (let p in newShape) {
			newShape[p] = { x: shape[p].x + offset.x, y: shape[p].y + offset.y };
		}
		return newShape;
	};
	const getSkewAngle = (anchor: Point, point: Point) =>
		Math.atan((point.x - anchor.x) / (point.y - anchor.y));

	const getSkewAngleFromTriangle = (t: Triangle): number => {
		const { a, b, c } = t;
		if (a.y !== b.y) {
			throw new Error('triangle needs to be rotated to horizontal');
		}
		const mid = midpoint(a, b);
		const angle = getSkewAngle(mid, c);
		return angle;
	};
	const getSkewCenter = (shape: Triangle): Point => {
		const xValues = Object.values(shape).map((point: Point) => point.x);
		const yValues = Object.values(shape).map((point: Point) => point.y);
		return {
			x: (Math.min(...xValues) + Math.max(...xValues)) / 2,
			y: (Math.min(...yValues) + Math.max(...yValues)) / 2
		};
	};
	const skewXPoint = (anchor: Point, point: Point, skewAngle: number): Point => {
		if (anchor.y === point.y) {
			return point;
		}
		const oldAngle = getSkewAngle(anchor, point);
		const newAngle = oldAngle + skewAngle;
		const newPoint: Point = {
			x: anchor.x + (anchor.y - point.y) * Math.tan(-newAngle),
			y: point.y
		};
		return newPoint;
	};

	const skewXShape = (shape: Triangle, skewAngle: number, overRideAnchor?: Point): Triangle => {
		const skewedShape = { ...shape };
		for (let point in shape) {
			const anchor = {
				x: shape[point].x,
				y: overRideAnchor ? overRideAnchor.y : getSkewCenter(shape).y
			};
			console.debug('anchor', anchor);
			skewedShape[point] = skewXPoint(anchor, shape[point], skewAngle);
		}
		console.debug('skewedShape', skewedShape);

		return skewedShape as Triangle;
	};
	// const getOutsideCenters = (t: Triangle): [Point, Point, Point] => {
	// 	return (Object.values(t) as [Point, Point, Point]).map((p, i, points) => {
	// 		const point = p;
	// 		const rest = points.filter((p, index) => index !== i);
	// 		const mid = midpoint(rest[0], rest[1]);
	// 		const offset = { x: point.x - mid.x, y: point.y - mid.y };
	// 		return { x: mid.x - offset.x, y: mid.y - offset.y };
	// 	}) as [Point, Point, Point];
	// };

	// Output
	const svgTriangle = (t: Triangle) =>
		`M ${t.a.x} ${t.a.y} L ${t.b.x} ${t.b.y} L ${t.c.x} ${t.c.y} z`;

	// const svgMarker = (p: Point, type?: 'circle' | 'cross') => arcCircle({ ...p, r: 2 });
	const svgEllipse = (
		e: Ellipse,
		location: { p1: Point; p2: Point },
		section: 'major' | 'minor' | 'whole'
	): string => {
		if (section === 'minor') {
			return `M ${location.p1.x} ${location.p1.y} A ${e.r0} ${e.r1} ${e.rotation} 0 1 ${location.p2.x} ${location.p2.y} z`;
		}
		if (section === 'major') {
			return `M ${location.p1.x} ${location.p1.y} A ${e.r0} ${e.r1} ${e.rotation} 1 1 ${location.p2.x} ${location.p2.y} z`;
		}
		return `M ${location.p1.x} ${location.p1.y} 
              A ${e.r0} ${e.r1} ${e.rotation} 0 1 ${location.p2.x} ${location.p2.y} 
              A ${e.r0} ${e.r1} ${e.rotation} 1 1 ${location.p1.x} ${location.p1.y} z`;
	};

	const svgArcTriangle = (
		e: Ellipse,
		vertices: Triangle,
		section: 'major' | 'minor' | 'whole'
	): string => {
		if (section === 'minor') {
			return `
				M ${vertices.b.x} ${vertices.b.y} 
				A ${e.r0} ${e.r1} ${e.rotation} 0 1 ${vertices.a.x} ${vertices.a.y}
				A ${e.r0} ${e.r1} ${e.rotation} 0 1 ${vertices.c.x} ${vertices.c.y}
				A ${e.r0} ${e.r1} ${e.rotation} 0 1 ${vertices.b.x} ${vertices.b.y} z
			`;
		}
	};

	// const generateUnitFlower = (t: Triangle) => {
	// 	return Array.from(
	// 		new Set([
	// 			...getOutsideCenters(t),
	// 			...Object.values(t)
	// 			// ...getOutsideCenters(translate(t, t.b)),
	// 			// ...Object.values(translate(t, t.b)),
	// 			// ...getOutsideCenters(translate(t, t.c)),
	// 			// ...Object.values(translate(t, t.c))
	// 		])
	// 	);
	// };

	const generateUnitTriangle = (sideLength: number): Triangle => {
		return {
			a: { x: 0, y: 0 },
			b: { x: sideLength, y: 0 },
			c: { x: sideLength / 2, y: Math.sqrt(Math.pow(sideLength, 2) - Math.pow(sideLength / 2, 2)) }
		};
	};
	const getInsetAmount = (r: number, w: number): number => {
		const base = Math.sqrt(Math.pow(r, 2) - Math.pow(r / 2, 2));
		const inset = r / 2 - Math.sqrt(Math.pow(r - w, 2) - Math.pow(base, 2));
		console.debug('** get inset amount', r, w, inset);
		return inset;
	};

	const insetFromPoints = (
		startPoint: Point,
		endPoint: Point,
		inset: number
	): { start: Point; end: Point } => {
		console.debug('insetFromPoints', startPoint, endPoint, inset);
		const dX = endPoint.x - startPoint.x;
		const dY = endPoint.y - startPoint.y;
		const dL = Math.sqrt(Math.pow(dX, 2) + Math.pow(dY, 2));
		return {
			start: { x: startPoint.x + (dX * inset) / dL, y: startPoint.y + (dY * inset) / dL },
			end: { x: endPoint.x - (dX * inset) / dL, y: endPoint.y - (dY * inset) / dL }
		};
	};

	const generateFlowerTriangle = (config?: {
		flowerConfig?: FlowerOfLifeConfig;
		sideLength: number;
		triangle?: Triangle;
		skewX?: number;
	}) => {
		// get skew, rotation, and scale from given triangle
		const patternMode = config?.flowerConfig?.mode;
		const skewX = config?.skewX || (-10 * Math.PI) / 180;
		const width = config?.flowerConfig?.width || 5;

		const unitTriangle = generateUnitTriangle(sideLength);
		const t = skewXShape(unitTriangle, skewX, { x: 0, y: 0 });
		let path = '';
		if (patternMode === 'layout') {
			const layoutSkewedCircle = getSkewedCircle({ x: 0, y: 0, r: sideLength / 2 }, skewX);
			const layoutArcs = {
				ab: svgEllipse(layoutSkewedCircle, { p1: t.b, p2: t.a }, 'minor'),
				bc: svgEllipse(layoutSkewedCircle, { p1: t.c, p2: t.b }, 'minor'),
				cb: svgEllipse(layoutSkewedCircle, { p1: t.a, p2: t.c }, 'minor')
			};
			path = `${svgTriangle(t)} ${layoutArcs.ab} ${layoutArcs.bc} ${layoutArcs.cb}`;
		} else if (patternMode === 'contained') {
			const innerSkewedCircle = getSkewedCircle(
				{ x: 0, y: 0, r: sideLength / 2 - width / 2 },
				skewX
			);
			const outerSkewedCircle = getSkewedCircle(
				{ x: 0, y: 0, r: sideLength / 2 + width / 2 },
				skewX
			);
			const inset = getInsetAmount(sideLength / 2, width);
			const outerInsetFromEdge = Math.sqrt(
				Math.pow(sideLength / 2 + width / 2, 2) - Math.pow(sideLength / 2, 2)
			);
			console.debug(
				'outerSkewedCircle',
				outerSkewedCircle,
				'outerInsetFromEdge',
				outerInsetFromEdge
			);
			const anchorPoint: Point = { x: 0, y: 0 };
			const unskewedInnerCircleAnchors = {
				ab: insetFromPoints(t.b, t.a, inset),
				bc: insetFromPoints(t.c, t.b, inset),
				ac: insetFromPoints(t.a, t.c, inset)
			};
			
			const skewedCircleAnchors = {
				ab: {
					p1: skewXPoint(anchorPoint, unskewedInnerCircleAnchors.ab.start, 0),
					p2: skewXPoint(anchorPoint, unskewedInnerCircleAnchors.ab.end, 0)
				},
				bc: {
					p1: skewXPoint(anchorPoint, unskewedInnerCircleAnchors.bc.start, 0),
					p2: skewXPoint(anchorPoint, unskewedInnerCircleAnchors.bc.end, 0)
				},
				ac: {
					p1: skewXPoint(anchorPoint, unskewedInnerCircleAnchors.ac.start, 0),
					p2: skewXPoint(anchorPoint, unskewedInnerCircleAnchors.ac.end, 0)
				}
			};
			const innerArcs = {
				ab: svgEllipse(innerSkewedCircle, skewedCircleAnchors.ab, 'minor'),
				bc: svgEllipse(innerSkewedCircle, skewedCircleAnchors.bc, 'minor'),
				ac: svgEllipse(innerSkewedCircle, skewedCircleAnchors.ac, 'minor')
			};
			console.debug('innerArcs', innerArcs);

			const unskewedInnerTrianglePoints: Triangle = {
				a: {
					x: unitTriangle.a.x + outerInsetFromEdge * Math.cos(Math.PI / 6),
					y: unitTriangle.a.y + outerInsetFromEdge * Math.sin(Math.PI / 6)
				},
				b: {
					x: unitTriangle.b.x - outerInsetFromEdge * Math.cos(Math.PI / 6),
					y: unitTriangle.b.y + outerInsetFromEdge * Math.sin(Math.PI / 6)
				},
				c: { x: unitTriangle.c.x, y: unitTriangle.c.y - outerInsetFromEdge }
			};
			console.debug('unskewedInnerTrianglePoints', unskewedInnerTrianglePoints);
			const skewedInnerTrianglePoints = skewXShape(unskewedInnerTrianglePoints, skewX, {
				x: 0,
				y: 0
			});
			const outerArcAnchors = {
				ab: { p1: skewedInnerTrianglePoints.b, p2: skewedInnerTrianglePoints.a },
				bc: { p1: skewedInnerTrianglePoints.c, p2: skewedInnerTrianglePoints.b },
				ac: { p1: skewedInnerTrianglePoints.a, p2: skewedInnerTrianglePoints.c }
			};
			console.debug('outerArcs', outerArcAnchors);

			const outerArcsTriangle = svgArcTriangle(
				outerSkewedCircle,
				skewedInnerTrianglePoints,
				'minor'
			);

			path = `${svgTriangle(t)} ${innerArcs.ab} ${innerArcs.bc} ${
				innerArcs.ac
			} ${outerArcsTriangle}`;
		}
		return path;
	};

	// TODO -
	// 2 possible approaches to finding skewed circle / line intersections
	// 1 - find intersection at circle / unskewed line, then skew the 2 points
	// 2 - can we just use a parametric representation of the ellipse?.  if we had it we could find the intersections with a line pretty easily

	const getSkewedCircle = (circle: Circle, skewAngle: number): Ellipse => {
		console.debug('getSkewedCircle', circle, skewAngle);
		// Follow tutorial
		// unit circle, skew angle -> P and Q -> ellipse equation -> major and minor axes endpoints -> rotation
		const P: Point = skewXPoint(
			{ x: circle.x, y: circle.y },
			{ x: circle.x, y: circle.y + circle.r },
			-skewAngle
		);
		console.debug('  P', P);
		const Q: Point = { x: circle.x + circle.r, y: circle.y };
		console.debug('  Q', Q);
		const A: number = P.y * P.y + Q.y * Q.y;
		const B: number = -2 * (P.x * P.y + Q.x * Q.y);
		const C: number = P.x * P.x + Q.x * Q.x;
		const D = 0;
		const E = 0;
		const F: number = -Math.pow(P.x * Q.y - Q.x * P.y, 2);
		const beta: number = (C - A) / B;
		console.debug('  A', A);
		console.debug('  B', B);
		console.debug('  C', C);
		console.debug('  F', F);
		console.debug('  beta', beta);

		const mValues: [number, number] = [
			beta + Math.sqrt(beta * beta + 1),
			beta - Math.sqrt(beta * beta + 1)
		];
		const xValues = mValues.map((m) => {
			return [
				Math.sqrt(-F / (A + B * m + C * m * m)),
				-1 * Math.sqrt(-F / (A + B * m + C * m * m))
			];
		});
		console.debug('  xValues', xValues);
		const axes = [
			{
				m: mValues[0],
				length: 0,
				rotation: 0,
				p1: { x: xValues[0][0], y: mValues[0] * xValues[0][0] },
				p2: { x: xValues[0][1], y: mValues[0] * xValues[0][1] }
			},
			{
				m: mValues[1],
				length: 0,
				rotation: 0,
				p1: { x: xValues[1][0], y: mValues[1] * xValues[1][0] },
				p2: { x: xValues[1][1], y: mValues[1] * xValues[1][1] }
			}
		];
		console.debug('  axes', axes);
		const lengths = axes.map((axis) => getLength(axis.p1, axis.p2));
		axes[0].length = lengths[0];
		axes[1].length = lengths[1];

		const major = axes[lengths.findIndex((l) => l === Math.max(...lengths))];
		const minor = axes[lengths.findIndex((l) => l === Math.min(...lengths))];
		const ellipse = {
			r0: major.length,
			r1: minor.length,
			center: { x: 0, y: 0 },
			rotation: radToDeg(getSkewAngle({ x: 0, y: 0 }, major.p1)) + 90
		};
		console.debug('ellipse', ellipse);
		return ellipse;
	};

	let flowerConfig: FlowerOfLifeConfig = {
		width: 10,
		mode: 'contained'
	};
	let sideLength = 300;
	$: skewedTriangle = skewXShape(generateUnitTriangle(sideLength), degToRad(testSkewAngleDeg), {
		x: 0,
		y: 0
	});
	$: testFlowerTriangle = generateFlowerTriangle({
		flowerConfig,
		sideLength,
		skewX: degToRad(testSkewAngleDeg)
	});
	// $: flowerCenters = generateUnitFlower(unitTriangle);
	// $: {
	// 	console.debug('flowerCenters', flowerCenters);
	// }
	// let testEllipse: Ellipse;
	// $: {
	// 	try {
	// 		testEllipse = getSkewedCircle(unitCircle, degToRad(testSkewAngleDeg));
	// 	} catch (err) {
	// 		console.error(err);
	// 	}
	// }

	const onChangeSkewAngle = (event: any) =>
		event.target.value && event.target.value !== 0 ? event.target.value : 0.000001;
	let drawEllipses: 'whole' | 'major' | 'minor' = 'whole';
</script>

<div>
	<div class="row">
		<div>mode</div>
		<select bind:value={flowerConfig.mode}>
			<option>layout</option>
			<option>contained</option>
			<option>contributing</option>
		</select>
	</div>
	<div class="row">
		<div>width</div>
		<input type="number" min={0} max={sideLength / 2} step="0.1" bind:value={flowerConfig.width} />
		<input
			type="range"
			min="{0}}"
			max={sideLength / 2}
			step="0.1"
			bind:value={flowerConfig.width}
		/>
	</div>
	<div class="row">
		<div>unitSize</div>
		<input type="number" min={10} max="500" step="1" bind:value={sideLength} />
		<input type="range" min={10} max="500" step="1" bind:value={sideLength} />
	</div>
	<div class="row">
		<div>angle</div>
		<input
			type="number"
			min={-90}
			max="90"
			step="0.1"
			bind:value={testSkewAngleDeg}
			on:change={onChangeSkewAngle}
		/>
		<input
			type="range"
			min={-90}
			max="90"
			step="0.1"
			bind:value={testSkewAngleDeg}
			on:change={onChangeSkewAngle}
		/>
	</div>

	<svg id="sandbox-svg" height={1000} width={1000} viewBox="-200 -300 1200 1200">
		<g transform={`translate(${0} ${0})`} fill="none" stroke="black" stroke-width="1">
			<circle cx="0" cy="0" r="5" />

			<path d={testFlowerTriangle} stroke="none" fill="pink" fill-rule="evenodd" />
			<path
				transform={`translate(${sideLength} ${0})`}
				d={testFlowerTriangle}
				stroke="none"
				fill="pink"
				fill-rule="evenodd"
			/>
			<!-- <path
				transform={`scale(-1 -1) translate(${skewedTriangle.c.x * 3 - skewedTriangle.a.x} ${
					skewedTriangle.a.y - skewedTriangle.c.y
				})`}
				d={testFlowerTriangle}
				stroke="green"
			/> -->

			<path
				transform={`translate(${skewedTriangle.c.x - skewedTriangle.a.x} ${
					skewedTriangle.c.y - skewedTriangle.a.y
				})`}
				d={testFlowerTriangle}
				stroke="none"
				fill="pink"
				fill-rule="evenodd"
			/>
		</g>

		<!-- <g
			transform={`skewX(${testSkewAngleDeg})`}
			fill="rgba(255, 0, 0, 0.03)"
			stroke="red"
			stroke-width="0.2"
		>
			{#each flowerCenters as center}
				<path d={arcCircle({ ...center, r: 100 })} />
			{/each}
			<path
				d={svgTriangle(unitTriangle)}
				fill="rgba(0, 0, 255, 0.1)"
				stroke="red"
				stroke-width="0.2"
			/>
		</g> -->

		<!-- <g transform={`translate(${600})`}>
			<g fill="rgba(0, 0, 255, 0.1)" stroke="blue" stroke-width="0.2">
				<path d={svgTriangle(skewedTriangle)} />

				<path
					d={getOutsideCenters(skewedTriangle)
						.map((p) => svgMarker(p))
						.join('')}
				/>
			</g>

			<g fill="rgba(0, 255, 0, 0.1)" stroke="none">
				<path
					d={svgEllipse(
						testEllipse,
						{
							p1: skewedTriangle.a,
							p2: skewedTriangle.c
						},
						'whole'
					)}
				/>
				<path
					d={svgEllipse(
						testEllipse,
						{
							p1: skewedTriangle.b,
							p2: skewedTriangle.a
						},
						'whole'
					)}
				/>
				<path
					d={svgEllipse(
						testEllipse,
						{
							p1: skewedTriangle.c,
							p2: skewedTriangle.b
						},
						'whole'
					)}
				/>
			</g>
		</g> -->
	</svg>
</div>

<style>
	.row {
		display: flex;
		flex-direction: row;
		gap: 10px;
		padding: 5px;
		border: 1px solid black;
		border-radius: 3px;
		margin: 5px;
	}
</style>
