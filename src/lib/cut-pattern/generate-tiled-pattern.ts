import type {
	Band,
	BandAddressed,
	GeometryAddress,
	PathSegment,
	BandCutPattern,
	CutPattern,
	PixelScale,
	Point,
	Quadrilateral,
	TubeCutPattern,
	Facet,
	TagAnchor
} from '$lib/types';
import {
	getQuadrilaterals,
	getQuadrilateralTransformMatrix,
	transformPatternByQuad,
	transformPointByQuadrilateralTransform
} from '$lib/patterns/quadrilateral';
import type { BandCutPatternPattern, TiledPatternConfig, UnitPatternGenerator } from '$lib/types';
import { applyStrokeWidth, getFlatStripV2 } from './generate-cut-pattern';
import { resolvePatternEntry } from '$lib/patterns/resolve-pattern';
import { computeTiledLabelAngle } from './compute-tiled-label-angle';
import { getQuadWidth, svgPathStringFromSegments } from '$lib/patterns/utils';
import type {
	GlobuleAddress_Band,
	GlobuleAddress_FacetEdge,
	GlobuleAddress_Tube
} from '$lib/projection-geometry/types';
import {
	getAllTrianglePoints,
	getMinimalBoundingBoxAndRotationAngle
} from '../../components/cut-pattern/distrubute-panels';
import { Triangle, Vector3 } from 'three';
import { getBandTriangleEdges } from '$lib/projection-geometry/generate-projection';

/**
 * A band is an "edge" band when at least one of its facets' outer (side) edges has
 * no partner — i.e. one long side of the strip borders open space rather than an
 * adjacent band. Tubular tubes wrap around, so every band has partners on both
 * sides; surface-projection tubes are open, so their outermost bands have a free
 * side. Read straight from the 3D facet `meta` graph.
 *
 * Caveat: for projection geometry, `getFacetEdgeMeta` (generate-projection.ts)
 * sets the outer edge's `.partner` unconditionally via a plain modulo wrap over
 * band indices, with no check that the wrap is topologically real. So a `false`
 * result here does not prove the edge is genuinely shared — on a genuinely open
 * (non-wrapping) surface projection, the outermost band's free outer edge can
 * still report a partner. Globule tube facets now carry real partner meta too —
 * assigned by `matchGlobuleTubeFacets` (generate-projection.ts), invoked from
 * `generateGlobuleTube` (generate-shape.ts) — so they go through the same `?.`
 * chain as projection facets above rather than falling through it.
 */
const bandHasFreeSide = (band: Band): boolean => {
	const [evenEdges, oddEdges] = getBandTriangleEdges(band.orientation);
	return band.facets.some((facet, facetIndex) => {
		const outerEdge = (facetIndex % 2 === 0 ? evenEdges : oddEdges).outer;
		return !facet.meta?.[outerEdge]?.partner;
	});
};

/**
 * Real tube band index of the band on this band's LEFT side (unit x = 0 — the
 * neighbour the tesselation adjuster treats as `prev`), read from facet partner
 * meta. That is band b − 1, or — for band 0 of a wrapping tube — the tube's last
 * band. Undefined when the left side is free (band 0 of an open tube) or the
 * facets carry no address.
 *
 * Known limit: in a wrapping tube of exactly two bands, band 0's two neighbours
 * are the same band, so its left partner is not detected.
 */
export const getLeftPartnerBandIndex = (band: Band): number | undefined => {
	const own = band.facets.find((facet) => facet.address)?.address;
	if (!own) return undefined;
	const neighbours = new Set<number>();
	for (const facet of band.facets) {
		for (const edge of ['ab', 'bc', 'ac'] as const) {
			const partner = facet.meta?.[edge]?.partner;
			if (partner && partner.tube === own.tube && partner.band !== own.band) {
				neighbours.add(partner.band);
			}
		}
	}
	if (neighbours.has(own.band - 1)) return own.band - 1;
	return [...neighbours].find((n) => n > own.band + 1);
};

