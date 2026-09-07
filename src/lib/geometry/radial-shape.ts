/**
 * How a cross-section's authored curve run repeats around the origin.
 *
 * This is the single source of truth shared by the 3D generator
 * (`generate-shape.ts`) and the editor preview (`curve-preview.ts`). They used
 * to implement the repetition separately and disagreed, which is what made the
 * Globule Cross Section preview draw phantom loops.
 *
 * Angle convention matches the rest of the cross-section code:
 * `(x, y) = (-r·sin θ, r·cos θ)` — θ from the +y axis, counter-clockwise.
 */
import type { BezierConfig, PointConfig2, ShapeConfig } from '$lib/types';

const REFLECTED_SYMMETRIES: ShapeConfig['symmetry'][] = ['lateral', 'radial-lateral'];

export const isReflectedSymmetry = (symmetry: ShapeConfig['symmetry']): boolean =>
	REFLECTED_SYMMETRIES.includes(symmetry);

/**
 * The angle the authored run is expected to span.
 *
 * A reflected shape pairs the run with its mirror, so the run covers half the
 * wedge and the pair covers the whole one. An unreflected shape's run must
 * cover the wedge by itself.
 */
export const radialUnitAngle = ({
	symmetry,
	symmetryNumber
}: Pick<ShapeConfig, 'symmetry' | 'symmetryNumber'>): number => {
	const n = Math.max(1, symmetryNumber);
	return isReflectedSymmetry(symmetry) ? Math.PI / n : (Math.PI * 2) / n;
};

const angleOf = (point: PointConfig2): number => Math.atan2(point.y, point.x);

const rotatePoint = (point: PointConfig2, angle: number): PointConfig2 => ({
	...point,
	x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
	y: point.x * Math.sin(angle) + point.y * Math.cos(angle)
});

/** Mirror across the ray at `phi`: a point at θ maps to 2φ − θ, radius unchanged. */
const mirrorPointAboutRay = (point: PointConfig2, phi: number): PointConfig2 =>
	rotatePoint(point, 2 * phi - 2 * angleOf(point));

const mapRun = (
	curves: BezierConfig[],
	map: (point: PointConfig2) => PointConfig2
): BezierConfig[] =>
	curves.map((curve) => ({
		...curve,
		points: curve.points.map(map) as BezierConfig['points']
	}));

const rotateRun = (curves: BezierConfig[], angle: number): BezierConfig[] =>
	mapRun(curves, (point) => rotatePoint(point, angle));

/**
 * The authored run mirrored so it continues where the run left off.
 *
 * Mirroring about the ray through the run's own end point leaves that point
 * fixed, so the mirrored run touches the forward run exactly there — but it
 * *ends* at the shared point rather than starting there, so both the points
 * within each curve and the curves themselves are reversed.
 */
const reflectedRun = (curves: BezierConfig[]): BezierConfig[] => {
	const lastCurve = curves[curves.length - 1];
	const phi = angleOf(lastCurve.points[3]);
	return curves
		.map((curve) => ({
			...curve,
			points: curve.points
				.map((point) => mirrorPointAboutRay(point, phi))
				.reverse() as BezierConfig['points']
		}))
		.reverse();
};

/**
 * One entry per emitted side, in generation order.
 *
 * A "side" is the authored run as authored — so a reflected shape emits two
 * sides per repeat (the run and its mirror), and a 7-fold radial-lateral shape
 * has 14 sides.
 */
export const radialSideCurveConfigs = (config: ShapeConfig): BezierConfig[][] => {
	const { symmetry, symmetryNumber, curves } = config;
	if (curves.length === 0) return [];

	const repeats = Math.max(1, symmetryNumber);
	const wedge = (Math.PI * 2) / repeats;
	const reflect = isReflectedSymmetry(symmetry);
	const mirrored = reflect ? reflectedRun(curves) : undefined;

	const sides: BezierConfig[][] = [];
	for (let i = 0; i < repeats; i++) {
		sides.push(rotateRun(curves, wedge * i));
		if (mirrored) sides.push(rotateRun(mirrored, wedge * i));
	}
	return sides;
};

/** The whole cross-section as one continuous run of curves. */
export const radialShapeCurveConfigs = (config: ShapeConfig): BezierConfig[] =>
	radialSideCurveConfigs(config).flat();
