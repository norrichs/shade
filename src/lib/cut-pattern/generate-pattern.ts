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
	Crease,
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
import { getEdge, getEdgeMatchedTriangles } from '$lib/projection-geometry/generate-projection';
import { svgPathStringFromSegments } from '$lib/patterns/utils';
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
	range
}: {
	tubes: Tube[];

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
			if (t === 0 && b === 0) {
				console.debug({ bandBasePoints });
			}
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

export const getBandBasePoints = (
	band: Band
): [{ p0: TrianglePoint; p1: TrianglePoint }, { p0: TrianglePoint; p1: TrianglePoint }] => {
	const base0 = getTrianglePointFromTriangleEdge(
		getEdge('base', 'even', band.orientation),
		'triangle-order'
	);
	const base1 = getTrianglePointFromTriangleEdge(
		getEdge('base', 'odd', band.orientation),
		'triangle-order'
	);

	return [
		{ p0: base0[0], p1: base0[1] },
		{ p0: base1[0], p1: base1[1] }
	] as [{ p0: TrianglePoint; p1: TrianglePoint }, { p0: TrianglePoint; p1: TrianglePoint }];
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
	tubes: Tube[]
): PanelPattern['meta']['edges'] => {
	const tube = tubes[address.tube];
	const band = tube.bands[address.band];

	const f = address.facet;

	const facet = band.facets[f];

	const edgeMeta = Object.fromEntries(
		(['ab', 'bc', 'ac'] as TriangleEdge[]).map((edge) => {
			if (!facet.meta || !facet.meta[edge]) throw Error('facet edge missing meta');

			const { partner } = facet.meta[edge];
			const partnerFacet = tubes[partner.tube].bands[partner.band].facets[partner.facet];

			// console.debug('  -- getPanelEdgeMeta', { edge, address, partner });
			const { cutAngle, crease } = getCutAngle(
				facet.triangle,
				partnerFacet.triangle,
				edge,
				partner.edge,
				{ ...address, edge },
				partner
			);

			const panelEdgeMeta: PanelEdgeMeta = {
				partner,
				cutAngle,
				crease
			};
			return [edge, panelEdgeMeta];
		})
	);
	return edgeMeta as { ab: PanelEdgeMeta; bc: PanelEdgeMeta; ac: PanelEdgeMeta };
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
	edge0: TriangleEdge,
	edge1: TriangleEdge,
	address0?: ProjectionAddress_FacetEdge,
	address1?: ProjectionAddress_FacetEdge
): { cutAngle: number; crease: Crease } => {
	const n0 = new Vector3();
	const n1 = new Vector3();
	t0.getNormal(n0);
	t1.getNormal(n1);
	const [p0, p1] = getTrianglePointFromTriangleEdge(edge0, 'triangle-order');
	const commonVector = t0[p1].clone().addScaledVector(t0[p0], -1).normalize();
	// const dihedral = n0.angleTo(n1);
	const dihedral = getDihedral(t0, t1, edge0, edge1);

	const p2 = getOtherTrianglePointFromTriangleEdge(edge0);

	const p0p2Vector = t0[p2].clone().addScaledVector(t0[p0], -1);
	p0p2Vector.applyAxisAngle(commonVector, dihedral);
	const rotatedTestPoint = t0[p0].clone().addScaledVector(p0p2Vector, 1);
	const t1Plane = new Plane();
	t1Plane.setFromCoplanarPoints(t1.a, t1.b, t1.c);
	const distance = t1Plane.distanceToPoint(rotatedTestPoint);
	const PRECISION = 1 / 100000;

	const isConcave = Math.abs(distance) < PRECISION;

	const cutAngle = isConcave ? (Math.PI - dihedral) / -2 : (Math.PI - dihedral) / 2;
	if (isNaN(cutAngle)) {
		console.debug({ dihedral, cutAngle, t0, t1, edge0, edge1, address0, address1 });
		throw Error('bad cut angle calculation');
	}
	return { cutAngle, crease: isConcave ? 'valley' : 'mountain' };
};

const getDihedral = (t0: Triangle, t1: Triangle, edge0: TriangleEdge, edge1: TriangleEdge) => {
	const [p0, p1] = getTrianglePointFromTriangleEdge(edge0, 'triangle-order');
	const t0p2 = getOtherTrianglePointFromTriangleEdge(edge0);
	const t1p2 = getOtherTrianglePointFromTriangleEdge(edge1);

	const P = t0[p0].clone();
	const b0 = t0[p1].clone().addScaledVector(P, -1);
	const b1 = t0[t0p2].clone().addScaledVector(P, -1);
	const b2 = t1[t1p2].clone().addScaledVector(P, -1);

	const cross1 = new Vector3();
	const cross2 = new Vector3();

	cross1.crossVectors(b0, b1);
	cross2.crossVectors(b0, b2);

	const dihedral = Math.acos(cross1.dot(cross2) / (cross1.length() * cross2.length()));

	if (isNaN(dihedral)) {
		console.debug({ dihedral, P, b0, b1, b2, t0, t1, edge0, edge1 });
	}

	return dihedral;
};

export const corrected = (s: string): TriangleEdge => {
	if (s === 'ba') return 'ab';
	if (s === 'ca') return 'ac';
	if (s === 'cb') return 'bc';
	return s as TriangleEdge;
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
