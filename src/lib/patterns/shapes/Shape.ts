// import { logger } from '../../../components/svg-logger/logger';
import { Line } from '@threlte/core';
import { CubicBezierSegment } from './CubicBezierSegment';
import { LineSegment } from './LineSegment';
import { Point } from './Point';
import {
	logger,
	type SVGLoggerDirectionalBezier,
	type SVGLoggerDirectionalLine
} from '../../../components/svg-logger/logger';

export class Shape {
	isPermeable: boolean;
	segments: (CubicBezierSegment | LineSegment)[];

	constructor({
		segments,
		isPermeable
	}: {
		segments: (LineSegment | CubicBezierSegment)[] | [number, number][];
		isPermeable?: boolean;
	}) {
		if (
			segments[0].constructor.name === 'LineSegment' ||
			segments[0].constructor.name === 'CubicBezierSegment'
		) {
			this.segments = (segments as (LineSegment | CubicBezierSegment)[]).map((seg, i, segs) => {
				seg.prev = segs[(i + segs.length - 1) % segs.length];
				return seg;
			});
		} else {
			this.segments = (segments as [number, number][])
				.map((seg, i, segs) => {
					if (i === 0) {
						return new LineSegment({
							p0: new Point(...seg),
							p1: new Point(...segs[(i + 1) % segs.length]),
							label: `${i}`
						});
					} else {
						return new LineSegment({
							p0: new Point(...segs[i]),
							p1: new Point(...segs[(i + 1) % segs.length]),
							label: `${i}`
						});
					}
				})
				.map((seg, i, segs) => {
					seg.prev = segs[(i + segs.length - 1) % segs.length];
					seg.next = segs[(i + 1) % segs.length];
					return seg;
				});
		}
		this.isPermeable = isPermeable || true;
	}

	// Getters
	get points() {
		return this.getPoints();
	}
	get svgPath() {
		console.debug('svgPath getter');
		return this.getSVGPath();
	}

	// Methods
	private getPoints() {
		return this.segments.map((seg) => seg.p0);
	}

	offsetShape(offset: number) {
		// Get all raw offset segments
		console.debug('---------------Get offset segments--------------');
		let offsetSegments = this.segments.map((segment, i) => {
			if (!segment.isEdge) {
				segment.getOffsetSegment(offset);
			}
			if (segment instanceof LineSegment) {
				logger.addLines([[segment.line.points.p0, segment.line.points.p1]]);
			}
			if (segment instanceof CubicBezierSegment) {
				logger.addBeziers([...segment.bezier]);
			}
			return segment;
		});
		console.debug('---------------Get Intersections--------------');
		const intersections = offsetSegments.map((segment, i, segments) => {
			const int0 = segment.getIntersection(segments[(i + segments.length - 1) % segments.length]);
			const int1 = segment.getIntersection(segments[(i + 1) % segments.length]);
			console.debug('intersections', i, int0, int1);

			// we get a different return type for the intersection if the segment is bezier vs line
			// So we need a typeguard for the intersection
			// or we need to change the return type for lines

			if (int0.point) {
				logger.addCircles([int0.point]);
			}
			if (int1.point) {
				logger.addCircles([int1.point]);
			}

			return [int0, int1];
		});

		console.debug('---------------Divide && Trim segments--------------');
		offsetSegments = offsetSegments.map((segment, i, segments) => {
			const ints = intersections[i];
			console.debug('divide segment', i, segment, intersections[i]);
			if (ints[0].subSegmentIndex > -1 || ints[1].subSegmentIndex > -1) {
				segment.trimToIntersections({ int0: ints[0], int1: ints[1] });
			}
			return segment;
		});

		this.segments = offsetSegments;
	}

	getSVGPath() {
		return this.segments
			.map((seg, i) => {
				let str = '';
				if (i === 0) {
					let p0: Point;
					if (seg instanceof LineSegment) {
						p0 = seg.line.points.p0;
					} else {
						const bez = seg.bezier;
						if (Array.isArray(bez)) {
							p0 = new Point(bez[0].points[0].x, bez[0].points[0].y);
						} else {
							p0 = new Point(bez.points[0].x, bez.points[0].y);
						}
					}
					str = `M ${p0.x} ${p0.y}`;
				}
				if (seg instanceof LineSegment) {
					const { p1 } = seg.line.points;
					str = `${str} L ${p1.x} ${p1.y}`;
				} else if (seg instanceof CubicBezierSegment) {
					const bez = seg.bezier;
					if (!Array.isArray(bez)) {
						str = `${str} C ${bez.points[1].x} ${bez.points[1].y} ${bez.points[2].x} ${bez.points[2].y} ${bez.points[3].x} ${bez.points[3].y}`;
					} else {
						bez.forEach(
							(bez) =>
								(str = `${str} C ${bez.points[1].x} ${bez.points[1].y} ${bez.points[2].x} ${bez.points[2].y} ${bez.points[3].x} ${bez.points[3].y}`)
						);
					}
				}
				return str;
			})
			.join('')
			.concat(' Z');
	}

	clone() {
		return new Shape({
			segments: this.segments.map((s) => s.clone()),
			isPermeable: this.isPermeable
		});
	}
}
