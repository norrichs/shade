import { Vector3, CurvePath, Vector2 } from 'three';
import { generateDepthCurve, generateSilhouette } from './generate-shape';
import type {
	LevelConfig,
	SilhouetteConfig,
	DepthCurveConfig,
	LevelPrototype,
	Level,
	LevelOffset,
	CurveSampleMethod,
	NarrowRegionConfig
} from './types';
import { DEFAULT_DEPTH_CURVE_BASELINE } from './types';
import type { Section } from './projection-geometry/types';

/**
 * The depth-curve x value that maps to depth 1 (the level's own cross-section,
 * unmodified). Falls back to the historical hardcoded 100 when a config predates
 * the field or carries a zero, which would otherwise divide by zero and NaN every
 * vertex radius.
 */
const resolveDepthBaseline = (config: DepthCurveConfig): number =>
	config.depthCurveBaseline || DEFAULT_DEPTH_CURVE_BASELINE;

/**
 * @deprecated - use generateSections instead
 */
export const generateLevelSet2 = (
	levelConfig: LevelConfig,
	silhouetteConfig: SilhouetteConfig,
	depthCurveConfig: DepthCurveConfig,
	// spineCurveConfigs: SpineCurveConfig[],
	levelPrototype: LevelPrototype | LevelPrototype[]
): Level[] => {
	const levelCount = countLevels(levelConfig, silhouetteConfig);
	const levelPrototypes: LevelPrototype[] = getLevelPrototypeArray(levelCount, levelPrototype);
	const depthCurve: CurvePath<Vector2> = generateDepthCurve(depthCurveConfig);
	const depthBaseline = resolveDepthBaseline(depthCurveConfig);
	const silhouette: CurvePath<Vector2> = generateSilhouette(silhouetteConfig);
	// get levels without offsets by applying silhouette points to depthed level prototype vertices
	let rawLevels: Level[];
	if (levelConfig.silhouetteSampleMethod.method === 'preserveAspectRatio') {
		rawLevels = generateRawLevelsConstantAspect({
			silhouette,
			depthCurve,
			depthBaseline,
			levelPrototypes,
			sampleMethod: levelConfig.silhouetteSampleMethod,
			divisionBasis: 0
		});
		// } else if (levelConfig.silhouetteSampleMethod.method === 'spineCurve') {
		// 	const spineCurves: CurvePath<Vector2>[] = spineCurveConfigs.map((cfg) => generateSpineCurve(cfg));
		// 	rawLevels = generateRawLevelsSpineCurve({
		// 		silhouette,
		// 		depthCurve,
		// 		spineCurves,
		// 		levelPrototypes,
		// 		sampleMethod: levelConfig.silhouetteSampleMethod
		// 	});
	} else {
		rawLevels = generateRawLevels({
			silhouette,
			depthCurve,
			depthBaseline,
			levelPrototypes,
			sampleMethod: levelConfig.silhouetteSampleMethod
		});
	}
	const levelOffsets = getLevelOffsets(levelConfig, levelCount);

	const levels = rawLevels.map((rl, i): Level => {
		const offset = levelOffsets[i];
		return applyOffsetToLevel(offset, rl, i);
	});
	return levels;
};

