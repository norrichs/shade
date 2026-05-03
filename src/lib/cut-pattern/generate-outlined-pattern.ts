import { Vector3 } from 'three';
import type { Tube } from '$lib/projection-geometry/types';
import type {
	Band,
	BandCutPattern,
	CutPattern,
	OutlinedPatternConfig,
	OutlinedTabConfig,
	PathSegment,
	PixelScale,
	Quadrilateral,
	TubeCutPattern
} from '$lib/types';
import type { SuperGlobuleProjectionPattern } from '$lib/stores/superGlobuleStores';
import type { SuperGlobuleConfig } from '$lib/types';
import { resolveRangeIndices, type ProjectionRange } from '$lib/projection-geometry/filters';
import { getFlatStripV2 } from './generate-cut-pattern';
import { alignBands } from './generate-tiled-pattern';
import { svgPathStringFromSegments } from '$lib/patterns/utils';
import { getQuadrilaterals } from '$lib/patterns/quadrilateral';
import {
	generateRectangularTab,
	generateRoundedTab,
	generateInsetTab,
	generatePartnerTab,
	generatePartnerInsetTab,
	correctTabOverlaps,
	type TabGeometry
} from './generate-tab-geometry';

/**
 * Compute bounding box from all coordinates in a path.
 */
const getBoundsFromPath = (
	path: PathSegment[]
): { left: number; top: number; width: number; height: number; center: Vector3 } => {
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const seg of path) {
		if (seg[0] === 'Z') continue;
		if (seg[0] === 'M' || seg[0] === 'L') {
			const x = seg[1] as number;
			const y = seg[2] as number;
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		} else if (seg[0] === 'A') {
			// Arc endpoint
			const x = seg[6] as number;
			const y = seg[7] as number;
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		}
	}
	const width = maxX - minX;
	const height = maxY - minY;
	return {
		left: minX,
		top: minY,
		width,
		height,
		center: new Vector3(minX + width / 2, minY + height / 2, 0)
	};
};

/**
 * An edge in the band outline, tagged with which side it belongs to.
 * - 'after': the side facing bands with higher band index (quad c→b edges)
 * - 'before': the side facing bands with lower band index (quad a→d edges)
 * - 'end': the two short edges at band start/end connecting the two sides
 */
type OutlineEdge = {
	start: Vector3;
	end: Vector3;
	side: 'after' | 'before' | 'end';
	/** A point on the interior of the band, used to determine outward tab direction */
	interiorPoint: Vector3;
	/** For partner tabs: the two outer points from the adjacent band's quad */
	partnerOuter?: { start: Vector3; end: Vector3 };
	/** For end edges: the tube index of the partner at this end */
	endPartnerTube?: number;
};

/**
 * Decompose a flattened band into an ordered list of perimeter edges using quadrilaterals.
 *
 * Uses the same walk order as getOutline() in quadrilateral.ts:
 *   Quad layout:  d --- c
 *                 |     |
 *                 a --- b
 *
 * Walk order (forming a closed perimeter):
 * 1. "before" side (a→d edges): q[0].a → q[0].d → q[1].d → q[2].d → ...
 * 2. "end" edge: q[last].d → q[last].c
 * 3. "after" side (c→b edges, walked backward): q[last].c → q[last].b → q[last-1].b → ... → q[0].b
 * 4. "end" edge: q[0].b → q[0].a (close)
 */
/**
 * Decompose a band's quad perimeter into edges, one per quad per side.
 *
 * Quad layout:  d --- c
 *               |     |
 *               a --- b
 *
 * "before" side = a→d edge of each quad (walked forward)
 * "after" side  = c→b edge of each quad (walked backward)
 *
 * Adjacent quads share points (q[i].d ≈ q[i+1].a, q[i].c ≈ q[i+1].b),
 * so the outline is continuous.
 */

/**
 * Transform points from a partner quad's coordinate space into the current band's space
 * by aligning shared edges.
 *
 * originEdge: the shared edge as it appears in the current band (start, end)
 * partnerEdge: the same shared edge as it appears in the partner band (start, end)
 * points: the partner points to transform
 *
 * Computes rotation to align partner edge direction with origin edge direction,
 * then translates to align the edge start points.
 */
