// import { logger } from '../../../components/svg-logger/logger';
import { logger } from '../../../components/svg-logger/logger';
import { LineSegment } from './LineSegment';
import { Point } from './Point';
import { Bezier } from 'bezier-js';
import type { Line, Split } from 'bezier-js';
import type { Intersection } from './shape.types';

// Maybe this is kindof a wrapper around BezierJS?

export class CubicBezierSegment {
	isEdge: boolean;
	prev: LineSegment | CubicBezierSegment | undefined;
	next: LineSegment | CubicBezierSegment | undefined;
	isPermeable: boolean;
	isStart: boolean;
	p0: Point = new Point(0, 0);
	p1: Point;
	p2: Point;
	p3: Point;
	bezier: Bezier | Bezier[];
	label: string;
	isOffset = false;

	constructor(config: {
		p0?: Point;
		p1: Point;
		p2: Point;
		p3: Point;
		prev?: LineSegment | CubicBezierSegment;
		next?: LineSegment | CubicBezierSegment;
		isPermeable?: boolean;
		isEdge?: boolean;
		label?: string;
	});
	constructor(
		points: [number, number, number, number, number, number, number, number],
		isPermeable: boolean,
		isEdge: boolean
	);

	constructor(...args: any) {
		if (args.length === 3) {
			this.p0 = new Point(args[0][0], args[0][1])
			this.p1 = new Point(args[0][2], args[0][3])
			this.p2 = new Point(args[0][4], args[0][5])
			this.p3 = new Point(args[0][6], args[0][7])
			this.isPermeable = args[1]
			this.isEdge = args[2]
			this.isStart = true
			this.label = ""
		} else {
			if (!args[0].p0 && !args[0].prev?.p1) {
				throw new Error('LineSegment must be initialized with p0 or prevSegment');
			}
			this.prev = args[0].prev || undefined;
			this.next = args[0].next || undefined;
			this.isPermeable = args[0].isPermeable || false;
			this.isEdge = args[0].isEdge || false;
			this.isStart = !!args[0].p0;
			if (args[0].prev) {
				if (args[0].prev instanceof LineSegment) {
					this.p0 = args[0].prev.p1;
				} else if (args[0].prev instanceof CubicBezierSegment) {
					this.p0 = args[0].prev.p3;
				}
			} else if (args[0].p0) {
				this.p0 = args[0].p0;
			} else {
				throw new Error('Cubic bezier requires previous segment or p0 to instantiate');
			}
			this.p1 = args[0].p1;
			this.p2 = args[0].p2;
			this.p3 = args[0].p3;
			this.label = args[0].label || '';

		}
		this.bezier = new Bezier([
			this.p0.x,
			this.p0.y,
			this.p1.x,
			this.p1.y,
			this.p2.x,
			this.p2.y,
			this.p3.x,
			this.p3.y
		]);
	}

	get lastPoint() {
		return this.p3;
	}

	clone() {
		return new CubicBezierSegment({
			p0: this.p0.clone(),
			p1: this.p1.clone(),
			p2: this.p2.clone(),
			p3: this.p3.clone(),
			isPermeable: this.isPermeable,
			isEdge: this.isEdge,
			label: this.label
		});
	}

	getOffsetSegment(offset: number) {
		if (this.isOffset) {
			// reset this.bezier to baseline, and get offset
			this.bezier = new Bezier([
				this.p0.x,
				this.p0.y,
				this.p1.x,
				this.p1.y,
				this.p2.x,
				this.p2.y,
				this.p3.x,
				this.p3.y
			]);
		} else if (!Array.isArray(this.bezier)) {
			const offsetSegment = this.bezier.offset(-offset);

			if (Array.isArray(offsetSegment)) {
				this.bezier = offsetSegment;
				// logger.addBeziers(offsetSegment);
			}
		}
	}

