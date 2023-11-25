import { logger } from '../../../components/svg-logger/logger';
import { Point } from './Point';

export class LineSegment {
	isEdge: boolean;
	prev: LineSegment | undefined;
	next: LineSegment | undefined;
	isPermeable: boolean;
	isStart: boolean;
	p0: Point;
	p1: Point;
	label: string;
	constructor({
		p1,
		p0,
		prev,
		next,
		isPermeable,
		isEdge,
		label
	}: {
		p1: Point;
		p0?: Point;
		prev?: LineSegment;
		next?: LineSegment;
		isPermeable?: boolean;
		isEdge?: boolean;
		label?: string;
	}) {
		if (!p0 && !prev?.p1) {
			throw new Error('LineSegment must be initialized with p0 or prevSegment');
		}
		this.prev = prev || undefined;
		this.next = next || undefined;
		this.isPermeable = isPermeable || false;
		this.isEdge = isEdge || false;
		this.isStart = !!p0;
		this.p0 = prev?.p1 ? prev.p1 : p0 ? p0 : new Point(0, 0);
		this.p1 = p1;
		this.label = label || '';
	}

	get length() {
		return this.getLength();
	}
	get slope() {
		return this.getSlope();
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
		this.p0 = p0.addScaled(offsetVector, offset);
		this.p1 = p1.addScaled(offsetVector, offset);
	}

	clone() {
		return new LineSegment({
			p0: this.p0.clone(),
			p1: this.p1.clone(),
			isPermeable: this.isPermeable,
			isEdge: this.isEdge,
			label: this.label,
		});
	}

	getIntersection(partner0: LineSegment) {
		const l1 = { p0: this.p0, p1: this.p1 };
		const l2 = { p0: partner0.p0, p1: partner0.p1 };
		let b1, b2, x, y: number;

		const m1 = this.getSlope();
		const m2 = partner0.slope;
		console.debug('getIntersection', l1, l2, m1, m2);

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
		return new Point(x, y);
	}
}