const transformPartnerPoints = (
	originStart: Vector3,
	originEnd: Vector3,
	partnerStart: Vector3,
	partnerEnd: Vector3,
	points: Vector3[]
): Vector3[] => {
	const originAngle = Math.atan2(originEnd.y - originStart.y, originEnd.x - originStart.x);
	const partnerAngle = Math.atan2(partnerEnd.y - partnerStart.y, partnerEnd.x - partnerStart.x);

	// Partner edge should point the opposite direction (they share an edge, walked from opposite sides)
	const rotation = originAngle - partnerAngle - Math.PI;
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);

	// After rotation, partnerEnd aligns with originStart (edges run opposite directions)
	const rotatedPartnerEndX =
		(partnerEnd.x - partnerStart.x) * cos - (partnerEnd.y - partnerStart.y) * sin + partnerStart.x;
	const rotatedPartnerEndY =
		(partnerEnd.x - partnerStart.x) * sin + (partnerEnd.y - partnerStart.y) * cos + partnerStart.y;
	const tx = originStart.x - rotatedPartnerEndX;
	const ty = originStart.y - rotatedPartnerEndY;

	return points.map((p) => {
		// Rotate around partner edge start, then translate
		const dx = p.x - partnerStart.x;
		const dy = p.y - partnerStart.y;
		const rx = dx * cos - dy * sin + partnerStart.x + tx;
		const ry = dx * sin + dy * cos + partnerStart.y + ty;
		return new Vector3(rx, ry, 0);
	});
};

const getOutlineEdges = (
	quads: Quadrilateral[],
	band: Band,
	neighborBefore?: Quadrilateral[],
	neighborAfter?: Quadrilateral[]
): OutlineEdge[] => {
	if (quads.length === 0) return [];

	// Get end partner tube addresses from facet metadata
	// For axial-right: base edge is 'ab' for even facets, second edge is 'ab' for odd facets
	const startPartnerTube = band.facets[0]?.meta?.ab?.partner?.tube;
	const endPartnerTube = band.facets[band.facets.length - 1]?.meta?.ab?.partner?.tube;

	const edges: OutlineEdge[] = [];

	// "before" side: a→d edge of each quad, walked forward
	// Partner is from neighborBefore's "after" side (c→b edge shares with our a→d)
	for (let i = 0; i < quads.length; i++) {
		const q = quads[i];
		const partnerQ = neighborBefore?.[i];
		let partnerOuter: OutlineEdge['partnerOuter'];
		if (partnerQ) {
			// Partner's shared edge is c→b, our shared edge is a→d
			// Partner's non-shared vertices are a and d
			const [tA, tD] = transformPartnerPoints(q.a, q.d, partnerQ.c, partnerQ.b, [
				partnerQ.a,
				partnerQ.d
			]);
			partnerOuter = { start: tA, end: tD };
		}
		// Interior point: midpoint of opposite edge (b-c) of same quad
		const beforeInterior = q.b.clone().add(q.c).multiplyScalar(0.5);
		edges.push({
			start: q.a.clone(),
			end: q.d.clone(),
			side: 'before',
			interiorPoint: beforeInterior,
			partnerOuter
		});
	}

	// End edge: d[last] → c[last] (far end of band)
	// Interior point: midpoint of opposite end (a-b) of last quad
	const farEndInterior = quads[quads.length - 1].a
		.clone()
		.add(quads[quads.length - 1].b)
		.multiplyScalar(0.5);
	edges.push({
		start: quads[quads.length - 1].d.clone(),
		end: quads[quads.length - 1].c.clone(),
		side: 'end',
		interiorPoint: farEndInterior,
		endPartnerTube: endPartnerTube
	});

	// "after" side: c→b edge of each quad, walked backward
	// Partner is from neighborAfter's "before" side (a→d edge shares with our c→b)
	for (let i = quads.length - 1; i >= 0; i--) {
		const q = quads[i];
		const partnerQ = neighborAfter?.[i];
		let partnerOuter: OutlineEdge['partnerOuter'];
		if (partnerQ) {
			// Partner's shared edge is a→d, our shared edge is c→b
			// Partner's non-shared vertices are b and c
			// After rotation: tC lands near our c (start), tB lands near our b (end)
			const [tB, tC] = transformPartnerPoints(q.c, q.b, partnerQ.a, partnerQ.d, [
				partnerQ.b,
				partnerQ.c
			]);
			partnerOuter = { start: tC, end: tB };
		}
		// Interior point: midpoint of opposite edge (a-d) of same quad
		const afterInterior = q.a.clone().add(q.d).multiplyScalar(0.5);
		edges.push({
			start: q.c.clone(),
			end: q.b.clone(),
			side: 'after',
			interiorPoint: afterInterior,
			partnerOuter
		});
	}

	// End edge: b[0] → a[0] (near end of band, closes the loop)
	// Interior point: midpoint of opposite end (c-d) of first quad
	const nearEndInterior = quads[0].c.clone().add(quads[0].d).multiplyScalar(0.5);
	edges.push({
		start: quads[0].b.clone(),
		end: quads[0].a.clone(),
		side: 'end',
		interiorPoint: nearEndInterior,
		endPartnerTube: startPartnerTube
	});

	return edges;
};

/**
 * Generate a tab for a given edge based on the tab config shape.
 */
