import type { BandCutPattern, PathSegment, Point } from '$lib/types';
import type { TabGeometry } from './generate-tab-geometry';

export type BandTabRecord = NonNullable<BandCutPattern['tabs']>[number];

/**
 * Minimal "edge" shape consumed by `collectOutlinedBandTabs`. This mirrors the
 * fields of `OutlineEdge` (see generate-outlined-pattern.ts) that we actually
 * read, so the helper stays decoupled from the heavy Vector3 / partner pipeline
 * and is trivially testable.
 *
 * `side`:
 *   - 'end'    → short cap of the band; should classify as 'start' or 'end' based
 *                on `endIsStartCap` (true) vs (false).
 *   - 'before' / 'after' → long side of the band; always classifies as 'mid'.
 *
 * `endIsStartCap`:
 *   - true  on the near-end edge (matches `band.meta.startPartnerBand`)
 *   - false on the far-end edge (matches `band.meta.endPartnerBand`)
 *   - undefined for non-'end' edges
 */
export type OutlinedTabEdge = {
	side: 'before' | 'after' | 'end';
	endIsStartCap?: boolean;
};

const pointFromXY = (v: { x: number; y: number }): Point => ({ x: v.x, y: v.y });

/**
 * Extract the 2D outer ring of a TabGeometry's outline shape.
 *
 * TabGeometry stores its shared edge as `edgeStart` / `edgeEnd` (the side on
 * the band) and a `path` of `L`/`A` segments that walk from `edgeStart` around
 * the protruding shape back to `edgeEnd`. For label placement we want the full
 * tab polygon, so we splice `edgeStart` onto the front and treat every L/A
 * vertex along the path as an outer point. Curve control points are skipped —
 * we use the final endpoint of each segment, which is enough to position a
 * label inside the tab footprint.
 */
const extractTabOuter = (tab: TabGeometry): Point[] => {
	const ring: Point[] = [pointFromXY(tab.edgeStart)];
	for (const seg of tab.path) {
		if (seg[0] === 'L') {
			ring.push({ x: seg[1] as number, y: seg[2] as number });
		} else if (seg[0] === 'A') {
			// Arc endpoint is the last two numeric args (rx, ry, rot, large, sweep, x, y).
			ring.push({ x: seg[6] as number, y: seg[7] as number });
		} else if (seg[0] === 'C') {
			// Cubic endpoint is the last two args (cx1, cy1, cx2, cy2, x, y).
			ring.push({ x: seg[5] as number, y: seg[6] as number });
		} else if (seg[0] === 'Q') {
			ring.push({ x: seg[3] as number, y: seg[4] as number });
		} else if (seg[0] === 'M') {
			ring.push({ x: seg[1] as number, y: seg[2] as number });
		}
		// 'Z' and unknown segments contribute no new point.
	}
	// The final L in TabGeometry.path moves back to edgeEnd — that's already
	// captured above. Dedupe a trailing point that exactly equals edgeEnd to
	// avoid a stutter vertex.
	const last = ring[ring.length - 1];
	if (last && last.x === tab.edgeEnd.x && last.y === tab.edgeEnd.y) {
		// already there — leave it as the closing vertex of the polygon
	} else {
		ring.push(pointFromXY(tab.edgeEnd));
	}
	return ring;
};

/**
 * Build BandCutPattern.tabs records for the outlined cut-pattern pipeline.
 *
 * @param edges          the OutlineEdges that compose the band perimeter,
 *                       in walk order. Only `side` and `endIsStartCap` are
 *                       read — extra fields on full OutlineEdge are ignored.
 * @param tabsByIndex    map from edge index → TabGeometry for edges that
 *                       carry a tab. Edges absent from this map are skipped.
 *
 * Classification:
 *   - 'end' edge + endIsStartCap === true  → position 'start'
 *   - 'end' edge + endIsStartCap === false → position 'end'
 *   - 'before' / 'after' edge              → position 'mid'
 *
 * Mid records receive a sequential `midIndex` (0..N-1, in the edge walk order
 * they appear) and are back-filled with `midCount` once we know the total.
 *
 * Returns undefined when there are no tabs, so callers can leave
 * `BandCutPattern.tabs` unset (matches the non-outlined paths' convention).
 */
export const collectOutlinedBandTabs = (
	edges: OutlinedTabEdge[],
	tabsByIndex: Map<number, TabGeometry>
): BandTabRecord[] | undefined => {
	if (tabsByIndex.size === 0) return undefined;

	const records: BandTabRecord[] = [];
	let midCount = 0;

	for (let i = 0; i < edges.length; i++) {
		const tab = tabsByIndex.get(i);
		if (!tab) continue;
		const edge = edges[i];

		let position: BandTabRecord['position'];
		if (edge.side === 'end') {
			position = edge.endIsStartCap ? 'start' : 'end';
		} else {
			position = 'mid';
		}

		const outer = extractTabOuter(tab);
		const base: [Point, Point] = [pointFromXY(tab.edgeStart), pointFromXY(tab.edgeEnd)];

		const record: BandTabRecord = { outer, base, position };
		if (position === 'mid') record.midIndex = midCount++;
		records.push(record);
	}

	if (!records.length) return undefined;

	// Back-fill midCount on every mid record now that we know the total.
	for (const r of records) {
		if (r.position === 'mid') r.midCount = midCount;
	}

	return records;
};

// Re-export PathSegment to keep TabGeometry's path shape addressable downstream
// without forcing tests to import from the generation module directly.
export type { PathSegment };
