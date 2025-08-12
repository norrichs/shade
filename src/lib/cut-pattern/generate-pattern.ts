import type {
	ProjectionAddress_Band,
	ProjectionAddress_Facet,
	ProjectionAddress_FacetEdge,
	TriangleEdge,
	Tube
} from '$lib/projection-geometry/types';
import type {
	Band,
	BandAddressed,
	BandPanelPattern,
	FacetEdgeMeta,
	FacetOrientation,
	GeometryAddress,
	Globule,
	GlobulePatternConfig,
	PanelBase,
	PanelEdgeMeta,
	PanelPattern,
	PathSegment,
	PatternedBandPattern,
	ProjectionPanelPattern,
	SubGlobule,
	SubGlobuleConfig,
	SuperGlobule,
	SuperGlobuleConfig,
	TiledPatternConfig,
	TrianglePoint,
	TubePanelPattern
} from '$lib/types';
import { Plane, Triangle, Vector3 } from 'three';
import { applyStrokeWidth } from './cut-pattern';
import { generateTiledBandPattern } from './generate-tiled-pattern';
import { getEdgeMatchedTriangles } from '$lib/projection-geometry/generate-projection';
import { svgPathStringFromSegments } from '$lib/patterns/utils';
import { formatAngle } from '$lib/util';
import type { SuperGlobuleBandPattern, SuperGlobuleProjectionPattern } from '$lib/stores';

type PatternGlobule = {
	globules: Globule[];
	config: SubGlobuleConfig;
};

export const generateSuperGlobulePattern = (
	superGlobule: SuperGlobule,
	superGlobuleConfig: SuperGlobuleConfig,
	globulePatternConfig: GlobulePatternConfig
): SuperGlobuleBandPattern => {
	console.debug(' -- generateSuperGlobulePattern');
	const patternGlobules: PatternGlobule[] = superGlobule.subGlobules.map(
		(subGlobule: SubGlobule) => {
			const config = superGlobuleConfig.subGlobuleConfigs.find(
				(subGlobuleConfig) => subGlobuleConfig.id === subGlobule.subGlobuleConfigId
			);
			if (!config) {
				throw new Error('missing config');
			}
			return { globules: subGlobule.data.filter((globule: Globule) => globule.visible), config };
		}
	);

	const collectedBandPatterns: PatternedBandPattern[] = patternGlobules
		.map(({ globules }: { globules: Globule[] }) => {
			const bandPatterns = globules.map(({ data: { bands }, address }, bandIndex) => {
				let pattern: PatternedBandPattern;
				const {
					tiledPatternConfig,
					patternConfig: { pixelScale }
				} = globulePatternConfig;
				pattern = generateTiledBandPattern({
					address: { ...address, b: bandIndex },
					bands: bands.filter((b) => b.visible),
					tiledPatternConfig,
					pixelScale
				});
				pattern = {
					...pattern,
					bands: pattern.bands.map((band) => ({ ...band, projectionType: pattern.projectionType }))
				};
				pattern = applyStrokeWidth(pattern, tiledPatternConfig.config);
				return pattern;
			});
			return bandPatterns;
		})
		.flat();

	const bandPatterns = collectedBandPatterns
		.map((globulePattern: PatternedBandPattern) => globulePattern.bands)
		.flat();

	return {
		type: 'SuperGlobulePattern',
		superGlobuleConfigId: superGlobuleConfig.id,
		bandPatterns
	};
};

// TODO: Refactor this to accept range and existing pattern arguments, so that
//       it is possible to do granular updates