export const generateSections = (
	levelConfig: LevelConfig,
	silhouetteConfig: SilhouetteConfig,
	depthCurveConfig: DepthCurveConfig,
	// spineCurveConfigs: SpineCurveConfig[],
	levelPrototype: LevelPrototype | LevelPrototype[]
): Section[] => {
	const levelCount = countLevels(levelConfig, silhouetteConfig);
	const levelPrototypes: LevelPrototype[] = getLevelPrototypeArray(levelCount, levelPrototype);
	const depthCurve: CurvePath<Vector2> = generateDepthCurve(depthCurveConfig);
	const depthBaseline = resolveDepthBaseline(depthCurveConfig);
	const silhouette: CurvePath<Vector2> = generateSilhouette(silhouetteConfig);
	// get levels without offsets by applying silhouette points to depthed level prototype vertices
	let rawLevels: Level[];
	if (levelConfig.silhouetteSampleMethod.method === 'preserveAspectRatio') {
		rawLevels = generateRawLevelsConstantAspect({
			silhouette,
			depthCurve,
			depthBaseline,
			levelPrototypes,
			sampleMethod: levelConfig.silhouetteSampleMethod,
			divisionBasis: 0
		});
		// } else if (levelConfig.silhouetteSampleMethod.method === 'spineCurve') {
		// 	const spineCurves: CurvePath<Vector2>[] = spineCurveConfigs.map((cfg) => generateSpineCurve(cfg));
		// 	rawLevels = generateRawLevelsSpineCurve({
		// 		silhouette,
		// 		depthCurve,
		// 		spineCurves,
		// 		levelPrototypes,
		// 		sampleMethod: levelConfig.silhouetteSampleMethod
		// 	});
	} else {
		rawLevels = generateRawLevels({
			silhouette,
			depthCurve,
			depthBaseline,
			levelPrototypes,
			sampleMethod: levelConfig.silhouetteSampleMethod
		});
	}
	const levelOffsets = getLevelOffsets(levelConfig, levelCount);

	const levels = rawLevels.map((rl, i): Level => {
		const offset = levelOffsets[i];
		return applyOffsetToLevel(offset, rl, i);
	});

	const sections: Section[] = levels.map((level): Section => {
		return {
			points: [...level.vertices.map((v) => v.clone()), level.vertices[0].clone()]
		};
	});

	return sections;
};

const applyOffsetToLevel = (offset: LevelOffset, rawLevel: Level, levelNumber: number): Level => {
	const zAxis = new Vector3(0, 0, 1);
	const xAxis = new Vector3(1, 0, 0);
	const yAxis = new Vector3(0, 1, 0);

	const minLength = Math.min(...rawLevel.vertices.map((v) => v.length()));
	const depthedVertices = rawLevel.vertices.map((v) => {
		const length = v.length();
		return v.clone().setLength(minLength + (length - minLength) * offset.depth);
	});

	const vertices = depthedVertices.map((pV) => {
		const scaledVertex: Vector3 = new Vector3(pV.x, pV.y, 0);
		scaledVertex.setLength(
			Math.sqrt(Math.pow(offset.scaleX * pV.x, 2) + Math.pow(offset.scaleY * pV.y, 2))
		);
		scaledVertex.applyAxisAngle(zAxis, offset.rotZ); // z axis rotation must be first
		scaledVertex.applyAxisAngle(xAxis, offset.rotX);
		scaledVertex.applyAxisAngle(yAxis, offset.rotY);
		scaledVertex.addScaledVector(rawLevel.center, 1);
		return scaledVertex;
	});
	const level: Level = {
		center: rawLevel.center,
		level: levelNumber,
		vertices
	};
	return level;
};

type ConstantAspectContext = {
	silhouette: CurvePath<Vector2>;
	depthCurve: CurvePath<Vector2>;
	depthBaseline: number;
	levelPrototypes: LevelPrototype[];
	bandCount: number;
	divisionBasis?: number;
};