	getIntersection(partner: LineSegment | CubicBezierSegment, forceByExtension = false) {
		return partner instanceof LineSegment
			? this.getIntersectionWithLine(partner, forceByExtension)
			: this.getIntersectionWithCubicBezier(partner, forceByExtension);
	}

	getSVG() {
		const { p0, p1, p2, p3 } = this;
		return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;
	}

	trimToIntersections({
		int0 = { subSegmentIndex: -1 },
		int1 = { subSegmentIndex: -1 }
	}: {
		int0?: Intersection;
		int1?: Intersection;
	}) {
		let indexOffset = 0;
		if (int0.subSegmentIndex !== -1 && int0.t) {
			if (Array.isArray(this.bezier)) {
				console.debug('   0');
				indexOffset = 1;
				// logger.addBeziers([...this.bezier])
				const split = this.getOrientedBezierArray(this.bezier[int0.subSegmentIndex].split(int0.t));
				this.bezier.splice(int0.subSegmentIndex, 1, ...split);
			} else {
				this.bezier = this.getOrientedBezierArray(this.bezier.split(int0.t));
				console.debug('   1');
			}
		}
		if (int1.subSegmentIndex !== -1 && int1.t) {
			console.debug('1.5');
			if (Array.isArray(this.bezier)) {
				console.debug('   2');
				// logger.addBeziers([...this.bezier])
				const split = this.getOrientedBezierArray(
					this.bezier[int1.subSegmentIndex + indexOffset].split(int1.t)
				);
				this.bezier.splice(int1.subSegmentIndex + indexOffset, 1, ...split);
			} else {
				console.debug('   3');
				this.bezier = this.getOrientedBezierArray(this.bezier.split(int1.t));
			}
		}

		if (
			Array.isArray(this.bezier) &&
			(int0.subSegmentIndex !== -1 || int1.subSegmentIndex !== -1)
		) {
			const start = int0.subSegmentIndex === -1 ? 0 : int0.subSegmentIndex + 1;
			const newBezier =
				int1.subSegmentIndex === -1
					? this.bezier.slice(start)
					: this.bezier.slice(start, int1.subSegmentIndex + indexOffset + 1);
			this.bezier = newBezier;
		}

		if (Array.isArray(this.bezier)) {
			logger.addBeziers([...this.bezier]);
		} else {
			logger.addBeziers([this.bezier]);
		}
	}

	trimToIntersectionsOld(
		partner0: LineSegment | CubicBezierSegment,
		partner1?: LineSegment | CubicBezierSegment
	) {
		console.debug('------------------------------------ trimToIntersections');
		// if (Array.isArray(this.bezier)) {
		// 	this.bezier.forEach((bez, i) =>
		// 		logger.add({ directionalBezier: { points: [...bez.points], label: `${i}` } })
		// 	);
		// }
		const partners = partner1 ? [partner0, partner1] : [partner0];
		const ints: {
			subSegmentIndex: number;
			point?: Point | undefined;
			t?: number | undefined;
		}[] = [];
		partners.forEach((partner, i) => {
			const int = this.getIntersection(partner);
			if (int && int.point && int.t !== undefined) {
				if (Array.isArray(this.bezier)) {
					const split = this.getOrientedBezierArray(this.bezier[int.subSegmentIndex].split(int.t));
					this.bezier.splice(int.subSegmentIndex, 1, ...split);
					int.subSegmentIndex = int.subSegmentIndex + 1;
					console.debug(i, 'pushing', int, ints);
					ints.push(int);
				} else {
					console.debug('this.bezier is simple', this.bezier);
					const split = this.bezier.split(int.t);
					this.bezier = this.chooseSplit(split, this.bezier, i === 1);
				}
			}
			// ints.push(int);
		});
		// if (
		// 	ints.length === 2 &&
		// 	ints[0].point &&
		// 	ints[1].point &&
		// 	this.isSamePoint(ints[0].point, ints[1].point, 1)
		// ) {
		// 	ints = ints.slice(0, 1);
		// }
		// ints.forEach((int, i) => {
		// 	if (int.point) {
		// 		logger.add({ circle: new Point(int.point?.x, int.point.y), label: `${i}` });
		// 	}
		// });
		let thisBezier = this.bezier;
		if (ints.length === 2 && Array.isArray(thisBezier)) {
			console.debug('slicing at', ints[0].subSegmentIndex, ints[1].subSegmentIndex);
			thisBezier = thisBezier.slice(ints[0].subSegmentIndex, ints[1].subSegmentIndex);
			this.bezier = thisBezier;
		} else {
			console.debug('!!!nope', ints.length, Array.isArray(thisBezier));
		}

		if (Array.isArray(this.bezier)) {
			this.bezier.forEach((bez, i) =>
				logger.add({ directionalBezier: { points: [...bez.points], label: `${i}` } })
			);
		}
	}