export const generateProjectionPattern = (
	tubes: Tube[],
	id: SuperGlobuleConfig['id'],
	globulePatternConfig: GlobulePatternConfig,
	// existingPattern?: { tubes: { bands: { panels: PanelPattern[] } } },
	range?: {
		tubes: { start: number; end: number };
		bands: { start: number; end: number };
		panels: { start: number; end: number };
	}
): SuperGlobuleProjectionPattern => {
	const dummyAddress: GeometryAddress<BandAddressed> = { s: 0, g: [0], b: 0 };
	const patterns: PatternedBandPattern[] = [];
	const {
		tiledPatternConfig,
		patternConfig: { pixelScale }
	} = globulePatternConfig;
	if (shouldUsePanelPattern(tiledPatternConfig)) {
		console.debug('use tiled panel pattern');
		const projectionPanelPattern = generateProjectionPanelPattern({
			tubes,
			range
		});
		return {
			type: 'SuperGlobuleProjectionPanelPattern',
			superGlobuleConfigId: id,
			projectionPanelPattern
		};
	} else {
		tubes.forEach(({ bands }) => {
			console.debug('use tiled band pattern');
			let pattern: PatternedBandPattern = generateTiledBandPattern({
				address: dummyAddress,
				bands,
				tiledPatternConfig,
				pixelScale
			});
			pattern = {
				...pattern,
				bands: pattern.bands.map((band) => ({ ...band, projectionType: pattern.projectionType }))
			};
			pattern = applyStrokeWidth(pattern, tiledPatternConfig.config);
			patterns.push(pattern);
		});
		const bandPatterns = patterns.map((pattern: PatternedBandPattern) => pattern.bands).flat();

		return {
			type: 'SuperGlobuleProjectionBandPattern',
			superGlobuleConfigId: id,
			bandPatterns
		};
	}
};

const shouldUsePanelPattern = ({ type, tiling }: TiledPatternConfig) => {
	return tiling === 'triangle' && ['tiledPanelPattern-0'].includes(type);
};

const generateProjectionPanelPattern = ({
	tubes,
	// superGlobuleConfig,
	// globulePatternConfig,
	existingPattern,
	range
}: {
	tubes: Tube[];
	// superGlobuleConfig: SuperGlobuleConfig;
	// globulePatternConfig: GlobulePatternConfig;
	existingPattern?: ProjectionPanelPattern;
	range?: {
		tubes?: { start: number; end: number };
		bands?: { start: number; end: number };
		panels?: { start: number; end: number };
	};
}): ProjectionPanelPattern => {
	const pattern: ProjectionPanelPattern = {
		address: { projection: tubes[0].address.projection },
		tubes: []
	};
	console.debug('generateProjectionPanelPattern', { tubes, range });
	const PANEl_OFFSET = -10;

	const tubeStart = range?.tubes?.start || 0;
	const tubeEnd = range?.tubes?.end || tubes.length;

	for (let t = tubeStart; t < tubeEnd; t++) {
		const tube = tubes[t];
		const bandStart = range?.bands?.start || 0;
		const bandEnd = range?.bands?.end || tube.bands.length;
		const tubePattern: TubePanelPattern = { address: { ...tube.address }, bands: [] };
		for (let b = bandStart; b < bandEnd; b++) {
			const band = tube.bands[b];
			const panelStart = range?.panels?.start || 0;
			const panelEnd = range?.panels?.end || band.facets.length;

			const bandBasePoints = getBandBasePoints(band);
			const bandPattern: BandPanelPattern = {
				address: band.address
					? ({ ...band.address } as ProjectionAddress_Band)
					: ({
							projection: band.facets[0].address?.projection,
							tube: band.facets[0].address?.tube,
							band: band.facets[0].address?.band
					  } as ProjectionAddress_Band),
				panels: []
			};
			for (let p = panelStart; p < panelEnd; p++) {
				let base: PanelBase;
				const thisBasePoints = bandBasePoints[p % 2];
				if (p === 0) {
					base = {
						...thisBasePoints,
						v0: new Vector3(0, 0, 0),
						v1: new Vector3(1, 0, 0)
					};
				} else {
					const [p0, p1] = [
						bandPattern.panels[p - 1].triangle[thisBasePoints.p1],
						bandPattern.panels[p - 1].triangle[thisBasePoints.p0]
					];
					const offset = p1
						.clone()
						.addScaledVector(p0, -1)
						.applyAxisAngle(new Vector3(0, 0, 1), Math.PI / 2)
						.setLength(PANEl_OFFSET);
					base = {
						...thisBasePoints,
						v0: new Vector3(p0.x + offset.x, p0.y + offset.y, 0),
						v1: new Vector3(p1.x + offset.x, p1.y + offset.y, 0)
					};
				}

				const facetAddress: ProjectionAddress_Facet = { ...tube.address, band: b, facet: p };
				bandPattern.panels.push(
					generatePanelPattern({
						base,
						address: facetAddress,
						tubes
					})
				);
			}
			tubePattern.bands.push(bandPattern);
		}
		pattern.tubes.push(tubePattern);
	}
	return pattern;
};

