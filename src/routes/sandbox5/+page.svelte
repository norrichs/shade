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
		svgTX
	} from '../../lib/patterns/quadrilateral';

	const hexPattern = (size: number, index: number): string => {
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

	let unitPattern: Point[] = [
		{ x: 0, y: 0 },
		{ x: 0, y: 0.2 },
		{ x: 0.1, y: 0.2 },
		{ x: 0.1, y: 0.4 },
		{ x: 0, y: 0.4 },
		{ x: 0, y: 0.6 },
		{ x: 0.1, y: 0.6 },
		{ x: 0.1, y: 0.8 },
		{ x: 0, y: 0.8 },
		{ x: 0, y: 1 },
		{ x: 0.2, y: 1 },
		{ x: 0.2, y: 0.9 },
		{ x: 0.4, y: 0.9 },
		{ x: 0.4, y: 1 },
		{ x: 0.6, y: 1 },
		{ x: 0.6, y: 0.9 },
		{ x: 0.8, y: 0.9 },
		{ x: 0.8, y: 1 },
		{ x: 1, y: 1 },
		{ x: 1, y: 1 },
		{ x: 1, y: 0.8 },
		{ x: 0.9, y: 0.8 },
		{ x: 0.9, y: 0.6 },
		{ x: 1, y: 0.6 },
		{ x: 1, y: 0.4 },
		{ x: 0.9, y: 0.4 },
		{ x: 0.9, y: 0.2 },
		{ x: 1, y: 0.2 },
		{ x: 1, y: 0 }
	];

	let txMatrix: QuadrilateralTransformMatrix = {
		u: { x: 300, y: 50 },
		v: { x: -20, y: 200 },
		w: { x: -50, y: -30 }
	};
	const quad1: Quadrilateral = {
		p0: { x: 0, y: 0 },
		p1: { x: 320, y: -10 },
		p2: { x: 330, y: 170 },
		p3: { x: 0, y: 160 }
	};
	const quad2: Quadrilateral = {
		p0: { ...quad1.p3 },
		p1: { ...quad1.p2 },
		p2: { x: 205, y: 325 },
		p3: { x: -45, y: 375 }
	};
	const quad3: Quadrilateral = {
		p0: { ...quad2.p3 },
		p1: { ...quad2.p2 },
		p2: { x: 180, y: 425 },
		p3: { x: -25, y: 575 }
	};
	const tx1 = getQuadrilateralTransformMatrix(quad1);
	const tx2 = getQuadrilateralTransformMatrix(quad2);
	const tx3 = getQuadrilateralTransformMatrix(quad3);

	console.debug('quad1', quad1, tx1);
	console.debug('quad2', quad2, tx2);
	console.debug('quad3', quad3, tx3);

	// const txMatrix1 = get
</script>

<main>
	<section>
		<svg viewBox="-100 -100 600 2000" width="600" height="2000">
			<defs>
				<marker id="circle-marker" refX="4" refY="4" viewBox="0 0 8 8" fill="rgba(0,0,0,0.2)">
					<circle cx="4" cy="4" r="4" />
				</marker>
			</defs>
			<g fill="none">
				<path d={svgLines(Object.values(quad1))} stroke="red" />
				<path d={svgLines(Object.values(quad2))} stroke="blue" />
				<path d={svgLines(Object.values(quad3))} stroke="purple" />
			</g>
			<g>
				<path
					d={svgLines(
						transformShapeByQuadrilateralTransform(
							Object.values(unitPattern),
							getQuadrilateralTransformMatrix(quad1),
							quad1.p0
						)
					)}
					fill="rgba(200,0,0,.1)"
				/>
				<path
					d={svgLines(
						transformShapeByQuadrilateralTransform(
							Object.values(unitPattern),
							getQuadrilateralTransformMatrix(quad2),
							quad2.p0
						)
					)}
					fill="rgba(100,200,0,.3)"
				/>
				<path
					d={svgLines(
						transformShapeByQuadrilateralTransform(
							Object.values(unitPattern),
							getQuadrilateralTransformMatrix(quad3),
							quad3.p0
						)
					)}
					fill="rgba(100,100,200,.3)"
				/>
			</g>
			<!-- <g stroke-width="4" fill="none">
				<path d={svgTX(tx1, quad1.p0)} stroke="magenta" marker-end="url(#circle-marker)"/>
				<path d={svgTX(tx2, quad2.p0)} stroke="rebeccapurple" marker-end="url(#circle-marker)"/>
				<path d={svgTX(tx3, quad3.p0)} stroke="orangered" marker-end="url(#circle-marker)"/>
			</g> -->
			<!-- <g stroke="black" stroke-width="2" fill="none">
				{#each unitTransforms as tx, i}
					<path d={hexPattern(unitSize, i)} transform={unitTransforms[i]} />
				{/each}
			</g> -->
		</svg>
		<!-- <svg viewBox="-100 -100 600 600" width="600" height="600">
			<g fill="none">
				<path d={svgLines([{ x: 0, y: 0 }, txMatrix.u])} stroke="magenta" stroke-width="4" />
				<path d={svgLines([{ x: 0, y: 0 }, txMatrix.v])} stroke="blue" stroke-width="4" />
				<path
					d={svgLines([
						addScaled(txMatrix.v, txMatrix.u, 1),
						addScaled(addScaled(txMatrix.v, txMatrix.u, 1), txMatrix.w, 1)
					])}
					stroke="green"
					stroke-width="4"
				/>
				<path
					d={svgLines(transformShapeByQuadrilateralTransform(unitPattern, txMatrix))}
					stroke="red"
				/>
			</g>
			<g fill="rgba(200, 100, 0, 0.2)">
				<path d={svgQuad(quad1)} stroke="none" />
			</g>
			<g fill="none">
				<path
					d={svgLines(transformShapeByQuadrilateralTransform(Object.values(unitSquare), txMatrix2))}
					stroke="purple"
					stroke-width="5"
				/>
			</g>
      <g fill="rgba(200,0,0,0.3)" stroke="none">
        <circle cx={txMatrix2.u.x} cy={txMatrix2.u.y} r=10 />
        <circle cx={txMatrix2.v.x} cy={txMatrix2.v.y} r=10 />
        <circle cx={txMatrix2.w.x} cy={txMatrix2.w.y} r=10 />
      </g>
		</svg> -->
		<!-- <g stroke="black" stroke-width="2" fill="none">
      {#each unitTransforms as tx, i}
        <path d={hexPattern(unitSize, i)} transform={unitTransforms[i]} />
      {/each}
    </g> -->
	</section>
</main>
