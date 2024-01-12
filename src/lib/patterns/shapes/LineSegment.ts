import { logger } from '../../../components/svg-logger/logger';
import type { CubicBezierSegment } from './CubicBezierSegment';
import { Point } from './Point';
import type { Intersection } from './shape.types';

export class LineSegment {
	isEdge: boolean;
	prev: LineSegment | undefined;
	next: LineSegment | undefined;
	isPermeable: boolean;
	isStart: boolean;
	p0: Point;
	p1: Point;
	line: { points: { p0: Point; p1: Point } };
	label: string;

	constructor(config: {
		p1: Point;
		p0?: Point;
		prev?: LineSegment;
		next?: LineSegment;
		isPermeable?: boolean;
		isEdge?: boolean;
		label?: string;
	});
	constructor(points: [number, number, number, number], isPermeable: boolean, isEdge: boolean)

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	constructor(...args: any[]) {
		if (args.length === 3) {
			this.p0 = new Point(args[0][0], args[0][1])
			this.p1 = new Point(args[0][2], args[0][3])
			this.isPermeable = args[1]
			this.isEdge = args[2]
			this.isStart = true;
			this.line = { points: { p0: this.p0.clone(), p1: this.p1.clone() } }
			this.label = ''
		} else {
			const config = args[0]
			if (!config.p0 && !config.prev?.p1) {
				throw new Error('LineSegment must be initialized with p0 or prevSegment');
			}
			this.isEdge = config.isEdge || false;
			this.isPermeable = config.isPermeable || false;
			this.prev = config.prev || undefined;
			this.next = config.next || undefined;
			this.isStart = !!config.p0;
			this.p0 = config.prev?.p1 ? config.prev.p1 : config.p0 ? config.p0 : new Point(0, 0);
			this.p1 = config.p1;
			this.label = config.label || '';
			this.line = { points: { p0: this.p0.clone(), p1: this.p1.clone() } };
		}
	}

	get length() {
		return this.getLength();
	}
	get slope() {
		return this.getSlope();
	}

	get lastPoint() {
		return this.p1;
	}

	private getSlope() {
		return (this.p1.y - this.p0.y) / (this.p1.x - this.p0.x);
	}

	private getLength() {
		return Math.sqrt((this.p1.y - this.p0.y) ** 2 + (this.p1.x - this.p0.x) ** 2);
	}

	getOffsetSegment(offset: number) {
		const p0 = this.p0.clone();
		const p1 = this.p1.clone();
		const l = this.getLength();
		const dX = p0.x - p1.x;
		const dY = p0.y - p1.y;
		const offsetVector = new Point(-dY / l, dX / l);
		this.line.points.p0 = p0.addScaled(offsetVector, offset);
		this.line.points.p1 = p1.addScaled(offsetVector, offset);
		console.debug('  Line - offset segment', this.line);
	}

	clone() {
		return new LineSegment({
			p0: this.p0.clone(),
			p1: this.p1.clone(),
			isPermeable: this.isPermeable,
			isEdge: this.isEdge,
			label: this.label
		});
	}

	trimToIntersections({ int0, int1 }: { int0?: Intersection; int1?: Intersection }) {
		console.debug('LineSegment.trimToIntersections');
		this.line.points.p0 = int0?.point === undefined ? this.line.points.p0 : int0?.point;
		this.line.points.p1 = int1?.point === undefined ? this.line.points.p0 : int1?.point;
		logger.addLines([[this.line.points.p0, this.line.points.p1]]);
	}

	trimToIntersectingLines(line0: LineSegment, line1?: LineSegment) {
		const newLine = this.clone();
		newLine.p0 = newLine.getLineIntersection(line0).point || new Point(0, 0);
		if (line1) {
			newLine.p1 = newLine.getLineIntersection(line1).point || new Point(0, 0);
		}
		return newLine;
	}
	trimToIntersectingCubicBeziers(bezier0: CubicBezierSegment, bezier1: CubicBezierSegment) {
		return this.clone();
	}
	trimToIntersectingMixed(
		partner0: LineSegment | CubicBezierSegment,
		partner1: LineSegment | CubicBezierSegment
	) {
		const me = this.clone();
		const int0 = me.getIntersection(partner0);
		const int1 = me.getIntersection(partner1);
		if (int0.point) {
			me.p0 = int0.point;
		}
		if (int1.point) {
			me.p1 = int1.point;
		}
		return me;
	}

	getIntersection(partner0: LineSegment | CubicBezierSegment): Intersection {
		if (partner0 instanceof LineSegment) {
			return this.getLineIntersection(partner0);
		} else {
			const int = partner0.getIntersection(this, true);
			if (int?.point) {
				return int;
			} else {
				console.error('missing point');
				return { subSegmentIndex: -1 };
			}
		}
	}

	getLineIntersection(partner0: LineSegment): Intersection {
		const l1 = { p0: this.line.points.p0, p1: this.line.points.p1 };
		const l2 = { p0: partner0.line.points.p0, p1: partner0.line.points.p1 };
		let b1, b2, x, y: number;

		const m1 = this.getSlope();
		const m2 = partner0.slope;

		if (m1 === m2) {
			throw new Error('lines are parallel, no intersection');
		} else if (!Number.isFinite(m1)) {
			x = l1.p1.x;
			b2 = l2.p1.y - m2 * l2.p1.x;
			y = m2 * x + b2;
		} else if (!Number.isFinite(m2)) {
			x = l2.p1.x;
			b1 = l1.p1.y - m1 * l1.p1.x;
			y = m1 * x + b1;
		} else {
			b1 = l1.p1.y - m1 * l1.p1.x;
			b2 = l2.p1.y - m2 * l2.p1.x;
			x = (b2 - b1) / (m1 - m2);
			y = m1 * x + b1;
		}
		if (!Number.isFinite(x) || !Number.isFinite(y)) {
			console.error('--------- Infinite', x, y, m1, m2, b1, b2);
		}
		return {
			subSegmentIndex: 0,
			point: new Point(x, y)
		};
	}

	getCubicBezierIntersection(partner0: CubicBezierSegment) {
		console.debug('cubic bezier intersection stub', partner0);
		const int = partner0.getIntersection(this);
		console.debug(
			'++++++++++++++++++ ++++++++++++++++++ +++++++++++++++++++new intersection with cubic bezier',
			int
		);
		return int;
	}

	getSVG() {
		return `M ${this.p0.x} ${this.p0.y} L ${this.p1.x} ${this.p1.y}`;
	}
	getLine() {
		return {
			p1: { x: this.p0.x, y: this.p0.y },
			p2: { x: this.p1.x, y: this.p1.y }
		};
	}
}