const EDGE_MAP: { [key: string]: { p0: 'a' | 'b' | 'c'; p1: 'a' | 'b' | 'c' } } = {
	ab: { p0: 'a', p1: 'b' },
	bc: { p0: 'b', p1: 'c' },
	ac: { p0: 'a', p1: 'c' }
};

const edgeMapper = (edge: TriangleEdge) => {
	return EDGE_MAP[edge];
};

const BAND_BASE_MAP: { [key: string]: [TriangleEdge, TriangleEdge] } = {
	ac: ['ab', 'bc'],
	ab: ['bc', 'ac'],
	bc: ['ab', 'ac']
};

const getBandBasePoints = (
	band: Band
): [{ p0: TrianglePoint; p1: TrianglePoint }, { p0: TrianglePoint; p1: TrianglePoint }] => {
	const firstEdgeMatch = getEdgeMatchedTriangles(band.facets[0].triangle, band.facets[1].triangle);
	const secondEdgeMatch = getEdgeMatchedTriangles(band.facets[1].triangle, band.facets[2].triangle);

	if (firstEdgeMatch === false || secondEdgeMatch === false)
		throw Error('a set of triangles has no matching edges');

	const invalid =
		firstEdgeMatch.t0[0] !== firstEdgeMatch.t1[1] || firstEdgeMatch.t0[1] !== firstEdgeMatch.t1[0];
	secondEdgeMatch.t0[0] !== secondEdgeMatch.t1[1] ||
		secondEdgeMatch.t0[1] !== secondEdgeMatch.t1[0];
	if (invalid)
		throw Error(
			`getBandBasedEdges - edge matching invalid - ${firstEdgeMatch?.t0}, ${firstEdgeMatch?.t1}, ${secondEdgeMatch?.t0}, ${secondEdgeMatch?.t1}`
		);

	const firstTriangleEdge = edgeMapper(secondEdgeMatch.t0);
	const secondTriangleEdge = edgeMapper(firstEdgeMatch.t0);

	return [firstTriangleEdge, secondTriangleEdge];
};

const bandBaseMapper = (edge: TriangleEdge) => {
	return BAND_BASE_MAP[edge];
};

const generatePanelPattern = ({
	address,
	tubes,
	base
}: {
	address: ProjectionAddress_Facet;
	tubes: Tube[];
	base: PanelBase;
}): PanelPattern => {
	const { triangle } = getFacet(tubes, address);

	const flatTriangle = getFlatTriangle({ triangle, base });
	// TODO: map a pattern to the triangle here
	const { a, b, c } = flatTriangle;
	const path = [['M', a.x, a.y], ['L', b.x, b.y], ['L', c.x, c.y], ['Z']] as PathSegment[];

	const panel: PanelPattern = {
		path,
		tiling: 'triangle',
		svgPath: svgPathStringFromSegments(path),
		triangle: flatTriangle,
		address,
		meta: {
			edges: getPanelEdgeMeta(address, tubes)
		}
	};
	return panel;
};

