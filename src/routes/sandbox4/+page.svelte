<script lang="ts">
	import type { PathSegment } from '$lib/cut-pattern/cut-pattern.types';
	import { flatten_convert } from '$lib/flatten/flatten';
	import type { Ellipse, Point } from '$lib/patterns/flower-of-life.types';
	import CombinedNumberInput from '../../components/controls/CheckboxInput.svelte';
	import { getCenterParameters, type ArcParams, getIntersectionsOfLineAndEllipse } from '../../lib/patterns/ellipse';

	// Utilities

	const isArcParams = (arc: ArcParams | Ellipse): arc is ArcParams => {
		return (
			Object.hasOwn(arc, 'rotationRadians') && Object.hasOwn(arc, 'p0') && Object.hasOwn(arc, 'p1')
		);
	};
	const rad = (n: number) => (n * Math.PI) / 180;
	const deg = (n: number) => (n * 180) / Math.PI;

	let svgTransform = (tx: any) =>
		`translate(${tx.translate?.x || 0}, ${tx.translate?.y || 0}) 
		 rotate(${tx.rotate || 0}) 
		 skewX(${tx.skew?.x || 0}) 
		 skewY(${tx.skew?.y || 0}) 
		 scale(${tx.scale?.x || 1}, ${tx.scale?.y || 1})`;

	const svgLine = (p0: Point, p1: Point): string => {
		return `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`;
	};
	const svgArc = (ell: Ellipse | ArcParams, p0: Point, p1: Point): string => {
		const rot = isArcParams(ell) ? ell.rotationRadians : rad(ell.rotation);
		return `M ${p0.x} ${p0.y}
    A ${ell.r0} ${ell.r1} ${rot} 0 0 ${p1.x} ${p1.y}`;
	};
	const parseArcSegments = (arc: [PathSegment, PathSegment]): ArcParams | undefined => {
		if (arc[0].length === 3 && arc[1].length === 8) {
			const result: ArcParams = {
				p0: { x: arc[0][1], y: arc[0][2] },
				r0: arc[1][1],
				r1: arc[1][2],
				rotationRadians: rad(arc[1][3]),
				fa: arc[1][4] as 0 | 1,
				fs: arc[1][5] as 0 | 1,
				p1: { x: arc[1][6], y: arc[1][7] }
			};
			return result;
		}
		return undefined;
	};
	const parseArcString = (arc: string): ArcParams | undefined => {
		const arr = arc.split(' ');
		return parseArcSegments([arr.slice(0, 2), arr.slice(3, 11)] as [PathSegment, PathSegment]);
	};

	const svgFullEllipseArcFromSegments = (arc: PathSegment[]) => {
		if (arc[1][0] !== 'A' || arc.length !== 2) {
			throw new Error('argument is not an Arc PathSegment');
		}
		console.debug('arc', arc);
		return `M ${arc[0][1]} ${arc[0][2]}
		A ${arc[1][1]} ${arc[1][2]} ${arc[1][3]} ${arc[1][4]} ${arc[1][5]} ${arc[1][6]} ${arc[1][7]}
		A ${arc[1][1]} ${arc[1][2]} ${arc[1][3]} ${arc[1][4] ? 0 : 1} ${arc[1][5]} ${arc[0][1]} ${
			arc[0][2]
		}`;
	};
	const svgLineFromSegments = (l: PathSegment[]) => {
		return `M ${l[0][1]} ${l[0][2]} L ${l[1][1]} ${l[1][2]}`;
	};
	const getPointsFromSegments = (l: PathSegment[]): [Point, Point] => {
		return [
			{ x: l[0][1] || 0, y: l[0][2] || 0 },
			{ x: l[1][1] || 0, y: l[1][2] || 0 }
		];
	};

	const svgFullEllipseArcFromParams = (arc: ArcParams) => {
		const path = `M ${arc.p0.x} ${arc.p0.y}
		A ${arc.r0} ${arc.r1} ${(arc.rotationRadians * 180) / Math.PI} ${arc.fa} ${arc.fs} ${arc.p1.x} ${
			arc.p1.y
		}
		Z
		M ${arc.p1.x} ${arc.p1.y}
		A ${arc.r0} ${arc.r1} ${(arc.rotationRadians * 180) / Math.PI} ${arc.fa ? 0 : 1} ${arc.fs} ${
			arc.p0.x
		} ${arc.p0.y}`;
		console.debug('Ellips from params', path);
		return path;
	};

	const getArcParams = (arc: string | [PathSegment, PathSegment]) => {
		let arcParams: ArcParams;
		if (typeof arc === 'string') {
			arcParams = parseArcString(arc) as ArcParams;
			return arcParams;
		} else {
			arcParams = parseArcSegments(arc) as ArcParams;
		}
	};

	const getCenteringTransform = (arc: ArcParams): { rotate: number; translate: Point } => {
		const { center } = getCenterParameters(arc);

		const centering = {
			rotate: -deg(arc.rotationRadians),
			translate: { x: -center.x, y: -center.y }
		};
		return centering;
	};

	// Data
	const size = 100;
	let width = 10;
	let p0: Point = { x: 0, y: 0 };
	let p1: Point = { x: size, y: 0 };
	let ell: Ellipse = { r0: size, r1: size, rotation: 0, center: { x: -0, y: 0 } };
	let transform = {
		translate: { x: 40, y: -50 },
		rotate: 60,
		skew: { x: 50, y: 0 },
		scale: { x: 1.4, y: 1 }
	};

	const svgCenteringTransform = (ct: any) =>
		`rotate(${ct.rotate}) translate(${ct.translate.x}, ${ct.translate.y})`;


	// Transform circle to arbitrary ellipse
	const tx = svgTransform(transform);
	let txLinePoints = getPointsFromSegments(flatten_convert(svgLine(p0, p1), tx));
	let txEllipse = parseArcSegments(
		flatten_convert(svgArc(ell, p0, p1), tx) as [PathSegment, PathSegment]
	) as ArcParams;

	// Convert to standard ellipse
	let centeringTransform = getCenteringTransform(txEllipse);
	let ctx = svgCenteringTransform(centeringTransform);
	let cLinePoints = getPointsFromSegments(flatten_convert(svgLine(...txLinePoints), ctx));
	let cEllipse = parseArcSegments(
		flatten_convert(svgFullEllipseArcFromParams(txEllipse), ctx) as [PathSegment, PathSegment]
	) as ArcParams;

	// Shrink standard ellipse
	let reducedCenteredEllipse = {
		...cEllipse,
		r0: cEllipse.r0 - width / 2,
		r1: cEllipse.r1 - width / 2
	};
	let reducedCenteredEllipseCenteringTransform = getCenteringTransform(reducedCenteredEllipse);
	reducedCenteredEllipse = parseArcSegments(
		flatten_convert(
			svgFullEllipseArcFromParams(reducedCenteredEllipse),
			svgCenteringTransform(reducedCenteredEllipseCenteringTransform)
		) as [PathSegment, PathSegment]
	) as ArcParams;

	// Find intersections
	let intersections = getIntersectionsOfLineAndEllipse(
		{ a: reducedCenteredEllipse.r0, b: reducedCenteredEllipse.r1 },
		cLinePoints[0],
		cLinePoints[1]
	);
	let reducedCenteredClippedEllipse = {
		...reducedCenteredEllipse,
		p0: intersections[0],
		p1: intersections[1]
	};
	let restoringTransform = {
		rotate: -centeringTransform.rotate,
		translate: {
			x: -centeringTransform.translate.x,
			y: -centeringTransform.translate.y
		}
	};

	const update = (transform: any, width: number) => {
		// Transform
		const tx = svgTransform(transform);
		console.debug('---------update---------');
		txLinePoints = getPointsFromSegments(flatten_convert(svgLine(p0, p1), tx));
		txEllipse = parseArcSegments(
			flatten_convert(svgArc(ell, p0, p1), tx) as [PathSegment, PathSegment]
		) as ArcParams;
		// Centering
		centeringTransform = getCenteringTransform(txEllipse);
		ctx = `rotate(${centeringTransform.rotate}) translate(${centeringTransform.translate.x}, ${centeringTransform.translate.y})`; //svgTransform(centeringTransform);
		cLinePoints = getPointsFromSegments(flatten_convert(svgLine(...txLinePoints), ctx));
		cEllipse = parseArcSegments(
			flatten_convert(svgFullEllipseArcFromParams(txEllipse), ctx) as [PathSegment, PathSegment]
		) as ArcParams;
		// Reduce
		reducedCenteredEllipse = {
			...cEllipse,
			r0: cEllipse.r0 - width / 2,
			r1: cEllipse.r1 - width / 2
		};
		reducedCenteredEllipseCenteringTransform = getCenteringTransform(reducedCenteredEllipse);
		reducedCenteredEllipse = parseArcSegments(
			flatten_convert(
				svgFullEllipseArcFromParams(reducedCenteredEllipse),
				svgCenteringTransform(reducedCenteredEllipseCenteringTransform)
			) as [PathSegment, PathSegment]
		) as ArcParams;

		// Find intersections
		intersections = getIntersectionsOfLineAndEllipse(
			{ a: reducedCenteredEllipse.r0, b: reducedCenteredEllipse.r1 },
			cLinePoints[0],
			cLinePoints[1]
		);
		reducedCenteredClippedEllipse = {
			...reducedCenteredEllipse,
			p0: intersections[0],
			p1: intersections[1]
		};
		restoringTransform = {
			rotate: -centeringTransform.rotate,
			translate: {
				x: -centeringTransform.translate.x,
				y: -centeringTransform.translate.y
			}
		};
	};

	$: {
		update(transform, width);
	}