	private getOrientedBezierArray(split: Split, reversed = false): [Bezier, Bezier] {
		return reversed ? [split.right, split.left] : [split.left, split.right];
	}

	private getIntersectionWithLine(
		partner0: LineSegment,
		forceByExtension = false
	): {
		subSegmentIndex: number;
		point?: Point;
		t?: number;
	} {
		const line: Line = {
			p1: { x: partner0.line.points.p0.x, y: partner0.line.points.p0.y },
			p2: { x: partner0.line.points.p1.x, y: partner0.line.points.p1.y }
		};
		console.debug('|||||||| getIntersectionWithLine');
		if (!Array.isArray(this.bezier)) {
			const intersectionsAsT = this.bezier.intersects(line);
			const int = intersectionsAsT.map((rawT) => {
				const t = typeof rawT === 'string' ? parseFloat(rawT.split('/')[0]) : rawT;
				const p = (this.bezier as Bezier).get(t);
				return { t, point: new Point(p.x, p.y) };
			});
			return {
				subSegmentIndex: 0,
				point: int[0].point,
				t: int[0].t
			};
		} else {
			console.debug('|||||||||| bezier[]');
			let ints = this.bezier
				.map((bezier, i) => {
					const intersectionsAsT = bezier.intersects(line);
					const ints = intersectionsAsT.map((rawT) => {
						const t = typeof rawT === 'string' ? parseFloat(rawT.split('/')[0]) : rawT;
						const p = (bezier as Bezier).get(t);
						return { t, point: new Point(p.x, p.y) };
					});

					return ints[0] ? { subSegmentIndex: i, point: ints[0].point, t: ints[0].t } : undefined;
				})
				.filter((int) => !!int?.t);
			console.debug('INTERSECTIONS', ints);
			if (ints.length === 0 && forceByExtension) {
				const extendedBezier = this.getExtendedBezier(this.bezier);
				logger.addBeziers([...extendedBezier]);
				ints = extendedBezier
					.map((bezier, i) => {
						const intersectionsAsT = bezier.intersects(line);
						const ints = intersectionsAsT.map((rawT) => {
							const t = typeof rawT === 'string' ? parseFloat(rawT.split('/')[0]) : rawT;
							const p = (bezier as Bezier).get(t);
							return { t, point: new Point(p.x, p.y) };
						});

						return ints[0] ? { subSegmentIndex: i, point: ints[0].point, t: ints[0].t } : undefined;
					})
					.filter((int) => !!int?.t);
				console.debug('INTERSECTIONS', ints);
			}

			return ints[0] || { subSegmentIndex: -1 };
		}
	}