export const getPanelEdgeMeta = (
	address: ProjectionAddress_Facet,
	tubes: Tube[],
	debug?: boolean
): PanelPattern['meta']['edges'] => {
	const tube = tubes[address.tube];
	const bandCount = tube.bands.length;
	const band = tube.bands[address.band];
	const facetCount = band.facets.length;

	let edgeMeta = { ab: {}, bc: {}, ac: {} } as PanelPattern['meta']['edges'];

	const f = address.facet;
	const b = address.band;
	let self, partner;

	const isFirstFacet = f === 0;
	const isLastFacet = f === facetCount - 1;
	const facet = band.facets[f];
	const orientation =
		typeof facet.orientation === 'undefined' ? band.orientation : facet.orientation;

	// TODO: update this so that it takes into account the facet orientation

	const edges: { [key: string]: TriangleEdge } = {
		base: getEdge('base', f, orientation),
		second: getEdge('second', f, orientation),
		outer: getEdge('outer', f, orientation)
	};

	if (isFirstFacet) {
		if (!facet.meta) throw Error('end facet should already have end partner in meta');
		edgeMeta[edges.base].partner = { ...facet.meta[edges.base].partner };
		edgeMeta[edges.second].partner = { ...address, facet: f + 1, edge: edges.second };
		edgeMeta[edges.outer].partner = {
			...address,
			band: (b - 1 + bandCount) % bandCount,
			facet: f + 1,
			edge: edges.outer
		};
	} else if (isLastFacet) {
		if (!facet.meta) throw Error('end facet should already have end partner in meta');
		edgeMeta[edges.second].partner = { ...facet.meta[edges.second].partner };
		edgeMeta[edges.base].partner = { ...address, facet: f - 1, edge: edges.base };
		edgeMeta[edges.outer].partner = {
			...address,
			band: (b + 1) % bandCount,
			facet: f - 1,
			edge: edges.outer
		};
	} else if (f % 2 === 0) {
		edgeMeta[edges.base].partner = {
			...address,
			facet: f - 1,
			edge: edges.base
		};
		edgeMeta[edges.second].partner = {
			...address,
			facet: f + 1,
			edge: edges.second
		};
		edgeMeta[edges.outer].partner = {
			...address,
			band: (b - 1 + bandCount) % bandCount,
			facet: f + 1,
			edge: edges.outer
		};
	} else {
		edgeMeta[edges.base].partner = {
			...address,
			facet: f - 1,
			edge: edges.base
		};
		edgeMeta[edges.second].partner = {
			...address,
			facet: f + 1,
			edge: edges.second
		};
		edgeMeta[edges.outer].partner = {
			...address,
			band: (b + 1) % bandCount,
			facet: f - 1,
			edge: edges.outer
		};
	}

	// Get cutAngles for all facets
	edgeMeta = Object.fromEntries(
		Object.entries(edgeMeta).map(([key, value]) => {
			const pAddress = { ...value.partner, edge: corrected(value.partner.edge) };
			const partnerFacet = tubes[pAddress.tube].bands[pAddress.band].facets[pAddress.facet];

			const { angle, isConcave, dihedral } = getCutAngle(
				facet.triangle,
				partnerFacet.triangle,
				pAddress.edge,
				debug
			);

			const newValue: PanelEdgeMeta = {
				partner: pAddress,
				cutAngle: angle,
				crease: isConcave ? 'valley' : 'mountain'
			};
			return [key, newValue];
		})
	) as { ab: PanelEdgeMeta; bc: PanelEdgeMeta; ac: PanelEdgeMeta };
	return edgeMeta;
};

const TRIANGLE_POINT_MAP = {
	'edge-order': {
		ab: ['a', 'b'],
		bc: ['b', 'c'],
		ac: ['a', 'c'],
		ba: ['a', 'b'],
		cb: ['b', 'c'],
		ca: ['a', 'c']
	},
	'triangle-order': {
		ab: ['a', 'b'],
		bc: ['b', 'c'],
		ac: ['c', 'a'],
		ba: ['a', 'b'],
		cb: ['b', 'c'],
		ca: ['c', 'a']
	}
};

export const getTrianglePointFromTriangleEdge = (
	edge: TriangleEdge,
	ordering: 'edge-order' | 'triangle-order'
) => {
	return TRIANGLE_POINT_MAP[ordering][edge] as [TrianglePoint, TrianglePoint];
};

export const getOtherTrianglePointFromTriangleEdge = (edge: TriangleEdge): TrianglePoint => {
	const otherPoints: { [key: string]: TrianglePoint } = {
		ab: 'c',
		bc: 'a',
		ac: 'b',
		ba: 'c',
		cb: 'a',
		ca: 'b'
	};
	return otherPoints[edge];
};