</script>

<main>
	<header>
		<a href="/"> back </a>
		<div>Sandbox - distorted flower of life with static widths</div>
		<div><span>centering</span><span>{ctx}</span></div>
	</header>
	<section>
		<CombinedNumberInput
			bind:value={transform.rotate}
			label="rotation"
			min={0}
			max={360}
			step={1}
		/>
		<CombinedNumberInput bind:value={transform.skew.x} label="skewX" min={0} max={90} step={1} />
		<CombinedNumberInput
			bind:value={transform.scale.y}
			label="scaleY"
			min={1}
			max={10}
			step={0.1}
		/>
		<CombinedNumberInput
			bind:value={transform.scale.x}
			label="scaleX"
			min={1}
			max={10}
			step={0.1}
		/>
		<CombinedNumberInput
			bind:value={transform.translate.x}
			label="translateX"
			min={-1000}
			max={1000}
			step={1}
		/>
		<CombinedNumberInput
			bind:value={transform.translate.y}
			label="translateY"
			min={-1000}
			max={1000}
			step={1}
		/>
		<CombinedNumberInput bind:value={width} label="width" min={0} max={size / 2} step={0.1} />
	</section>
	<section>
		<svg width="1000" height="1000" viewBox="-500 -500 1000 1000">
			<g id="axes" fill="none" stroke="gray">
				<path d="M 0 0 L 1000 0" />
				<path d="M 0 0 L 0 1000" />
				<path d="M 0 0 L -1000 0" />
				<path d="M 0 0 L 0 -1000" />

				<g>
					<circle cx={-centeringTransform.translate.x} cy={-centeringTransform.translate.y} r="2" />
				</g>
			</g>
			<g id="transformed" fill="rgba(0,200,0,0.1)" stroke="green">
				<path d={svgFullEllipseArcFromParams(txEllipse)} />
				<path d={svgLine(...txLinePoints)} stroke="red" />
			</g>
			<g id="centered" fill="rgba(100,0,0,0.1)" stroke="blue">
				<path d={svgLine(...cLinePoints)} />
				<path d={svgFullEllipseArcFromParams(cEllipse)} />
			</g>
			<g id="reduced-centered" fill="rgba(0, 100, 100, 0.1)" stroke="orangered">
				<path d={svgFullEllipseArcFromParams(reducedCenteredEllipse)} />
			</g>
			<g id="intersections" fill="none" stroke="black" stroke-width={1}>
				<circle
					cx={intersections[0].x}
					cy={intersections[0].y}
					r={10}
					fill="rgba(200, 0, 0, 0.2)"
				/>
				<circle
					cx={intersections[1].x}
					cy={intersections[1].y}
					r={10}
					fill="rgba(0, 0, 200, 0.2)"
				/>
				<path
					d={svgArc(reducedCenteredClippedEllipse, intersections[0], intersections[1])}
					stroke="none"
					fill="rgba(0, 200, 200, 0.2)"
				/>
			</g>
			<g id="reduced-restored" transform={`translate(${restoringTransform.translate.x}, ${restoringTransform.translate.y}) rotate(${restoringTransform.rotate}) `}>
				<path
					d={svgArc(reducedCenteredClippedEllipse, intersections[0], intersections[1])}
					stroke="none"
					fill="green"
				/>
			</g>
		</svg>
	</section>
</main>

<style>
	header {
		display: flex;
		flex-direction: row;
	}
	svg {
		border: 1px dotted blue;
	}
</style>