const generateTabForEdge = (edge: OutlineEdge, tabConfig: OutlinedTabConfig): TabGeometry => {
	switch (tabConfig.shape) {
		case 'rounded':
			return generateRoundedTab(edge.start, edge.end, tabConfig.tabWidth, edge.interiorPoint);
		case 'inset':
			return generateInsetTab(
				edge.start,
				edge.end,
				tabConfig.tabWidth,
				edge.interiorPoint,
				tabConfig.inset
			);
		case 'partner':
			if (edge.partnerOuter) {
				return generatePartnerTab(
					edge.start,
					edge.end,
					tabConfig.tabWidth,
					edge.interiorPoint,
					edge.partnerOuter.start,
					edge.partnerOuter.end
				);
			}
			return generateRectangularTab(edge.start, edge.end, tabConfig.tabWidth, edge.interiorPoint);
		case 'partner-inset':
			if (edge.partnerOuter) {
				return generatePartnerInsetTab(
					edge.start,
					edge.end,
					tabConfig.tabWidth,
					edge.interiorPoint,
					edge.partnerOuter.start,
					edge.partnerOuter.end,
					tabConfig.inset
				);
			}
			return generateInsetTab(
				edge.start,
				edge.end,
				tabConfig.tabWidth,
				edge.interiorPoint,
				tabConfig.inset
			);
		case 'rectangle':
		default:
			return generateRectangularTab(edge.start, edge.end, tabConfig.tabWidth, edge.interiorPoint);
	}
};

/**
 * Check whether a band has partner facets on a given side.
 *
 * For helical-right, the outer edge of each facet is the 'ac' edge.
 * Odd facets form the "after" side, even facets form the "before" side.
 * We check a representative facet on each side for partner metadata.
 */
const bandHasPartners = (band: Band): { after: boolean; before: boolean } => {
	const facets = band.facets;
	// Check first odd facet for "after" side partner
	const afterFacet = facets.length > 1 ? facets[1] : undefined;
	const hasAfter = !!afterFacet?.meta?.ac?.partner;
	// Check first even facet for "before" side partner
	const beforeFacet = facets.length > 0 ? facets[0] : undefined;
	const hasBefore = !!beforeFacet?.meta?.ac?.partner;
	return { after: hasAfter, before: hasBefore };
};

/**
 * Determine whether a given edge should have a tab based on its side, the tab config,
 * whether the band has partners on that side, and for end edges, the partner tube address.
 *
 * For end tabs:
 * - 'before': add tab if partner tube index < current tube index
 * - 'after': add tab if partner tube index > current tube index
 * - 'beforeAndAfter': add tab in both cases
 * This ensures only one side of a tube-to-tube connection gets a tab (no redundancy).
 */
const shouldHaveTab = (
	edge: OutlineEdge,
	tabConfig: OutlinedTabConfig,
	hasPartners: { after: boolean; before: boolean },
	currentTube: number
): boolean => {
	if (edge.side === 'after') {
		return (
			hasPartners.after &&
			(tabConfig.bandEdge === 'after' || tabConfig.bandEdge === 'beforeAndAfter')
		);
	}
	if (edge.side === 'before') {
		return (
			hasPartners.before &&
			(tabConfig.bandEdge === 'before' || tabConfig.bandEdge === 'beforeAndAfter')
		);
	}
	if (edge.side === 'end') {
		if (edge.endPartnerTube === undefined) return false;
		if (tabConfig.bandEnd === 'beforeAndAfter') return true;
		if (tabConfig.bandEnd === 'before') return edge.endPartnerTube < currentTube;
		if (tabConfig.bandEnd === 'after') return edge.endPartnerTube > currentTube;
		return false;
	}
	return false;
};

/**
 * Build the outline path from edges, inserting tab geometry where configured.
 */
const buildOutlinePath = (
	edges: OutlineEdge[],
	tabConfig?: OutlinedTabConfig,
	hasPartners?: { after: boolean; before: boolean },
	currentTube?: number
): PathSegment[] => {
	if (edges.length === 0) return [];

	const path: PathSegment[] = [['M', edges[0].start.x, edges[0].start.y]];

	// Collect tabs per side for overlap correction
	const afterEdgeIndices: number[] = [];
	const beforeEdgeIndices: number[] = [];
	const tabsByIndex = new Map<number, TabGeometry>();

	const partners = hasPartners ?? { after: true, before: true };

	if (tabConfig) {
		// First pass: generate tabs
		for (let i = 0; i < edges.length; i++) {
			if (shouldHaveTab(edges[i], tabConfig, partners, currentTube ?? 0)) {
				const tab = generateTabForEdge(edges[i], tabConfig);
				tabsByIndex.set(i, tab);
				if (edges[i].side === 'after') afterEdgeIndices.push(i);
				if (edges[i].side === 'before') beforeEdgeIndices.push(i);
			}
		}

		// TODO: re-enable overlap correction once basic tabs are working
		// const correctSide = (indices: number[]) => {
		// 	if (indices.length < 2) return;
		// 	const sideTabs = indices.map((idx) => tabsByIndex.get(idx)!);
		// 	const corrected = correctTabOverlaps(sideTabs);
		// 	indices.forEach((idx, j) => tabsByIndex.set(idx, corrected[j]));
		// };
		// correctSide(afterEdgeIndices);
		// correctSide(beforeEdgeIndices);
	}

	// Second pass: build path
	for (let i = 0; i < edges.length; i++) {
		const tab = tabsByIndex.get(i);
		if (tab) {
			for (const seg of tab.path) {
				path.push(seg);
			}
		} else {
			path.push(['L', edges[i].end.x, edges[i].end.y]);
		}
	}

	path.push(['Z']);
	return path;
};

