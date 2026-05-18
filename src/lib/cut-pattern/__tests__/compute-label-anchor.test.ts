import { computeOutlinedLabelAnchor } from '../compute-label-anchor';

describe('computeOutlinedLabelAnchor', () => {
	test('no-tab case: anchor is edge midpoint, autoAngle points outward from interior', () => {
		// Edge from (0, 0) to (10, 0) — horizontal, lying along y=0.
		// Interior point below the edge at (5, -5).
		// Outward direction is therefore +y, autoAngle should make path-space +y → world +y.
		const { anchor, autoAngle } = computeOutlinedLabelAnchor({
			edgeStart: { x: 0, y: 0 },
			edgeEnd: { x: 10, y: 0 },
			interiorPoint: { x: 5, y: -5 },
			tab: undefined,
			tabWidth: 0
		});

		expect(anchor.x).toBeCloseTo(5);
		expect(anchor.y).toBeCloseTo(0);

		// θ such that rotate(θ) takes (0,1) → outward N = (0, 1)
		// (-sin θ, cos θ) = (0, 1) → sin θ = 0, cos θ = 1 → θ = 0.
		expect(autoAngle).toBeCloseTo(0);
	});

	test('with rectangular tab: anchor is shifted outward by tabWidth', () => {
		const { anchor } = computeOutlinedLabelAnchor({
			edgeStart: { x: 0, y: 0 },
			edgeEnd: { x: 10, y: 0 },
			interiorPoint: { x: 5, y: -5 },
			tab: { tabWidth: 4 }, // tab present, outward shift = 4
			tabWidth: 4
		});

		// Outward N = (0, 1); edgeMid = (5, 0); anchor = (5, 0) + (0,1) * 4 = (5, 4)
		expect(anchor.x).toBeCloseTo(5);
		expect(anchor.y).toBeCloseTo(4);
	});

	test('autoAngle is perpendicular to a vertical edge with interior on the left', () => {
		// Edge from (0, 0) to (0, 10) — vertical, x=0.
		// Interior at (-5, 5). Outward N = +x direction = (1, 0).
		// autoAngle: (-sin θ, cos θ) = (1, 0) → sin θ = -1, cos θ = 0 → θ = -π/2.
		const { autoAngle } = computeOutlinedLabelAnchor({
			edgeStart: { x: 0, y: 0 },
			edgeEnd: { x: 0, y: 10 },
			interiorPoint: { x: -5, y: 5 },
			tab: undefined,
			tabWidth: 0
		});

		expect(autoAngle).toBeCloseTo(-Math.PI / 2);
	});
});
