import type { PathSegment, PatternLabelsConfig, TubeCutPattern } from '$lib/types';
import { computeTiledUnionPaths } from '../prepare-merge';
import { getPaperScope } from '$lib/paper/scope';
import { pathSegmentsToPaper } from '$lib/paper';

const contourCount = (segs: PathSegment[]): number => segs.filter((s) => s[0] === 'M').length;

// A 100x100 grid facet (thin strokes) → ~100 interior holes. Anchor at the
// bottom edge so a 0-radian label extends downward past the grid.
const gridLattice = (): PathSegment[] => {
	const lattice: PathSegment[] = [];
	for (let i = 0; i <= 10; i++) {
		lattice.push(['M', 0, i * 10], ['L', 100, i * 10]);
		lattice.push(['M', i * 10, 0], ['L', i * 10, 100]);
	}
	return lattice;
};

const gridTube = (id: string): TubeCutPattern =>
	({
		bands: [
			{
				id,
				facets: [{ path: gridLattice(), strokeWidth: 2 }],
				tagAnchorPoint: { x: 50, y: 100 },
				tagAngle: 0
			}
		]
	}) as unknown as TubeCutPattern;

const labelsEnabled: PatternLabelsConfig = {
	selfTag: { enabled: true, height: 16, angle: 0, padding: 5, stemLength: 20, stemWidth: 4 }
};

const bottomY = (segs: PathSegment[]): number => {
	const item = pathSegmentsToPaper(segs);
	const bottom = item.bounds.y + item.bounds.height;
	item.remove();
	return bottom;
};

describe('computeTiledUnionPaths label merge', () => {
	beforeAll(() => getPaperScope());

	test('merges the self-tag label into the band union when selfTag is enabled', () => {
		const bandOnly = computeTiledUnionPaths([gridTube('t0b0')]).get('t0b0')!;
		const withLabel = computeTiledUnionPaths(
			[gridTube('t0b0')],
			labelsEnabled,
			new Map([['t0b0', { width: 20, height: 10 }]])
		).get('t0b0')!;

		// The label (stem 20 + body ~20) extends the silhouette well below the grid.
		expect(bottomY(withLabel)).toBeGreaterThan(bottomY(bandOnly) + 15);
		// And the grid's interior holes are still preserved after the label merge.
		expect(contourCount(withLabel)).toBeGreaterThanOrEqual(contourCount(bandOnly));
	});

	test('does not add a label when selfTag is disabled', () => {
		const disabled: PatternLabelsConfig = { selfTag: { ...labelsEnabled.selfTag!, enabled: false } };
		const bandOnly = computeTiledUnionPaths([gridTube('t0b0')]).get('t0b0')!;
		const withDisabled = computeTiledUnionPaths(
			[gridTube('t0b0')],
			disabled,
			new Map([['t0b0', { width: 20, height: 10 }]])
		).get('t0b0')!;
		expect(bottomY(withDisabled)).toBeCloseTo(bottomY(bandOnly), 1);
	});
});