/**
 * Generate outlined pattern for a single band.
 */
const generateOutlinedBandPattern = (
	band: Band,
	bandIndex: number,
	config: OutlinedPatternConfig,
	pixelScale: PixelScale,
	tubeAddress: { globule: number; tube: number },
	quads: Quadrilateral[],
	neighborBefore?: Quadrilateral[],
	neighborAfter?: Quadrilateral[]
): BandCutPattern => {
	const edges = getOutlineEdges(quads, band, neighborBefore, neighborAfter);
	const hasPartners = bandHasPartners(band);
	const outlinePath = buildOutlinePath(edges, config.tabConfig, hasPartners, tubeAddress.tube);

	const outlineFacet: CutPattern = {
		path: outlinePath,
		svgPath: svgPathStringFromSegments(outlinePath),
		label: `outlined-band-${bandIndex}`
	};

	// Quad facets for visualization (showQuads overlay)
	const quadFacets: CutPattern[] = quads.map((quad, i) => ({
		path: [],
		svgPath: '',
		label: `${bandIndex}-${i}`,
		quad
	}));

	// Compute bounds from all path coordinates (includes tab geometry)
	const bounds = getBoundsFromPath(outlinePath);

	return {
		projectionType: 'patterned',
		facets: [outlineFacet, ...quadFacets],
		svgPath: outlineFacet.svgPath,
		id: `outlined-band-${bandIndex}`,
		tagAnchorPoint: { x: 0, y: 0 },
		address: { ...tubeAddress, band: bandIndex },
		bounds
	};
};

/**
 * Generate outlined pattern for a tube.
 */
const generateOutlinedTubePattern = (
	address: { globule: number; tube: number },
	bands: Band[],
	config: OutlinedPatternConfig,
	pixelScale: PixelScale,
	bandRange?: { start: number; end: number }
): TubeCutPattern => {
	const visibleBands = bands.filter((b) => b.visible);
	const rangeStart = bandRange?.start ?? 0;
	const rangeEnd = bandRange?.end ?? visibleBands.length;
	const selectedBands = visibleBands.slice(rangeStart, rangeEnd);

	const flatBands = selectedBands.map((band) =>
		getFlatStripV2(band, { bandStyle: 'helical-right', pixelScale })
	);
	const alignedBands = alignBands(flatBands);

	const scale = pixelScale?.value || 1;
	const allQuads = alignedBands.map((band) => getQuadrilaterals(band, scale, band.sideOrientation));

	const bandPatterns = alignedBands.map((band, i) =>
		generateOutlinedBandPattern(
			band,
			rangeStart + i,
			config,
			pixelScale,
			address,
			allQuads[i],
			allQuads[i - 1],
			allQuads[i + 1]
		)
	);

	return {
		projectionType: 'patterned',
		address,
		bands: bandPatterns
	};
};

/**
 * Top-level entry for generating outlined projection patterns.
 */
export const generateOutlinedProjectionPattern = (
	tubes: Tube[],
	id: SuperGlobuleConfig['id'],
	config: OutlinedPatternConfig,
	pixelScale: PixelScale,
	projectionRange?: ProjectionRange
): SuperGlobuleProjectionPattern => {
	const [tubeStart, tubeEnd] = resolveRangeIndices(projectionRange?.tubes, tubes.length);

	const outputTubePatterns: TubeCutPattern[] = [];

	for (let t = tubeStart; t < tubeEnd; t++) {
		const { bands, address } = tubes[t];
		const totalBands = bands.filter((b) => b.visible).length;
		const [bandStart, bandEnd] = resolveRangeIndices(projectionRange?.bands, totalBands);

		const tubePattern = generateOutlinedTubePattern(address, bands, config, pixelScale, {
			start: bandStart,
			end: bandEnd
		});
		outputTubePatterns.push(tubePattern);
	}

	return {
		type: 'SuperGlobuleProjectionCutPattern',
		superGlobuleConfigId: id,
		projectionCutPattern: {
			address: { globule: tubes[0].address.globule },
			tubes: outputTubePatterns
		}
	};
};
