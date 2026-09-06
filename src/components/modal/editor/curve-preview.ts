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
import { radialShapeCurveConfigs } from '$lib/geometry/radial-shape';
import type { BezierConfig, PointConfig2, ShapeConfig } from '$lib/types';

const clonePoint = (point: PointConfig2): PointConfig2 => ({ ...point });

const clonePoints = (points: BezierConfig['points']): BezierConfig['points'] =>
	points.map(clonePoint) as BezierConfig['points'];

export const cloneCurves = (curves: BezierConfig[]): BezierConfig[] =>
	curves.map((curve) => ({ ...curve, points: clonePoints(curve.points) }));

/** Points closer than this at a joint are the same point, modulo float drift. */
const JOINT_EPSILON = 1e-9;

const isContiguous = (previous: BezierConfig, next: BezierConfig): boolean =>
	Math.hypot(next.points[0].x - previous.points[3].x, next.points[0].y - previous.points[3].y) <=
	JOINT_EPSILON;

const cubicSegment = (curve: BezierConfig): string =>
	`C ${curve.points[1].x} ${curve.points[1].y}, ${curve.points[2].x} ${curve.points[2].y}, ${curve.points[3].x} ${curve.points[3].y}`;

/**
 * `M p0 C p1 p2 p3 …` — the outline of a curve run.
 *
 * A `C` continues from the current point, so chaining across a gap silently
 * bridges it and the bridging bezier bulges outward as a phantom loop. Emit a
 * fresh `M` at a real discontinuity so a break looks like a break.
 */
export const pathFromCurves = (curves: BezierConfig[]): string => {
	if (curves.length === 0) return '';
	const parts: string[] = [`M ${curves[0].points[0].x} ${curves[0].points[0].y}`];
	curves.forEach((curve, i) => {
		if (i > 0 && !isContiguous(curves[i - 1], curve)) {
			parts.push(`M ${curve.points[0].x} ${curve.points[0].y}`);
		}
		parts.push(cubicSegment(curve));
	});
	return parts.join(' ');
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
		curves.map(cubicSegment).join(' '),
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
 * Repeat a unit curve run around the origin to preview a radially symmetric
 * cross-section.
 *
 * Delegates to the same module the 3D generator uses, so the preview cannot
 * disagree with the geometry. It previously reimplemented the repetition with a
 * different reflection and was handed y-flipped coordinates, which reversed the
 * rotation direction and left a full wedge gap at every joint.
 *
 * Caller must pass MODEL-space curves. Convert the result for display
 * afterwards (see `toDisplay` on the PathEditor overlay context).
 */
export const radializeCurves = (
	curves: BezierConfig[],
	{ symmetryNumber, symmetry }: { symmetryNumber: number; symmetry: ShapeConfig['symmetry'] }
): BezierConfig[] =>
	radialShapeCurveConfigs({
		type: 'ShapeConfig',
		symmetry,
		symmetryNumber,
		sampleMethod: { method: 'divideCurve', divisions: 1 },
		curves
	});