export const generateTubeCutPattern = ({
	address,
	bands,
	tiledPatternConfig,
	pixelScale,
	bandRange
}: {
	address: GlobuleAddress_Tube;
	bands: Band[];
	tiledPatternConfig: TiledPatternConfig;
	pixelScale: PixelScale;
	bandRange?: { start: number; end: number };
}): TubeCutPattern => {
	const tubeCutPattern: TubeCutPattern = { projectionType: 'patterned', address, bands: [] };

	const visibleBands = bands.filter((b) => b.visible);

	// Partner meta uses real tube band indices; BandCutPattern.address.band uses the
	// index among visible bands. Translate so leftPartnerBand matches address.band.
	const visibleIndexByReal = new Map(
		visibleBands.map((band, k) => [band.facets.find((f) => f.address)?.address?.band ?? k, k])
	);

	// Apply band range filtering if provided
	const rangeStart = bandRange?.start ?? 0;
	const rangeEnd = bandRange?.end ?? visibleBands.length;
	const selectedBands = visibleBands.slice(rangeStart, rangeEnd);

	const flatBands = selectedBands.map((band) =>
		getFlatStripV2(band, { bandStyle: 'helical-right', pixelScale })
	);
	const alignedBands = alignBands(flatBands);

	const quadBands = alignedBands.map((flatBand) =>
		getQuadrilaterals(flatBand, pixelScale.value, flatBand.sideOrientation)
	);

	const tiling = generateTiling({
		quadBands,
		bands: alignedBands,
		tiledPatternConfig,
		address,
		bandIndexOffset: rangeStart,
		totalBandCount: visibleBands.length,
		toVisibleBandIndex: (real: number) => visibleIndexByReal.get(real)
	});

	const refused = tiling.filter((band) => band.error);
	if (refused.length) {
		console.error(
			`${tiledPatternConfig.type}: ${refused.length} band(s) in tube ${address.tube} not patterned — ${refused[0].error}`
		);
	}

	// Return raw tiling - adjustAfterTiling and post-processing happen in generate-pattern.ts
	tubeCutPattern.bands = tiling;

	return tubeCutPattern;
};

export const applyTubePatternPostProcessing = (
	tubeCutPattern: TubeCutPattern,
	tiledPatternConfig: TiledPatternConfig
): TubeCutPattern => {
	let processedBands = tubeCutPattern.bands.map((band) => {
		const patternBand = {
			...band,
			facets: band.facets.map((facet) => {
				const segments = facet.path;
				if (facet.addenda) {
					const addendaSegments = facet.addenda.map((a) => a.path);
					segments.push(...facet.addenda.map((a) => a.path).flat());
				}
				return { ...facet, svgPath: svgPathStringFromSegments([...segments]) };
			})
		};
		patternBand.svgPath = patternBand.facets.map((facet) => facet.svgPath).join('\n');
		return patternBand;
	});

	processedBands = applyStrokeWidth(processedBands, tiledPatternConfig.config);

	return { ...tubeCutPattern, bands: processedBands };
};

export const generateTiledBandPattern = ({
	address,
	bands,
	tiledPatternConfig,
	pixelScale
}: {
	address: GeometryAddress<BandAddressed>;
	bands: Band[];
	tiledPatternConfig: TiledPatternConfig;
	pixelScale: PixelScale;
}): BandCutPatternPattern => {
	const pattern: BandCutPatternPattern = { projectionType: 'patterned', bands: [] };
	const { adjustAfterTiling } = resolvePatternEntry(tiledPatternConfig.type);
	// Creates a line pattern without inner and outer elements, appropriate for post processing in Affinity
	// TODO - see if it's possible to convert the output of this to "expanded path" (e.g. convert stroke widths to paths instead of doing so in Affinity)

	const visibleBands = bands.filter((b) => b.visible);
	const quadBands = visibleBands.map((band) => {
		const flatBand = getFlatStripV2(band, { bandStyle: 'helical-right', pixelScale });
		return getQuadrilaterals(flatBand, pixelScale.value);
	});

	const tiling = generateTiling({ quadBands, tiledPatternConfig, address });

	if (adjustAfterTiling) {
		const adjusted = adjustAfterTiling(tiling, tiledPatternConfig);
		pattern.bands = adjusted;
	} else {
		pattern.bands = tiling;
	}

	pattern.bands = pattern.bands.map((band) => ({
		...band,
		facets: band.facets.map((facet) => {
			const segments = facet.path;
			if (facet.addenda) {
				const addendaSegments = facet.addenda.map((a) => a.path);
				segments.push(...facet.addenda.map((a) => a.path).flat());
			}
			return { ...facet, svgPath: svgPathStringFromSegments([...segments]) };
		})
	}));

	return pattern as BandCutPatternPattern;
};