	private getExtendedBezier(inputBezier: Bezier | Bezier[]) {
		let bezier = Array.isArray(inputBezier) ? [...inputBezier] : [inputBezier];
		const preExtensionLine = bezier[0].derivative(0);
		const postExtensionLine = bezier[bezier.length - 1].derivative(1);
		console.debug('=================Extend Bezier===================');
		console.debug('pre', preExtensionLine, 'post', postExtensionLine);

		const preExtension = new Bezier([
			bezier[0].points[0].x,
			bezier[0].points[0].y,
			bezier[0].points[0].x,
			bezier[0].points[0].y,
			preExtensionLine.x + bezier[0].points[0].x,
			preExtensionLine.y + bezier[0].points[0].y,
			preExtensionLine.x + bezier[0].points[0].x,
			preExtensionLine.y + bezier[0].points[0].y
		]);
		const postExtension = new Bezier([
			bezier[bezier.length - 1].points[3].x,
			bezier[bezier.length - 1].points[3].y,
			bezier[bezier.length - 1].points[3].x,
			bezier[bezier.length - 1].points[3].y,
			postExtensionLine.x + bezier[bezier.length - 1].points[3].x,
			postExtensionLine.y + bezier[bezier.length - 1].points[3].y,
			postExtensionLine.x + bezier[bezier.length - 1].points[3].x,
			postExtensionLine.y + bezier[bezier.length - 1].points[3].y
		]);
		bezier = [preExtension, ...bezier, postExtension];
		return bezier;
	}

	private getIntersectionWithTwoCubicBezier(bezier0: Bezier, bezier1: Bezier, index = 0) {
		const intersectionsAsT = bezier0.intersects(bezier1);
		const int = intersectionsAsT.map((rawT, i) => {
			const t = typeof rawT === 'string' ? parseFloat(rawT.split('/')[0]) : rawT;
			const p = bezier0.get(t);
			return { t: t, point: new Point(p.x, p.y) };
		});
		return {
			subSegmentIndex: index,
			point: int[0]?.point,
			t: int[0]?.t
		};
	}

	private getIntersectionWithCubicBezier(partner: CubicBezierSegment, forceByExtension = false) {
		if (!Array.isArray(this.bezier) && !Array.isArray(partner.bezier)) {
			// both arrays are simple bezier
			const int = this.getIntersectionWithTwoCubicBezier(this.bezier, partner.bezier);
			return int;
		} else if (!Array.isArray(this.bezier) && Array.isArray(partner.bezier)) {
			// partner is compound bezier
			const thisBezier = this.bezier;
			const ints = partner.bezier
				.map((bezier, i) => this.getIntersectionWithTwoCubicBezier(thisBezier, bezier, i))
				.filter((int) => !!int?.t);
			return ints[0] || { subSegmentIndex: -1 };
		} else if (Array.isArray(this.bezier) && !Array.isArray(partner.bezier)) {
			const partnerBezier = partner.bezier;
			const ints = this.bezier
				.map((bezier, i) => this.getIntersectionWithTwoCubicBezier(bezier, partnerBezier, i))
				.filter((int) => !!int?.t);
			return ints[0] || { subSegmentIndex: -1 };
		} else {
			// Both curves are compound bezier
			const ints = (this.bezier as Bezier[])
				.map((bezier, i) => {
					const innerInts = (partner.bezier as Bezier[]).map((partnerBezier, j) => {
						const innerInt = this.getIntersectionWithTwoCubicBezier(bezier, partnerBezier, i);
						return innerInt;
					});
					return innerInts;
				})
				.flat()
				.filter((int) => !!int?.point);
			console.debug('compound x compound intersections', ints);
			return ints[0] || { subSegmentIndex: -1 };
		}
	}

	private chooseSplit(split: Split, original: Bezier, keepStart: boolean) {
		const leftIsStart =
			this.isSamePoint(split.left.points[0], original.points[0], 0.0000001) ||
			this.isSamePoint(split.left.points[1], original.points[0], 0.0000001);

		return leftIsStart && keepStart ? split.left : split.right;
	}

	private isSamePoint(
		p0: Point | import('bezier-js').Point,
		p1: Point | import('bezier-js').Point,
		precision?: number
	) {
		if (!precision) {
			return p0.x === p1.x && p0.y === p1.y;
		}
		return Math.abs(p0.x - p1.x) <= precision && Math.abs(p0.y - p1.y) <= precision;
	}
}
