import type { Section } from './types';

/**
 * A section counts as closed when the gap between its endpoints is under this
 * fraction of the mean distance between neighbouring points.
 *
 * The tolerance is RELATIVE on purpose. Globule coordinates are in model units,
 * so a fixed epsilon would misjudge very large or very small globules. It is
 * also decisive rather than marginal: a closed profile carries a duplicate
 * closing point (gap ~0), while an open one leaves a wedge on the order of a
 * full point spacing. Anything near the threshold is malformed input.
 *
 * Deliberately NOT `FILL_DEGENERATE_EPSILON` (see `fill-bands.ts`) — that is an
 * absolute threshold for zero-length edges, a different question entirely.
 */
export const CLOSURE_RATIO = 0.01;

export const isSectionClosed = (section: Section): boolean => {
	const { points } = section;
	if (points.length < 3) return false;

	const closingGap = points[0].distanceTo(points[points.length - 1]);

	let total = 0;
	for (let i = 0; i < points.length - 1; i++) {
		total += points[i].distanceTo(points[i + 1]);
	}
	const meanSpacing = total / (points.length - 1);
	if (meanSpacing === 0) return false;

	return closingGap < meanSpacing * CLOSURE_RATIO;
};

/**
 * The tube wraps only when EVERY section closes. Sections that disagree are
 * treated as open: failing to drop segments is a cosmetic miss, whereas
 * punching holes in an edge that should be solid ruins a cut.
 */
export const isTubeClosed = (sections: Section[]): boolean =>
	sections.length > 0 && sections.every(isSectionClosed);