/**
 * Resolve a `tagAnchor.quadEdge` spec to a 2D point on the quad. The named edge
 * runs from its first vertex to its second (e.g. 'ab' is a → b); `position` is
 * either the string 'midPoint' (t = 0.5) or a ratio clamped to [0, 1].
 */
const anchorPointOnQuadEdge = (
	quad: Quadrilateral,
	quadEdge: NonNullable<TagAnchor['quadEdge']>
): Point => {
	const [fromKey, toKey] = quadEdge.edge.split('') as [keyof Quadrilateral, keyof Quadrilateral];
	const from = quad[fromKey];
	const to = quad[toKey];
	const t = quadEdge.position === 'midPoint' ? 0.5 : Math.max(0, Math.min(1, quadEdge.position));
	return {
		x: from.x + (to.x - from.x) * t,
		y: from.y + (to.y - from.y) * t
	};
};

export type GenerateTilingProps = {
	quadBands: Quadrilateral[][];
	bands: Band[];
	tiledPatternConfig: TiledPatternConfig;
	address: GlobuleAddress_Tube | GeometryAddress<BandAddressed>;
	bandIndexOffset?: number;
	/** Total number of visible bands in the tube (used to detect the last band). */
	totalBandCount?: number;
	/** Translate a real tube band index (facet meta) to this tiling's band index space. */
	toVisibleBandIndex?: (realBandIndex: number) => number | undefined;
};