const generateRawLevelsConstantAspect = ({
	silhouette,
	depthCurve,
	depthBaseline,
	levelPrototypes,
	sampleMethod,
	divisionBasis
}: {
	silhouette: CurvePath<Vector2>;
	depthCurve: CurvePath<Vector2>;
	depthBaseline: number;
	levelPrototypes: LevelPrototype[];
	sampleMethod: CurveSampleMethod;
	divisionBasis?: number;
}): Level[] => {
	const ctx: ConstantAspectContext = {
		silhouette,
		depthCurve,
		depthBaseline,
		levelPrototypes,
		bandCount: levelPrototypes[0].vertices.length,
		divisionBasis
	};
	const narrowRegion =
		sampleMethod.method === 'preserveAspectRatio' ? sampleMethod.narrowRegion : undefined;
	const divisions = narrowRegion
		? getNarrowRegionDivisions(ctx, sampleMethod.divisions, narrowRegion)
		: equalizeDivisions(ctx, 0, 1, sampleMethod.divisions);
	const meridians = sampleMeridians(ctx, divisions);

	const levels: Level[] = [];
	for (let levelNumber = 0; levelNumber < meridians[0].length; levelNumber++) {
		const vertices = meridians.map((meridian) => meridian[levelNumber].clone());
		const center = new Vector3(0, 0, vertices.reduce((sum, v) => sum + v.z, 0) / vertices.length);
		levels.push({ level: levelNumber, center, vertices });
	}
	return levels;
};

/** A band's vertex placed at curve position `division`. */
const meridianPointAt = (
	{ silhouette, depthCurve, depthBaseline, levelPrototypes }: ConstantAspectContext,
	vertexNumber: number,
	division: number
): Vector3 => {
	const depthedLevelPrototype = getDepthedLevelPrototype(
		levelPrototypes[vertexNumber % levelPrototypes.length],
		depthCurve.getPointAt(division).x / depthBaseline
	);
	return getMeridianPoint(division, silhouette, depthedLevelPrototype.vertices[vertexNumber]);
};

/** One meridian per band: the band's vertex traced through each division. */
const sampleMeridians = (ctx: ConstantAspectContext, divisions: number[][]): Vector3[][] =>
	divisions.map((bandDivisions, vertexNumber) =>
		bandDivisions.map((division) => meridianPointAt(ctx, vertexNumber, division))
	);

/**
 * Iteratively places `quadCount` quads between curve positions t0 and t1 so their
 * aspect ratios converge on their own average. Returns per-band divisions, each
 * running t0 → t1 inclusive.
 */
const equalizeDivisions = (
	ctx: ConstantAspectContext,
	t0: number,
	t1: number,
	quadCount: number
): number[][] => {
	const { bandCount, divisionBasis } = ctx;
	const levelCount = quadCount + 1;
	const span = t1 - t0;
	const spacing = 1 / quadCount;
	const iterations = 50;
	const divergenceLimit = 0.1;

	let divisions = new Array(bandCount).fill([]).map(() => {
		return new Array(levelCount)
			.fill(0)
			.map((v, i) => (i === levelCount - 1 ? t1 : t0 + span * (spacing * i)));
	});
	// The divisions the last sampled meridians came from: the loop can run out
	// after adjusting, and the levels must match what was measured.
	let sampled = divisions;

	const divergenceTest = (
		divergences: number[],
		divergenceLimit: number,
		divisionBasis?: number
	) => {
		if (divisionBasis === undefined) {
			return !divergences.some((d) => d > divergenceLimit);
		} else {
			return divergences[divisionBasis] <= divergenceLimit;
		}
	};

	for (let iteration = 0; iteration < iterations; iteration++) {
		sampled = divisions;
		const meridians = sampleMeridians(ctx, divisions);
		const aspectRatios = getAspectRatiosFromMeridians(meridians);
		const divergences = aspectRatios.map((ar) => getDivergence(ar));
		if (divergenceTest(divergences, divergenceLimit, divisionBasis)) {
			break;
		}

		const adjusted = divisions
			.map((band, i) =>
				adjustDivisions(band, aspectRatios[divisionBasis === undefined ? i : divisionBasis], t0, t1)
			)
			.map((band, i, bands) => {
				return band.map((divisionValue, j) => {
					return (divisionValue + bands[(bands.length + i - 1) % bands.length][j]) / 2;
				});
			});
		// Keep the last good divisions rather than sampling the curves at NaN.
		if (adjusted.some((band) => band.some((d) => !Number.isFinite(d)))) {
			break;
		}
		divisions = adjusted;
	}
	return sampled;
};