const getCutAngle = (
	t0: Triangle,
	t1: Triangle,
	edge: TriangleEdge,
	debug: boolean | string = false
) => {
	const n0 = new Vector3();
	const n1 = new Vector3();
	t0.getNormal(n0);
	t1.getNormal(n1);
	const [p0, p1] = getTrianglePointFromTriangleEdge(edge, 'triangle-order');
	const commonVector = t0[p1].clone().addScaledVector(t0[p0], -1).normalize();
	// const dihedral = n0.angleTo(n1);
	const dihedral = getDihedral(t0, t1, edge);

	// Dihedral angles can get screwed up if normals of adjacent triangles are facing opposite directions (e.g. we get 185 degrees instead of 5 degrees).
	// May need to correct or not rely on  threejs normal calc
	// Concavity test is also not reliable for some reason

	// 1) calculated dihedral from scratch, without normals
	// 2) if the outside point needs to rotate counter clockwise to meet other outside, it is positive
	// Can we test that with the following?
	//
	// For t0 (a0 b c), t1 (a1 c b)
	// 1) get vector from b to a0
	// 2) rotated = rotate around vector b to c
	// 3) get plane defined by t1.normal
	// 4) test = b.addScaledVector(rotated, 1)
	// 5) get distance from plane to test
	// 6) if distance is < precision (1/10000?), concave (or convex, not sure), else the other
	const p2 = getOtherTrianglePointFromTriangleEdge(edge);

	const p0p2Vector = t0[p2].clone().addScaledVector(t0[p0], -1);
	p0p2Vector.applyAxisAngle(commonVector, dihedral);
	const rotatedTestPoint = t0[p0].clone().addScaledVector(p0p2Vector, 1);
	const t1Plane = new Plane();
	t1Plane.setFromCoplanarPoints(t1.a, t1.b, t1.c);
	const distance = t1Plane.distanceToPoint(rotatedTestPoint);
	const PRECISION = 1 / 100000;

	const isConcave = Math.abs(distance) < PRECISION;

	const angle = isConcave ? (Math.PI - dihedral) / -2 : (Math.PI - dihedral) / 2;
	return { angle, isConcave, dihedral };
};

const getDihedral = (t0: Triangle, t1: Triangle, edge: TriangleEdge) => {
	const [p0, p1] = getTrianglePointFromTriangleEdge(edge, 'triangle-order');
	const p2 = getOtherTrianglePointFromTriangleEdge(edge);

	const P = t0[p0].clone();
	const b0 = t0[p1].clone().addScaledVector(P, -1);
	const b1 = t0[p2].clone().addScaledVector(P, -1);
	const b2 = t1[p2].clone().addScaledVector(P, -1);

	const cross1 = new Vector3();
	const cross2 = new Vector3();

	cross1.crossVectors(b0, b1);
	cross2.crossVectors(b0, b2);

	const dihedral = Math.acos(cross1.dot(cross2) / (cross1.length() * cross2.length()));
	return dihedral;
};

export const corrected = (s: string): TriangleEdge => {
	if (s === 'ba') return 'ab';
	if (s === 'ca') return 'ac';
	if (s === 'cb') return 'bc';
	return s as TriangleEdge;
};

const getEdgeFromBase = ({ p0, p1 }: PanelBase) => {
	if (p0 === 'a') {
		return p1 === 'b' ? 'ab' : 'ac';
	}
	if (p1 === 'a') {
		return p0 === 'b' ? 'ab' : 'ac';
	}
	return 'bc';
};
// need to take into account triangle orientation
// we could test if non-base vertex is the same as facet[f+2].p0 or p1
// it would be better to set orientation as a facet property, which would help enable dynamic orientations

