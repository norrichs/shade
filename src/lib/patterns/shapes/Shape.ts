import { logger } from '../../../components/svg-logger/logger';
import { LineSegment } from './LineSegment';
import { Point } from './Point';

export class Shape {
	isPermeable: boolean;
	segments: LineSegment[];

	constructor({
		segments,
		isPermeable
	}: {
		segments: LineSegment[] | [number, number][];
		isPermeable?: boolean;
	}) {
		if (segments[0].constructor.name === 'LineSegment') {
			this.segments = segments as LineSegment[];
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
		return this.getSVGPath();
	}

	// Methods
	private getPoints() {
		return this.segments.map((seg) => seg.p0);
	}

	offsetShape(offset: number) {
		let offsetSegments = this.segments.map((segment) => {
			segment.getOffsetSegment(offset);
			return segment;
		});
		offsetSegments = offsetSegments.map((segment, i) => {
			segment.p0 = segment.getIntersection(
				offsetSegments[(i + offsetSegments.length - 1) % offsetSegments.length]
			);
			segment.p1 = segment.getIntersection(offsetSegments[(i + 1) % offsetSegments.length]);
			return segment;
		});

		this.segments = offsetSegments;
	}

	getSVGPath() {
		return this.segments
			.map((seg, i) => {
				if (i === 0) {
					return `M ${seg.p0.x} ${seg.p0.y}`;
				}
				return `L ${seg.p0.x} ${seg.p0.y}`;
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