/** A stretch of the silhouette, by arc-length position, that is wholly narrow or wide. */
type SilhouetteSpan = { t0: number; t1: number; narrow: boolean };

/**
 * Splits the silhouette at every point where its x crosses `width`. Crossings are
 * found on a fixed grid and then refined by bisection, so a span boundary lands
 * on the threshold itself rather than on the nearest grid step.
 */
export const getSilhouetteSpans = (
	silhouette: CurvePath<Vector2>,
	width: number
): SilhouetteSpan[] => {
	const samples = 256;
	const isNarrow = (t: number) => silhouette.getPointAt(t).x < width;
	const spans: SilhouetteSpan[] = [];
	let start = 0;
	let narrow = isNarrow(0);
	for (let i = 1; i <= samples; i++) {
		const t = i / samples;
		if (isNarrow(t) === narrow) continue;
		let lo = (i - 1) / samples;
		let hi = t;
		for (let step = 0; step < 30; step++) {
			const mid = (lo + hi) / 2;
			if (isNarrow(mid) === narrow) lo = mid;
			else hi = mid;
		}
		spans.push({ t0: start, t1: hi, narrow });
		start = hi;
		narrow = !narrow;
	}
	spans.push({ t0: start, t1: 1, narrow });
	return spans;
};

/**
 * Splits `total` into whole shares proportional to `weights`, each at least 1
 * (largest remainder). Assumes total >= weights.length.
 */
const apportion = (total: number, weights: number[]): number[] => {
	const shares = weights.map(() => 1);
	const spare = total - weights.length;
	const weightSum = weights.reduce((sum, w) => sum + w, 0);
	if (spare <= 0 || weightSum <= 0) return shares;
	const ideal = weights.map((w) => (spare * w) / weightSum);
	ideal.forEach((x, i) => (shares[i] += Math.floor(x)));
	let left = spare - ideal.reduce((sum, x) => sum + Math.floor(x), 0);
	const byRemainder = ideal
		.map((x, i) => ({ i, remainder: x - Math.floor(x) }))
		.sort((a, b) => b.remainder - a.remainder);
	for (let k = 0; left > 0; k++, left--) shares[byRemainder[k % byRemainder.length].i]++;
	return shares;
};

/**
 * Sum of quad aspect ratios along the basis band once a span is equalized with
 * `quadCount` quads. It is roughly independent of quadCount, so spans that should
 * share one aspect ratio need quads in proportion to it. Only meaningful for wide
 * spans: a span reaching a pole has no finite mass.
 */
const getAspectMass = (
	ctx: ConstantAspectContext,
	span: SilhouetteSpan,
	quadCount: number
): number => {
	const divisions = equalizeDivisions(ctx, span.t0, span.t1, quadCount);
	const band = getAspectRatiosFromMeridians(sampleMeridians(ctx, divisions))[
		ctx.divisionBasis ?? 0
	];
	const values = band.filter((ar): ar is number => ar !== null && Number.isFinite(ar));
	if (values.length === 0) return 0;
	return (quadCount * values.reduce((sum, v) => sum + v, 0)) / values.length;
};

/**
 * The basis band's centerline through a span, as cumulative 3D length against
 * curve position. Used to space a narrow span's levels evenly up the band.
 */
const getBandProfile = (ctx: ConstantAspectContext, span: SilhouetteSpan) => {
	const samples = 200;
	const b0 = ctx.divisionBasis ?? 0;
	const b1 = (b0 + 1) % ctx.bandCount;
	const ts = new Array(samples + 1)
		.fill(0)
		.map((v, i) => (i === samples ? span.t1 : span.t0 + (span.t1 - span.t0) * (i / samples)));
	const centers = ts.map((t) =>
		meridianPointAt(ctx, b0, t)
			.add(meridianPointAt(ctx, b1, t))
			.multiplyScalar(0.5)
	);
	const lengths = [0];
	for (let i = 1; i < centers.length; i++) {
		lengths.push(lengths[i - 1] + centers[i].distanceTo(centers[i - 1]));
	}
	const widthAt = (t: number) =>
		meridianPointAt(ctx, b0, t).distanceTo(meridianPointAt(ctx, b1, t));
	return { ts, lengths, length: lengths[samples], widthAt };
};

