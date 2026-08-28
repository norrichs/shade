/**
 * Pure preview geometry for the path editors.
 *
 * Adapted from the inline helpers in `src/components/path-edit/SuperPathEdit.svelte`
 * (`getPathFromCurves`, `getFillFromCurves`, `transform`, `reflectCurvesAroundX`,
 * `rotateCurvesAroundOrigin`, `radializeCurves`).
 *
 * Two deliberate differences from the originals:
 *
 * 1. **Orientation-neutral.** The legacy versions negate every `y` because
 *    `SuperPathEdit` renders on a y-up canvas. These emit coordinates exactly as
 *    stored; orientation is the renderer's business.
 * 2. **`ShapeConfig`-free.** `radializeCurves` takes a plain options object so it
 *    is testable without constructing a config.
 */
import type { BezierConfig, PointConfig2 } from '$lib/types';

const clonePoint = (point: PointConfig2): PointConfig2 => ({ ...point });

const clonePoints = (points: BezierConfig['points']): BezierConfig['points'] =>
	points.map(clonePoint) as BezierConfig['points'];

export const cloneCurves = (curves: BezierConfig[]): BezierConfig[] =>
	curves.map((curve) => ({ ...curve, points: clonePoints(curve.points) }));

const curveSegments = (curves: BezierConfig[]): string =>
	curves
		.map(
			(curve) =>
				`C ${curve.points[1].x} ${curve.points[1].y}, ${curve.points[2].x} ${curve.points[2].y}, ${curve.points[3].x} ${curve.points[3].y}`
		)
		.join(' ');

/** `M p0 C p1 p2 p3 …` — the open outline of a curve run. */
export const pathFromCurves = (curves: BezierConfig[]): string => {
	if (curves.length === 0) return '';
	const start = curves[0].points[0];
	return `M ${start.x} ${start.y} ${curveSegments(curves)}`;
};

/**
 * The curve run closed back onto an axis, giving a fillable region.
 *
 * `axis: 'y'` (the default) closes to x = 0 — the silhouette case, where the
 * profile is swept around the vertical axis.
 */
export const fillPathToAxis = (curves: BezierConfig[], axis: 'x' | 'y' = 'y'): string => {
	if (curves.length === 0) return '';
	const start = curves[0].points[0];
	const end = curves[curves.length - 1].points[3];
	const onAxis = (point: PointConfig2) => (axis === 'y' ? `0 ${point.y}` : `${point.x} 0`);
	return [
		`M ${onAxis(start)}`,
		`L ${start.x} ${start.y}`,
		curveSegments(curves),
		`L ${onAxis(end)}`,
		'Z'
	].join(' ');
};

/** Mirror across the y-axis (x → −x), preserving curve and point order. */
export const mirrorCurvesAcrossY = (curves: BezierConfig[]): BezierConfig[] =>
	cloneCurves(curves).map((curve) => ({
		...curve,
		points: curve.points.map((point) => ({ ...point, x: -point.x })) as BezierConfig['points']
	}));

/**
 * Mirror across the y-axis *and* reverse traversal, so the result continues
 * where the input left off. Legacy name: `reflectCurvesAroundX`.
 */
export const reverseReflectCurves = (curves: BezierConfig[]): BezierConfig[] =>
	cloneCurves(curves)
		.map((curve) => ({
			...curve,
			points: curve.points
				.map((point) => ({ ...point, x: -point.x }))
				.reverse() as BezierConfig['points']
		}))
		.reverse();

/**
 * Rotate every point about the origin by `angle` radians.
 *
 * The legacy version used `Math.atan(y / x)`, which folds quadrants II and III
 * onto IV and I and divides by zero on the y-axis. This uses the rotation matrix
 * directly, so it is exact and total.
 */
export const rotateCurvesAroundOrigin = (curves: BezierConfig[], angle: number): BezierConfig[] => {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	return cloneCurves(curves).map((curve) => ({
		...curve,
		points: curve.points.map((point) => ({
			...point,
			x: point.x * cos - point.y * sin,
			y: point.x * sin + point.y * cos
		})) as BezierConfig['points']
	}));
};

/**
 * Repeat a unit curve run around the origin to preview a radially symmetric
 * cross-section. With `reflect`, each unit is paired with its mirror first, so
 * the repeated element is itself bilaterally symmetric.
 *
 * The legacy loop ran `i <= symmetryNumber`, drawing one redundant overlapping
 * copy. This emits exactly `symmetryNumber` copies.
 */
export const radializeCurves = (
	curves: BezierConfig[],
	{ symmetryNumber, reflect }: { symmetryNumber: number; reflect: boolean }
): BezierConfig[] => {
	if (curves.length === 0 || symmetryNumber < 1) return [];
	const unit = reflect ? [...cloneCurves(curves), ...reverseReflectCurves(curves)] : curves;
	const angle = (Math.PI * 2) / symmetryNumber;
	const result: BezierConfig[] = [];
	for (let i = 0; i < symmetryNumber; i++) {
		result.push(...rotateCurvesAroundOrigin(unit, angle * i));
	}
	return result;
};