const edgeMap: { [key: string]: { [key: string]: { [key: string]: TriangleEdge } } } = {
	'axial-right': {
		even: {
			base: 'ab',
			second: 'bc',
			outer: 'ac'
		},
		odd: {
			base: 'bc',
			second: 'ab',
			outer: 'ac'
		}
	},
	circumferential: {
		even: {
			base: 'ac',
			second: 'bc',
			outer: 'ab'
		},
		odd: {
			base: 'bc',
			second: 'ac',
			outer: 'ab'
		}
	},
	'axial-left': {
		even: {
			base: 'ab',
			second: 'ac',
			outer: 'bc'
		},
		odd: {
			base: 'ac',
			second: 'ab',
			outer: 'bc'
		}
	}
};

const getEdge = (
	edgeType: 'base' | 'second' | 'outer',
	parity: 'odd' | 'even' | number,
	orientation: FacetOrientation
) => {
	const p = typeof parity === 'number' ? (parity % 2 === 0 ? 'even' : 'odd') : parity;
	return edgeMap[orientation.toString()][p][edgeType];
};

const getFacet = (
	tubes: Tube[],
	address: ProjectionAddress_Facet | ProjectionAddress_FacetEdge
) => {
	return tubes[address.tube].bands[address.band].facets[address.facet];
};

const getFlatTriangle = ({ triangle, base }: { triangle: Triangle; base: PanelBase }) => {
	const { p0, p1 } = base;
	const p2 = ['a', 'b', 'c'].find((char) => char !== p0 && char !== p1) as
		| TrianglePoint
		| undefined;

	if (p2 === undefined) throw new Error('missing third triangle vector');

	const baseTriangleVector = triangle[p1].clone().addScaledVector(triangle[p0], -1);
	const secondTriangleVector = triangle[p2].clone().addScaledVector(triangle[p0], -1);
	const angle = baseTriangleVector.angleTo(secondTriangleVector);

	const flat = {
		a: new Vector3(),
		b: new Vector3(),
		c: new Vector3()
	};

	flat[p0].copy(base.v0);

	const baseSideLength = baseTriangleVector.length();
	const secondSideLength = secondTriangleVector.length();

	const baseVector = base.v1.clone().addScaledVector(base.v0, -1).setLength(baseSideLength);
	flat[p1].copy(flat[p0]).addScaledVector(baseVector, 1);

	const secondVector = flat[p1]
		.clone()
		.addScaledVector(flat[p0], -1)
		.applyAxisAngle(new Vector3(0, 0, 1), -angle)
		.setLength(secondSideLength);

	flat[p2].copy(flat[p0]).addScaledVector(secondVector, 1);
	const flatTriangle = new Triangle();
	flatTriangle[p0] = flat[p0];
	flatTriangle[p1] = flat[p1];
	flatTriangle[p2] = flat[p2];

	return flatTriangle;
};

export const validateAllPanels = (tubes: TubePanelPattern[]) => {
	console.debug('-------------------- validateAllPanels ----------------------');
	tubes.forEach((tube) => {
		tube.bands.forEach((band) => {
			band.panels.forEach((panel) => {
				(['ab', 'bc', 'ac'] as TriangleEdge[]).forEach((edge) =>
					validateEdgeMeta({
						edge,
						edgeMeta: panel.meta.edges[edge],
						panelAddress: panel.address,
						tubes
					})
				);
			});
		});
	});
};

const validateEdgeMeta = ({
	edge,
	panelAddress,
	edgeMeta,
	tubes,
	cutAnglePrecision = 1 / 1000000
}: {
	edge: TriangleEdge;
	panelAddress: ProjectionAddress_Facet;
	edgeMeta: PanelEdgeMeta;
	tubes: TubePanelPattern[];
	cutAnglePrecision?: number;
}) => {
	const pA = edgeMeta.partner;
	const partnerMeta = tubes[pA.tube].bands[pA.band].panels[pA.facet].meta.edges[edge];

	const isCreaseMatched = partnerMeta.crease === edgeMeta.crease;
	const isCutAngleMatched = Math.abs(partnerMeta.cutAngle - edgeMeta.cutAngle) < cutAnglePrecision;

	if (!isCreaseMatched || !isCutAngleMatched) {
		console.debug({ partnerMeta, edgeMeta, panelAddress, partnerAddress: pA });
		throw Error('partner cut does not match');
	}
};