/** quadCount + 1 positions from span.t0 to span.t1, evenly spaced by band length. */
const spaceByLength = (
	{ ts, lengths, length }: ReturnType<typeof getBandProfile>,
	quadCount: number
): number[] => {
	const divisions = [ts[0]];
	let j = 1;
	for (let k = 1; k < quadCount; k++) {
		const target = (length * k) / quadCount;
		while (j < lengths.length - 1 && lengths[j] < target) j++;
		const segment = lengths[j] - lengths[j - 1];
		const f = segment > 0 ? (target - lengths[j - 1]) / segment : 0;
		divisions.push(ts[j - 1] + (ts[j] - ts[j - 1]) * f);
	}
	divisions.push(ts[ts.length - 1]);
	return divisions;
};

/**
 * preserveAspectRatio with a narrow-region limit. Narrow spans are filled first
 * with quads of one fixed height: aspectRatio times the band's width where the
 * span meets a wide one. Their aspect ratio is aspectRatio at that boundary and
 * grows as the silhouette narrows, so a span reaching a pole costs a finite
 * number of quads (a fixed aspect ratio there would need infinitely many). The
 * remaining divisions go to the wide spans, which run the usual equalization.
 * Falls back to plain equalization when the limit cannot apply (no narrow or no
 * wide span, or fewer divisions than spans).
 */
const getNarrowRegionDivisions = (
	ctx: ConstantAspectContext,
	totalDivisions: number,
	{ width, aspectRatio }: NarrowRegionConfig
): number[][] => {
	const plain = () => equalizeDivisions(ctx, 0, 1, totalDivisions);
	if (!(width > 0) || !(aspectRatio > 0)) return plain();

	const spans = getSilhouetteSpans(ctx.silhouette, width);
	const narrowSpans = spans.filter((s) => s.narrow);
	const wideSpans = spans.filter((s) => !s.narrow);
	if (narrowSpans.length === 0 || wideSpans.length === 0 || totalDivisions < spans.length) {
		return plain();
	}

	const profiles = narrowSpans.map((span) => getBandProfile(ctx, span));
	let narrowCounts = narrowSpans.map((span, i) => {
		const { length, widthAt } = profiles[i];
		// Spans alternate, so every narrow span meets a wide one at t0, t1 or both.
		const boundaries = [span.t0, span.t1].filter((t) => t > 0 && t < 1);
		const boundaryWidth = boundaries.reduce((sum, t) => sum + widthAt(t), 0) / boundaries.length;
		const quadHeight = aspectRatio * boundaryWidth;
		return quadHeight > 0 ? Math.max(1, Math.round(length / quadHeight)) : 1;
	});
	const narrowBudget = totalDivisions - wideSpans.length;
	if (narrowCounts.reduce((sum, n) => sum + n, 0) > narrowBudget) {
		narrowCounts = apportion(narrowBudget, narrowCounts);
	}

	const wideTotal = totalDivisions - narrowCounts.reduce((sum, n) => sum + n, 0);
	let wideCounts = [wideTotal];
	if (wideSpans.length > 1) {
		// Share between wide spans so they settle on a common aspect ratio.
		const wideLength = wideSpans.reduce((sum, s) => sum + s.t1 - s.t0, 0);
		const provisional = apportion(
			wideTotal,
			wideSpans.map((s) => (s.t1 - s.t0) / wideLength)
		);
		wideCounts = apportion(
			wideTotal,
			wideSpans.map((s, i) => getAspectMass(ctx, s, provisional[i]))
		);
	}

	const bands: number[][] = new Array(ctx.bandCount).fill(0).map(() => []);
	let narrowIndex = 0;
	let wideIndex = 0;
	spans.forEach((span, spanIndex) => {
		let spanDivisions: number[][];
		if (span.narrow) {
			const shared = spaceByLength(profiles[narrowIndex], narrowCounts[narrowIndex]);
			spanDivisions = bands.map(() => shared);
			narrowIndex++;
		} else {
			spanDivisions = equalizeDivisions(ctx, span.t0, span.t1, wideCounts[wideIndex]);
			wideIndex++;
		}
		spanDivisions.forEach((d, b) => bands[b].push(...(spanIndex === 0 ? d : d.slice(1))));
	});
	return bands;
};