export const generateTiling = ({
	quadBands,
	bands,
	tiledPatternConfig,
	address,
	bandIndexOffset = 0,
	totalBandCount,
	toVisibleBandIndex = (real: number) => real
}: GenerateTilingProps): BandCutPattern[] => {
	const bandCount = totalBandCount ?? quadBands.length;
	const tiling: {
		facets: CutPattern[];
		svgPath?: string | undefined;
		id: string;
		tagAnchorPoint: Point;
	}[] = quadBands.map((quadBand, bandIndex) => {
		const entry = resolvePatternEntry(tiledPatternConfig.type) as UnitPatternGenerator;
		const { getPattern, tagAnchor, adjustAfterMapping, getSubunitPatterns } = entry;
		const subunitCount = entry.subunitCount ?? 1;
		const globalBandIndex = bandIndex + bandIndexOffset;
		const { rowCount, columnCount, variant } = tiledPatternConfig.config;

		// The LAST band of a non-tubular (surface-projection) tube has no adjacent band
		// partner on its outer (w6) side, so it needs its own finished edge there.
		// Tubular tubes wrap around, so the last band DOES have a partner and must not
		// get the extra line. Distinguish the two by reading the partner meta: an "edge"
		// band has at least one facet whose outer (side) edge has no partner. (Band 0 is
		// also an edge band, but its free side is x=0, which is already finished by the
		// start/end verticals — the mirror only completes the w6 side.)
		// `bands` is absent on the `generateTiledBandPattern` call path; treat a
		// missing band as having a free side (no outer partner) rather than throwing.
		const sourceBand = bands?.[bandIndex];
		const hasFreeSide = sourceBand ? bandHasFreeSide(sourceBand) : true;
		const finishOuterEdge = bandIndex + bandIndexOffset === bandCount - 1 && hasFreeSide;
		const realLeftPartner = sourceBand ? getLeftPartnerBandIndex(sourceBand) : undefined;
		const leftPartnerBand =
			realLeftPartner === undefined ? undefined : toVisibleBandIndex(realLeftPartner);
		const bandContext = {
			hasOuterPartner: !hasFreeSide,
			bandIndex: bandIndex + bandIndexOffset,
			leftPartnerBand
		};

		if (quadBand.length % subunitCount !== 0) {
			// Match the type looseness of the address/bounds accesses on the normal
			// return path below (both pre-existing type gaps) rather than introducing
			// new svelte-check errors at this new call site.
			const tubeAddress = address as GlobuleAddress_Tube;
			return {
				facets: [],
				sideOrientation: bands[bandIndex].sideOrientation,
				svgPath: undefined,
				id: `${tiledPatternConfig.type}-band-${tubeAddress.globule}-${tubeAddress.tube}-${globalBandIndex}`,
				tagAnchorPoint: { x: 0, y: 0 },
				projectionType: 'patterned',
				address: { ...address, band: globalBandIndex },
				bounds: (bands[bandIndex] as unknown as { bounds?: BandCutPattern['bounds'] }).bounds,
				error: `${tiledPatternConfig.type} needs a quad count divisible by ${subunitCount} (got ${quadBand.length})`
			} as BandCutPattern;
		}

		let mappedPatternBand: PathSegment[][] | PathSegment[];
		if (tiledPatternConfig.tiling === 'quadrilateral') {
			const unitPattern = getPattern(
				rowCount || 1,
				columnCount || 1,
				undefined,
				variant,
				bands[bandIndex].sideOrientation,
				finishOuterEdge
			);
			// Check if unitPattern is PathSegment[] (not DynamicPathCollection)
			if (Array.isArray(unitPattern)) {
				const unitPatterns = getSubunitPatterns ? getSubunitPatterns(columnCount || 1) : [unitPattern];
				if (unitPatterns.length !== subunitCount) {
					throw new Error(
						`${tiledPatternConfig.type}: expected ${subunitCount} subunit patterns, got ${unitPatterns.length}`
					);
				}
				mappedPatternBand = quadBand.map((quad, i) =>
					transformPatternByQuad(unitPatterns[i % subunitCount], quad)
				) as PathSegment[][];
			} else {
				// unitPattern is DynamicPathCollection, use as-is
				mappedPatternBand = [getPattern(1, 1, quadBand)] as PathSegment[][];
			}
			// } else if (tiledPatternConfig.tiling === 'triangle') {

			// 	const unitPattern = getPattern(
			// 		rowCount as 3 | 1 | 2,
			// 		columnCount as 1 | 2 | 3 | 4 | 5,
			// 		undefined,
			// 		variant
			// 	);
		} else {
			mappedPatternBand = [getPattern(1, 1, quadBand)] as PathSegment[][];
		}

		let adjustedPatternBand: PathSegment[][];

		if (adjustAfterMapping) {
			adjustedPatternBand = adjustAfterMapping(
				mappedPatternBand,
				quadBand,
				tiledPatternConfig,
				finishOuterEdge,
				bandContext
			);
		} else {
			adjustedPatternBand = mappedPatternBand;
		}
		const tagAnchorPoint = { x: 0, y: 0 };
		// Quad on the anchor facet — captured alongside the anchor point so the
		// label angle can be derived from the quad edge nearest that anchor.
		let tagAnchorQuad: Quadrilateral | undefined;

		const band = bands[bandIndex];
		const edges = getBandTriangleEdges(band.orientation);
		const startPartner: GlobuleAddress_FacetEdge | undefined =
			band.facets[0].meta?.[edges[0].base]?.partner;
		const endPartner: GlobuleAddress_FacetEdge | undefined =
			band.facets[band.facets.length - 1].meta?.[edges[1].second]?.partner;
		const startPartnerBand: GlobuleAddress_Band | undefined = startPartner
			? {
					globule: startPartner.globule,
					tube: startPartner.tube,
					band: startPartner.band
				}
			: undefined;
		const endPartnerBand: GlobuleAddress_Band | undefined = endPartner
			? { globule: endPartner.globule, tube: endPartner.tube, band: endPartner.band }
			: undefined;

		const cuttablePattern: CutPattern[] = adjustedPatternBand.map((facet, facetIndex) => {
			const quad = structuredClone(quadBand[facetIndex % quadBand.length]);
			if (tagAnchor && tagAnchor.facetIndex === facetIndex) {
				if (tagAnchor.quadEdge) {
					// Anchor on a named quad edge at a ratio between its vertices.
					// Takes precedence over `anchorUnitPoint`/`segmentIndex` so it
					// works uniformly for any tiled pattern regardless of path order.
					const anchor = anchorPointOnQuadEdge(quad, tagAnchor.quadEdge);
					tagAnchorPoint.x = anchor.x;
					tagAnchorPoint.y = anchor.y;
					tagAnchorQuad = quad;
				} else if (tagAnchor.anchorUnitPoint) {
					// Geometric anchor: map a fixed point in the unit-pattern's
					// coordinate space through this facet's quad. This lands on the
					// intended vertex (e.g. a pattern convergence junction) regardless
					// of how `endsTrimmed`/`rowCount`/segment order shuffle the path
					// array — unlike `segmentIndex`, which indexes into the mutated
					// path and drifts off the junction when segments are trimmed.
					const rows = tiledPatternConfig.config.rowCount || 1;
					const columns = tiledPatternConfig.config.columnCount || 1;
					const unitPoint =
						typeof tagAnchor.anchorUnitPoint === 'function'
							? tagAnchor.anchorUnitPoint(rows, columns)
							: tagAnchor.anchorUnitPoint;
					// Use the original (un-cloned) quad here: `structuredClone` strips
					// the Vector3 prototype, and getQuadrilateralTransformMatrix relies
					// on Vector3.clone()/.sub().
					const sourceQuad = quadBand[facetIndex % quadBand.length];
					const mapped = transformPointByQuadrilateralTransform(
						unitPoint,
						getQuadrilateralTransformMatrix(sourceQuad),
						sourceQuad.a
					);
					tagAnchorPoint.x = mapped.x;
					tagAnchorPoint.y = mapped.y;
					tagAnchorQuad = quad;
				} else if (tagAnchor.segmentIndex !== undefined) {
					const facetPathSegment = facet[(facet.length + tagAnchor.segmentIndex) % facet.length];
					if (Array.isArray(facetPathSegment) && facetPathSegment.length >= 2) {
						tagAnchorPoint.x = facetPathSegment[1] || 0;
						tagAnchorPoint.y = facetPathSegment[2] || 0;
						tagAnchorQuad = quad;
					}
				}
			}
			const quadWidth = getQuadWidth(quad);

			const cuttable: CutPattern = {
				// TODO - rescale this based on selected real units
				path: facet,
				triangle: undefined,
				triangles: [
					bands[bandIndex].facets[facetIndex * 2].triangle.clone(),
					bands[bandIndex].facets[facetIndex * 2 + 1].triangle.clone()
				],
				quad,
				quadWidth,
				label: 'test label' //`${formatAddress(address)}: ${facetIndex}`
			};

			return cuttable;
		});

		const result: BandCutPattern = {
			facets: cuttablePattern,
			sideOrientation: bands[bandIndex].sideOrientation,
			svgPath: undefined, //cuttablePattern.map((p) => p.svgPath).join(),
			id: `${tiledPatternConfig.type}-band-${address.globule}-${address.tube}-${globalBandIndex}`,
			tagAnchorPoint,
			// Orient the label relative to the quad edge nearest the anchor: text
			// parallel to that edge, stem perpendicular. `tagAngle` is then applied
			// as a relative offset on top of this auto angle (see PatternLabel).
			tagAnchorAutoAngle: tagAnchorQuad
				? computeTiledLabelAngle(tagAnchorPoint, tagAnchorQuad)
				: undefined,
			tagAngle: tiledPatternConfig.labels?.selfTag?.angle ?? tagAnchor?.angle ?? 0,
			projectionType: 'patterned',
			address: { ...address, band: globalBandIndex },
			bounds: bands[bandIndex].bounds,
			meta: startPartnerBand && endPartnerBand ? { startPartnerBand, endPartnerBand } : undefined,
			leftPartnerBand
		};
		return result;
	});
	return tiling;
};

