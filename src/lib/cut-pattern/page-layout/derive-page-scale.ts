/**
 * pageScale that makes a measured extent read as `targetMm`.
 *
 * derivePageDimensions and deriveDistance both compute mm = patternUnits /
 * pageScale, so the inverse is a single division — no search needed.
 *
 * Returns undefined for input that cannot produce a usable scale, so the caller
 * can reject the edit rather than writing Infinity or NaN into config.
 */
export const derivePageScaleForTarget = (
	rawPatternUnits: number,
	targetMm: number
): number | undefined => {
	if (!Number.isFinite(rawPatternUnits) || !Number.isFinite(targetMm)) return undefined;
	if (rawPatternUnits <= 0 || targetMm <= 0) return undefined;
	return rawPatternUnits / targetMm;
};