/** Aspect ratio of each quad along a band; null for a quad that touches a pole. */
type AspectRatio = number | null;

const averageAspectRatio = (aspectRatios: AspectRatio[]): number => {
	const values = aspectRatios.filter((ar): ar is number => ar !== null);
	return values.reduce((sum, val) => sum + val, 0) / values.length;
};

const getDivergence = (aspectRatios: AspectRatio[]) => {
	const avg = averageAspectRatio(aspectRatios);
	return aspectRatios
		.filter((ar): ar is number => ar !== null)
		.map((val) => Math.abs(avg - val) / avg)
		.reduce((sum, val) => sum + val, 0);
};

const adjustDivisions = (divisions: number[], aspectRatios: AspectRatio[], t0 = 0, t1 = 1) => {
	const avgAspectRatio = averageAspectRatio(aspectRatios);
	const newDivisionsUnscaled = divisions.map((div, i) => {
		if (i === 0) {
			return 0;
		}
		const height = div - divisions[i - 1];
		const aspectRatio = aspectRatios[i - 1];
		// A pole quad keeps its share of the curve: see getAspectRatioOfQuad.
		return aspectRatio === null ? height : (avgAspectRatio * height) / aspectRatio;
	});
	const totalNewDivisionsUnscaled = newDivisionsUnscaled.reduce((sum, val) => sum + val, 0);
	const span = t1 - t0;
	const newDivisions: number[] = [];
	newDivisionsUnscaled.forEach((div, i) => {
		if (i === divisions.length - 1) {
			newDivisions.push(t1);
		} else if (i === 0) {
			newDivisions.push(t0);
		} else {
			newDivisions.push(newDivisions[i - 1] + span * (div / totalNewDivisionsUnscaled));
		}
	});
	return newDivisions;
};

// apply silhoette scaling to depthed vertex, givinga 3d point
const getMeridianPoint = (
	division: number,
	silhouette: CurvePath<Vector2>,
	vertex: Vector2
): Vector3 => {
	const silhouettePoint = silhouette.getPointAt(division);
	const center = new Vector3(0, 0, silhouettePoint.y);
	const meridianVectorLength = Math.sqrt(
		Math.pow(silhouettePoint.x * vertex.x * 2, 2) + Math.pow(silhouettePoint.x * vertex.y * 2, 2)
	);
	const meridianVector = new Vector3(vertex.x, vertex.y, 0).setLength(meridianVectorLength);
	const meridianPoint = center.addScaledVector(meridianVector, 1);
	return meridianPoint;
};