export const alignBands = (bands: Band[]) => {
	return bands.map((originalBand, bandIndex) => {
		const points = getAllTrianglePoints(originalBand);
		const bounds = getMinimalBoundingBoxAndRotationAngle(points);
		// TODO - make bounds a part of the type Band
		const realignedBand = reAlignBand(originalBand, bounds.rotatedCoordinates);
		realignedBand.bounds = getSimpleBounds(realignedBand);
		if (realignedBand.bounds.left !== 0 || realignedBand.bounds.top !== 0) {
			return normalizeBand(realignedBand);
		}
		return realignedBand;
	});
};

export const normalizeBand = (band: Band): Band => {
	const anchor = new Vector3(band.bounds?.left || 0, band.bounds?.top || 0, 0);
	const newFacets = band.facets.map((facet) => {
		return {
			...facet,
			triangle: new Triangle(
				facet.triangle.a.clone().sub(anchor),
				facet.triangle.b.clone().sub(anchor),
				facet.triangle.c.clone().sub(anchor)
			)
		};
	});
	const newBand: Band = {
		...band,
		facets: newFacets
	};
	const newBounds = getSimpleBounds(newBand);
	newBand.bounds = newBounds;

	return newBand;
};

const reAlignBand = (band: Band, rotatedCoordinates: { x: number; y: number }[]): Band => {
	const newBand = {
		...band,
		facets: band.facets.map((facet, index) => {
			return {
				...facet,
				triangle: new Triangle(
					new Vector3(rotatedCoordinates[index * 3].x, rotatedCoordinates[index * 3].y, 0),
					new Vector3(rotatedCoordinates[index * 3 + 1].x, rotatedCoordinates[index * 3 + 1].y, 0),
					new Vector3(rotatedCoordinates[index * 3 + 2].x, rotatedCoordinates[index * 3 + 2].y, 0)
				)
			};
		})
	};
	const isAscending =
		newBand.facets[0].triangle.a.y < newBand.facets[newBand.facets.length - 1].triangle.a.y;
	if (isAscending) {
		newBand.facets = rotateFacets(newBand.facets, Math.PI);
	}
	return newBand;
};

const rotateFacets = (facets: Band['facets'], angle: number) => {
	return facets.map((facet: Facet) => {
		return {
			...facet,
			triangle: new Triangle(
				facet.triangle.a.clone().applyAxisAngle(Z_AXIS, angle),
				facet.triangle.b.clone().applyAxisAngle(Z_AXIS, angle),
				facet.triangle.c.clone().applyAxisAngle(Z_AXIS, angle)
			)
		};
	});
};

const Z_AXIS = new Vector3(0, 0, 1);

const getSimpleBounds = (
	band: Band
): { left: number; top: number; width: number; height: number; center: Vector3 } => {
	const points = getAllTrianglePoints(band);
	const xValues = points.map((point) => point.x);
	const yValues = points.map((point) => point.y);
	const minX = Math.min(...xValues);
	const maxX = Math.max(...xValues);
	const minY = Math.min(...yValues);
	const maxY = Math.max(...yValues);
	const width = maxX - minX;
	const height = maxY - minY;
	const center = new Vector3(minX + width / 2, minY + height / 2, 0);
	return { left: minX, top: minY, width, height, center };
};