const generateRawLevels = ({
	silhouette,
	depthCurve,
	depthBaseline,
	levelPrototypes,
	sampleMethod
}: {
	silhouette: CurvePath<Vector2>;
	depthCurve: CurvePath<Vector2>;
	depthBaseline: number;
	levelPrototypes: LevelPrototype[];
	sampleMethod: CurveSampleMethod;
}): Level[] => {
	const fractionalDivisions: number[] = [];
	const spacing = 1 / sampleMethod.divisions;
	for (let i = 0; i < sampleMethod.divisions + 1; i++) {
		if (i === sampleMethod.divisions) {
			fractionalDivisions.push(1);
		} else {
			fractionalDivisions.push(i * spacing);
		}
	}

	const rawLevels: Level[] = [];

	fractionalDivisions.forEach((division, i) => {
		const silhouetteValue =
			sampleMethod.method === 'divideCurve'
				? silhouette.getPoint(division)
				: silhouette.getPointAt(division);
		const depthValue =
			sampleMethod.method === 'divideCurve'
				? depthCurve.getPoint(division).x / depthBaseline
				: depthCurve.getPointAt(division).x / depthBaseline;
		const offset: LevelOffset = {
			x: 0,
			y: 0,
			z: silhouetteValue.y,
			rotX: 0,
			rotY: 0,
			rotZ: 0,
			scaleX: silhouetteValue.x * 2,
			scaleY: silhouetteValue.x * 2,
			depth: depthValue
		};
		rawLevels.push(generateLevel(offset, levelPrototypes[i % levelPrototypes.length], i));
	});

	return rawLevels;
};

const getAspectRatiosFromMeridians = (meridians: Vector3[][]): AspectRatio[][] => {
	const bandCount = meridians.length;
	const pointCount = meridians[0].length;
	let bands: { v0: Vector3; v1: Vector3; v2: Vector3; v3: Vector3 }[][] = new Array(bandCount);
	bands = bands.fill([]).map(() => []);

	for (let b = 0; b < bandCount; b++) {
		for (let p = 0; p < pointCount - 1; p++) {
			bands[b].push({
				v0: meridians[b][p],
				v1: meridians[b][p + 1],
				v2: meridians[(b + 1) % bandCount][p + 1],
				v3: meridians[(b + 1) % bandCount][p]
			});
		}
	}

	return bands.map((band) => band.map((quad) => getAspectRatioOfQuad(quad)));
};

const getAspectRatioOfQuad = ({
	v0,
	v1,
	v2,
	v3
}: {
	v0: Vector3;
	v1: Vector3;
	v2: Vector3;
	v3: Vector3;
}): AspectRatio => {
	// A quad with a collapsed side (silhouette x = 0) is a triangle whose apex is the
	// pole. Shrinking it gives a similar triangle with the same aspect ratio, so
	// balancing it only drives its height to zero and the divisions to NaN.
	const poleTolerance = 1e-9;
	if (v0.distanceTo(v3) < poleTolerance || v1.distanceTo(v2) < poleTolerance) {
		return null;
	}
	const mid0 = new Vector3((v0.x + v1.x) / 2, (v0.y + v1.y) / 2, (v0.z + v1.z) / 2);
	const mid1 = new Vector3((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, (v1.z + v2.z) / 2);
	const mid2 = new Vector3((v2.x + v3.x) / 2, (v2.y + v3.y) / 2, (v2.z + v3.z) / 2);
	const mid3 = new Vector3((v3.x + v0.x) / 2, (v3.y + v0.y) / 2, (v3.z + v0.z) / 2);
	const width = mid2.clone().addScaledVector(mid0, -1).length();
	const height = mid3.clone().addScaledVector(mid1, -1).length();
	return height / width;
};

const getLevelPrototypeArray = (
	levelCount: number,
	levelPrototype: LevelPrototype | LevelPrototype[]
): LevelPrototype[] => {
	let levelPrototypeArray: LevelPrototype[] = new Array(levelCount);
	if (Array.isArray(levelPrototype)) {
		levelPrototypeArray.fill(levelPrototype[0]);
		levelPrototypeArray = levelPrototypeArray.map((lp, i): LevelPrototype => {
			return {
				center: levelPrototype[i % levelPrototype.length].center.clone(),
				vertices: levelPrototype[i % levelPrototype.length].vertices.map((v) => v.clone())
			};
		});
	} else {
		levelPrototypeArray.fill(levelPrototype);
		levelPrototypeArray = levelPrototypeArray.map((lp) => ({
			center: lp.center.clone(),
			vertices: lp.vertices.map((v) => v.clone())
		}));
	}
	return levelPrototypeArray;
};

const countLevels = (levelConfig: LevelConfig, silhouetteConfig: SilhouetteConfig) => {
	return levelConfig.silhouetteSampleMethod.method === 'divideCurve'
		? silhouetteConfig.curves.length * levelConfig.silhouetteSampleMethod.divisions + 1
		: levelConfig.silhouetteSampleMethod.divisions + 1;
};

const getLevelOffsets = (levelConfig: LevelConfig, levelCount: number) => {
	const levelOffsets: LevelOffset[] = new Array(levelCount);
	for (let l = 0; l < levelOffsets.length; l++) {
		levelOffsets[l] = structuredClone(
			levelConfig.levelOffsets[l % levelConfig.levelOffsets.length]
		);
		const { x, y, rotX, rotY, rotZ, scaleX, scaleY } = levelOffsets[l];
		levelOffsets[l].x = x * l;
		levelOffsets[l].y = y * l;
		levelOffsets[l].z = 1;
		levelOffsets[l].rotX = rotX * l;
		levelOffsets[l].rotY = rotY * l;
		levelOffsets[l].rotZ = rotZ * l;
		levelOffsets[l].scaleX = scaleX; //* silhouetteScale.x
		levelOffsets[l].scaleY = scaleY; //* silhouetteScale.x
		levelOffsets[l].depth = 1;
	}
	return levelOffsets;
};

const getDepthedLevelPrototype = (lp: LevelPrototype, depth: number): LevelPrototype => {
	const minLength = Math.min(...lp.vertices.map((v) => v.length()));
	const depthedVertices = lp.vertices.map((v) => {
		const length = v.length();
		return v.clone().setLength(minLength + (length - minLength) * depth);
	});
	return { ...lp, vertices: depthedVertices };
};

const generateLevel = (
	offset: LevelOffset,
	prototype: LevelPrototype,
	levelNumber: number
): Level => {
	// apply offsets to prototype
	// axes for rotation
	const zAxis = new Vector3(0, 0, 1);
	const xAxis = new Vector3(1, 0, 0);
	const yAxis = new Vector3(0, 1, 0);
	// center for coordinate offset
	const center = new Vector3(offset.x, offset.y, offset.z);

	const minLength = Math.min(...prototype.vertices.map((v) => v.length()));
	const depthedVertices = prototype.vertices.map((v) => {
		const length = v.length();
		return v.clone().setLength(minLength + (length - minLength) * offset.depth);
	});

	const vertices = depthedVertices.map((pV) => {
		const scaledVertex: Vector3 = new Vector3(pV.x, pV.y, 0);
		scaledVertex.setLength(
			Math.sqrt(Math.pow(offset.scaleX * pV.x, 2) + Math.pow(offset.scaleY * pV.y, 2))
		);
		scaledVertex.applyAxisAngle(zAxis, offset.rotZ); // z axis rotation must be first
		scaledVertex.applyAxisAngle(xAxis, offset.rotX);
		scaledVertex.applyAxisAngle(yAxis, offset.rotY);
		scaledVertex.addScaledVector(center, 1);
		return scaledVertex;
	});
	const level: Level = {
		center,
		level: levelNumber,
		vertices
	};
	return level;
};

export const getCurvePoints = (curveConfig: SilhouetteConfig, { divisions }: CurveSampleMethod) => {
	const curve = generateSilhouette(curveConfig);
	// const pointCount = method === 'divideCurve' ? curveConfig.curves.length * divisions : divisions;
	const result: { points: Vector2[]; tangents: Vector2[]; normals: Vector2[] } = {
		points: curve.getSpacedPoints(divisions),
		tangents: [],
		normals: []
	};

	result.tangents = result.points.map((point, i) => curve.getTangentAt((i * 1) / divisions));
	result.normals = result.tangents.map((tangent) => new Vector2(tangent.y, -tangent.x));

	return result;
};
