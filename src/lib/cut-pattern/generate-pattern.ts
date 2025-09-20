import type {
	ProjectionAddress_Band,
	ProjectionAddress_Facet,
	ProjectionAddress_FacetEdge,
	TriangleEdge,
	TriangleEdgePermissive,
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
	BandCutPatternPattern,
	ProjectionPanelPattern,
	SubGlobule,
	SubGlobuleConfig,
	SuperGlobule,
	SuperGlobuleConfig,
	TiledPatternConfig,
	TrianglePoint,
	TubePanelPattern,
	FacetOrientation,
	ScaleUnit,
	PatternScale,
	HingePattern
} from '$lib/types';
import { Line3, Plane, Triangle, Vector3 } from 'three';
import { applyStrokeWidth } from './cut-pattern';
import { generateTiledBandPattern } from './generate-tiled-pattern';
import {
	getBandTriangleEdges,
	getBandTrianglePoints,
	getEdge,
	getEdgeMatchedTriangles,
	isSameVector3,
	printProjectionAddress
} from '$lib/projection-geometry/generate-projection';
import { getMidPoint, radToDeg, svgPathStringFromSegments } from '$lib/patterns/utils';
import type { SuperGlobuleBandPattern, SuperGlobuleProjectionPattern } from '$lib/stores';
import { distributePanels, findLineIntersection, getEdgeVector, redrawTriangle2, rotateVectors, signedZAxisAngleTo } from '../../components/cut-pattern/distrubute-panels';

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

	const collectedBandPatterns: BandCutPatternPattern[] = patternGlobules
		.map(({ globules }: { globules: Globule[] }) => {
			const bandPatterns = globules.map(({ data: { bands }, address }, bandIndex) => {
				let pattern: BandCutPatternPattern;
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
		.map((globulePattern: BandCutPatternPattern) => globulePattern.bands)
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
	const patterns: BandCutPatternPattern[] = [];
	const {
		tiledPatternConfig,
		patternConfig: { pixelScale }
	} = globulePatternConfig;

	if (shouldUsePanelPattern(tiledPatternConfig)) {
		console.debug('SHOULD USE PANEL PATTERN');
		const projectionPanelPattern = generateProjectionPanelPattern({
			tubes,
			range,
			tiledPatternConfig
		});
		return {
			type: 'SuperGlobuleProjectionPanelPattern',
			superGlobuleConfigId: id,
			projectionPanelPattern
		};
	} else {
		console.debug('SHOULD USE CUT PATTERN');
		tubes.forEach(({ bands }) => {
			let pattern: BandCutPatternPattern = generateTiledBandPattern({
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
		const bandPatterns = patterns.map((pattern: BandCutPatternPattern) => pattern.bands).flat();

		return {
			type: 'SuperGlobuleProjectionCutPattern',
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
	range,
	tiledPatternConfig
}: {
	tubes: Tube[];
	range?: {
		tubes?: { start: number; end: number };
		bands?: { start: number; end: number };
		panels?: { start: number; end: number };
	};
	tiledPatternConfig: TiledPatternConfig;
}): ProjectionPanelPattern => {
	const shouldDistributePanels = tiledPatternConfig.config.distributePanels;
	const panelOffset = tiledPatternConfig.config.distributionOffset || -10;

	const pattern: ProjectionPanelPattern = {
		address: { projection: tubes[0].address.projection },
		tubes: []
	};
	console.debug('generateProjectionPanelPattern', { tubes, range });

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

			const bandBasePoints = getBandBasePoints(band.orientation);
			const bandPattern: BandPanelPattern = {
				orientation: band.orientation,
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

				if (!shouldDistributePanels || p === 0) {
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
						.setLength(panelOffset);
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



	const postProcessedPattern: ProjectionPanelPattern = postProcessPanelPattern(pattern, tiledPatternConfig);
	const hingedPattern = generateHingedPattern(postProcessedPattern, tiledPatternConfig);
	return hingedPattern;
};

const generateHingedPattern = (pattern: ProjectionPanelPattern, tiledPatternConfig: TiledPatternConfig): ProjectionPanelPattern => {
	const hingedPattern: ProjectionPanelPattern = {
		...pattern,
		tubes: pattern.tubes.map((tube,t) => {
			return {
				...tube,
				bands: tube.bands.map((band,b) => {
				
					const [{base, second, outer}] = getBandTriangleEdges(band.orientation)

					return {
						...band,
						panels: band.panels.map((panel, p) => {
							// if (t!==0 || b!==1 || p!==0) return panel
							
							const edges: TriangleEdge[] = []
							if (p % 2 === 0) edges.push(
								base,
								second,
								outer
							)
							const hingePatterns = edges.map((edge) => { 
								const isPartnerDetatched =
									edge === outer ||
									(p === 0 && edge === base) ||
									(p === band.panels.length - 1 && edge === second);
								// return getHingedEdgePattern(panel, pattern.tubes, edge, isPartnerDetatched)

								return getHingedEdgePatternV2(panel, getPartnerPanel(panel, pattern.tubes, edge), edge)
							})

							return {
								...panel,
								meta: {
									...panel.meta,
									hingePatterns,
								}
							};
						})
					};
				})
			};
		})
	};
	return hingedPattern;
};

const getHingedEdgePatternV2 = (panel: RequiredPanelPattern, partnerPanel: RequiredPanelPattern, edge: TriangleEdge) => {
	const partnerEdge = corrected(panel.meta.edges[edge].partner.edge)
	const zeroedPanel = getZeroedPanel(panel, panel.meta.backFaceRegistrationPoints[edge], edge, 'positive')
	
	const zeroedPartnerPanel = getZeroedPanel(partnerPanel, partnerPanel.meta.backFaceRegistrationPoints[partnerEdge], partnerEdge, 'negative')

  const thisSideHoles = [...(zeroedPanel.meta.edges[edge].holes || []), (zeroedPanel.meta.edges[nextEdge(edge)].holes || [])[0]].map((hole) => ({ ...hole, location: hole.location.clone() }))
  const partnerSideHoles = [...(zeroedPartnerPanel.meta.edges[partnerEdge].holes || []), (zeroedPartnerPanel.meta.edges[nextEdge(partnerEdge)].holes || [])[0]].map((hole) => ({ ...hole, location: hole.location.clone() }))
	
	const thisSide = getHingeOutline(zeroedPanel.meta.backFaceTriangle, thisSideHoles, edge)
	const partnerSide = getHingeOutline(zeroedPartnerPanel.meta.backFaceTriangle, partnerSideHoles, partnerEdge)
	partnerSide.outline = partnerSide.outline.reverse()

	// TODO: put this into a function
	const midPoint = getMidPoint(thisSide.outline[0], thisSide.outline[thisSide.outline.length - 1])
	const thisSideDistance0 = midPoint.distanceTo(thisSide.outline[0])
	const partnerSideDistance0 = midPoint.distanceTo(partnerSide.outline[0])
	const thisSideDistance1 = midPoint.distanceTo(thisSide.outline[thisSide.outline.length - 1])
	const partnerSideDistance1 = midPoint.distanceTo(partnerSide.outline[partnerSide.outline.length - 1])
	
	if (thisSideDistance0 > partnerSideDistance0) {
		thisSide.outline[0] = partnerSide.outline[0].clone()
	}
	if(partnerSideDistance0 > thisSideDistance0) {
		partnerSide.outline[0] = thisSide.outline[0].clone()
	} 
	if (thisSideDistance1 > partnerSideDistance1) {
		thisSide.outline[thisSide.outline.length - 1] = partnerSide.outline[partnerSide.outline.length - 1].clone()
	}
	if (partnerSideDistance1 > thisSideDistance1) {
		partnerSide.outline[partnerSide.outline.length - 1] = thisSide.outline[thisSide.outline.length - 1].clone()
	}
	// end of TODO



	const outline = [...thisSide.outline, ...partnerSide.outline]
	const bounds = getBounds(outline)


	const hingePattern: HingePattern = {
		edge,
		bounds,
		address: {...panel.address, edge},
		pattern: {
			partnerBackFaceTriangle: zeroedPartnerPanel.meta.backFaceTriangle,
			backfFaceTriangle: zeroedPanel.meta.backFaceTriangle,
			outline,
			hinge: [thisSide.outline[0], thisSide.outline[thisSide.outline.length - 1]],
			holes: [...thisSideHoles, ...partnerSideHoles]
		}
	}

	return hingePattern
}

const getBounds = (vectors: Vector3[]) => {
	const xValues = vectors.map((vector) => vector.x)
	const yValues = vectors.map((vector) => vector.y)
	const minX = Math.min(...xValues)
	const maxX = Math.max(...xValues)
	const minY = Math.min(...yValues)
	const maxY = Math.max(...yValues)

	return {
		width: maxX - minX,
		height: maxY - minY,
		left: minX,
		top: minY,
	}
}

const directionToVector = {
	'positive': new Vector3(1, 0, 0),
	'negative': new Vector3(-1, 0, 0)
}

type RequiredPanelPattern = PanelPattern & {
	meta: Required<PanelPattern['meta']>;
}

const getZeroedPanel = (panel: RequiredPanelPattern, anchor: Vector3, edge: TriangleEdge, direction: 'positive' | 'negative'): RequiredPanelPattern => { 
	const [p0, p1, p2] = getTrianglePointFromTriangleEdge(edge, 'triangle-order');
	
	const offsetVector = anchor.clone()

	const edgeVector = getEdgeVector(panel.triangle, [p0, p1])
	const angle = signedZAxisAngleTo(directionToVector[direction], edgeVector) // check this
	


	const newTriangle = new Triangle(
		panel.triangle.a.clone().addScaledVector(offsetVector, -1).applyAxisAngle(Z_AXIS, -angle),
		panel.triangle.b.clone().addScaledVector(offsetVector, -1).applyAxisAngle(Z_AXIS, -angle),
		panel.triangle.c.clone().addScaledVector(offsetVector, -1).applyAxisAngle(Z_AXIS, -angle)
	)

	const newBackFaceTriangle = new Triangle(
		panel.meta.backFaceTriangle.a.clone().addScaledVector(offsetVector, -1).applyAxisAngle(Z_AXIS, -angle),
		panel.meta.backFaceTriangle.b.clone().addScaledVector(offsetVector, -1).applyAxisAngle(Z_AXIS, -angle),
		panel.meta.backFaceTriangle.c.clone().addScaledVector(offsetVector, -1).applyAxisAngle(Z_AXIS, -angle)
	)

	const newPanel: PanelPattern = { 
		...panel, 
		triangle: newTriangle,
		meta: {
			...panel.meta,
			backFaceTriangle: newBackFaceTriangle,
			edges: {
				ab: { ...panel.meta.edges.ab, holes: panel.meta.edges.ab.holes?.map((hole) => ({ ...hole, location: hole.location.clone().addScaledVector(offsetVector, -1).applyAxisAngle(Z_AXIS, -angle) })) },
				bc: { ...panel.meta.edges.bc, holes: panel.meta.edges.bc.holes?.map((hole) => ({ ...hole, location: hole.location.clone().addScaledVector(offsetVector, -1).applyAxisAngle(Z_AXIS, -angle) })) },
				ac: { ...panel.meta.edges.ac, holes: panel.meta.edges.ac.holes?.map((hole) => ({ ...hole, location: hole.location.clone().addScaledVector(offsetVector, -1).applyAxisAngle(Z_AXIS, -angle) })) },
			}
		}
	}
	return newPanel
}

const getPartnerPanel = (panel: PanelPattern, tubes: TubePanelPattern[], edge: TriangleEdge) => {
	const partnerAddress = panel.meta.edges[edge].partner
	const partnerPanel = { ...tubes[partnerAddress.tube].bands[partnerAddress.band].panels[partnerAddress.facet] } as PanelPattern
	return partnerPanel
}

// TODO: put these in config
const HINGE_MARGIN = 8;

const getHingedEdgePattern = (panel: PanelPattern, tubes: TubePanelPattern[], edge: TriangleEdge, isPartnerDetatched: boolean): HingePattern => {
	const [p0, p1] = getTrianglePointFromTriangleEdge(edge, 'triangle-order');
	const p2 = getOtherTrianglePointFromTriangleEdge(edge)
	const partnerAddress = panel.meta.edges[edge].partner
	const partnerPanel = { ...tubes[partnerAddress.tube].bands[partnerAddress.band].panels[partnerAddress.facet] } as PanelPattern
	if (!partnerPanel.meta.backFaceTriangle || !panel.meta.backFaceTriangle) {
		throw new Error('partner backFaceTriangle is required');
	}

	const thisSideHoles = [ ...(panel.meta.edges[edge].holes || []), (panel.meta.edges[nextEdge(edge)].holes || [])[0]].map((hole) => ({ ...hole, location: hole.location.clone() }))
	const thisSide = getHingeOutline(panel.meta.backFaceTriangle, thisSideHoles, edge)



	// Partner back face triangle
	const partnerBackFaceTriangle = new Triangle(
		partnerPanel.meta.backFaceTriangle.a.clone(),
		partnerPanel.meta.backFaceTriangle.b.clone(),
		partnerPanel.meta.backFaceTriangle.c.clone()
	)
  let partnerSideHoles = [...(partnerPanel.meta.edges[edge].holes || []), (partnerPanel.meta.edges[nextEdge(edge)].holes || [])[0]].map((hole) => ({ ...hole, location: hole.location.clone() }))

	if (isPartnerDetatched) {
		const frontFaceShiftAngle = signedZAxisAngleTo(getEdgeVector(panel.triangle, [p0, p1]), getEdgeVector(partnerPanel.triangle, [p1, p0]))
		const { a, b, c } = partnerBackFaceTriangle
		partnerBackFaceTriangle.set(...rotateVectors([a, b, c], frontFaceShiftAngle) as [Vector3, Vector3, Vector3])
		const { a: a2, b: b2, c: c2 } = partnerPanel.triangle
		const partnerFrontFaceTriangle = new Triangle(...rotateVectors([a2, b2, c2], frontFaceShiftAngle) as [Vector3, Vector3, Vector3])
		partnerSideHoles = partnerSideHoles.map((hole) => ({ ...hole, location: hole.location.clone().applyAxisAngle(Z_AXIS, frontFaceShiftAngle) }))


	




	}
	/*
	if (isPartnerDetatched) {
		// shift partner back face triangle by the same amount as would be required to shift partner.panel.triangle so that edges match
		const frontFaceEdgeVector = getEdgeVector(panel.triangle, [p0, p1]) 
		const partnerFrontFaceEdgeVector = getEdgeVector(partnerPanel.triangle, [p1, p0])
		const frontFaceShiftAngle = signedZAxisAngleTo(frontFaceEdgeVector, partnerFrontFaceEdgeVector)
		
		console.debug({ frontFaceEdgeVector, partnerFrontFaceEdgeVector, frontFaceShiftAngle: radToDeg(frontFaceShiftAngle), p0, p1 })
		
		const frontFaceShiftVector = new Vector3(0,0,0)
		// frontFaceShiftVector.x = panel.triangle[p0].x - partnerPanel.triangle[p0].x
		// frontFaceShiftVector.y = panel.triangle[p0].y - partnerPanel.triangle[p0].y
		// frontFaceShiftVector.z = panel.triangle[p0].z - partnerPanel.triangle[p0].z
	
		console.debug({ frontFaceShiftVector })
	
		const shiftedartnerBackFaceTriangle = redrawTriangle2(partnerBackFaceTriangle, frontFaceShiftVector, frontFaceShiftAngle, p0)
		partnerBackFaceTriangle.set(
			shiftedartnerBackFaceTriangle.a.clone(),
			shiftedartnerBackFaceTriangle.b.clone(),
			shiftedartnerBackFaceTriangle.c.clone()
		)
	}
	*/

	// shift partner back face to be colinear with panel back face
	const partnerEdgeLine = new Line3(partnerBackFaceTriangle[p0], partnerBackFaceTriangle[p1])
	const anchor = panel.meta.backFaceTriangle[p0].clone()
	const partnerAnchor = new Vector3();
	partnerEdgeLine.closestPointToPoint(anchor, false, partnerAnchor);
	const shiftVector = anchor.clone().addScaledVector(partnerAnchor, -1)


		partnerBackFaceTriangle.set(
			partnerBackFaceTriangle.a.clone().addScaledVector(shiftVector, 1),
			partnerBackFaceTriangle.b.clone().addScaledVector(shiftVector, 1),
			partnerBackFaceTriangle.c.clone().addScaledVector(shiftVector, 1)
		)

	
	partnerSideHoles = partnerSideHoles.map((hole) => ({ ...hole, location: hole.location.clone().addScaledVector(shiftVector, 1) }))
	
	const partnerSide = getHingeOutline(partnerBackFaceTriangle, partnerSideHoles, edge)
	partnerSide.outline = partnerSide.outline.reverse()

	const midPoint = getMidPoint(thisSide.outline[0], thisSide.outline[thisSide.outline.length - 1])
	const thisSideDistance0 = midPoint.distanceTo(thisSide.outline[0])
	const partnerSideDistance0 = midPoint.distanceTo(partnerSide.outline[0])
	const thisSideDistance1 = midPoint.distanceTo(thisSide.outline[thisSide.outline.length - 1])
	const partnerSideDistance1 = midPoint.distanceTo(partnerSide.outline[partnerSide.outline.length - 1])
	
	if (thisSideDistance0 > partnerSideDistance0) {
		thisSide.outline[0] = partnerSide.outline[0].clone()
	}
	if(partnerSideDistance0 > thisSideDistance0) {
		partnerSide.outline[0] = thisSide.outline[0].clone()
	} 
	if (thisSideDistance1 > partnerSideDistance1) {
		thisSide.outline[thisSide.outline.length - 1] = partnerSide.outline[partnerSide.outline.length - 1].clone()
	}
	if (partnerSideDistance1 > thisSideDistance1) {
		partnerSide.outline[partnerSide.outline.length - 1] = thisSide.outline[thisSide.outline.length - 1].clone()
	}


	return {
		edge,
		address: {...panel.address, edge},
		pattern: {
			partnerBackFaceTriangle,
			outline: [...thisSide.outline, ...partnerSide.outline],
			hinge: [thisSide.outline[0], thisSide.outline[thisSide.outline.length - 1]],
			holes: [...thisSide.holes, ...partnerSide.holes]
		}
	}
}

const getHingeOutline = (backFaceTriangle: Triangle, holes: { location: Vector3, holeDiameter: number, headDiameter: number }[], edge: TriangleEdge): {outline: Vector3[], holes: { location: Vector3, holeDiameter: number, headDiameter: number }[]} => { 

	const [p0, p1] = getTrianglePointFromTriangleEdge(edge, 'triangle-order');
	const p2 = getOtherTrianglePointFromTriangleEdge(edge)
	const hingeLine = new Line3(backFaceTriangle[p0], backFaceTriangle[p1]);
	const edgeVector = backFaceTriangle[p1].clone().addScaledVector(backFaceTriangle[p0], -1).normalize()
	const perpVector = edgeVector.clone().applyAxisAngle(Z_AXIS, Math.PI / 2);
	
	
	
	const corner0 = new Vector3()
	const corner1 = new Vector3()
	
	hingeLine.closestPointToPoint(holes[0].location, false, corner0);
	hingeLine.closestPointToPoint(holes[holes.length - 1].location, false, corner1);
	
	const backsetVector = holes[0].location.clone().addScaledVector(corner0, -1)
	const backsetLength = backsetVector.length()

	corner0.addScaledVector(edgeVector, -1 * HINGE_MARGIN);
	corner1.addScaledVector(edgeVector, HINGE_MARGIN);

	const corner2 = corner1.clone().addScaledVector(perpVector, -1 * (backsetLength + HINGE_MARGIN));
	const corner3 = corner0.clone().addScaledVector(perpVector, -1 * (backsetLength + HINGE_MARGIN));

	const intersection0 = findLineIntersection({v0: backFaceTriangle[p0], v1: backFaceTriangle[p2]}, {v0: corner2, v1: corner3})
	const intersection1 = findLineIntersection({ v0: backFaceTriangle[p1], v1: backFaceTriangle[p2] }, { v0: corner2, v1: corner3 })
	if (!intersection0 || !intersection1) {
		throw new Error('intersection is required');
	}
	
	return {outline: [backFaceTriangle[p0].clone(), intersection0, intersection1, backFaceTriangle[p1].clone()], holes}
}

const nextEdge = (edge: TriangleEdge): TriangleEdge => {
	const sequencedEdges = {
		ab: 'bc',
		bc: 'ac',
		ac: 'ab'
	}
	return sequencedEdges[edge] as TriangleEdge
}

const postProcessPanelPattern = (pattern: ProjectionPanelPattern | { tubes: never[] }, tiledPatternConfig: TiledPatternConfig): ProjectionPanelPattern => {
	let {
		distributionConfig,
		panelHoleConfig: holeConfig,
		scaleConfig
	} = tiledPatternConfig.config;

	if (!holeConfig || !distributionConfig || !scaleConfig) {
		throw new Error('missing config');
	}

	const pxHoleConfig = scaleHoleConfig(holeConfig, scaleConfig);
	const distributedPattern = distributePanels(pattern, distributionConfig);
	const postProcessedPattern: ProjectionPanelPattern = {
		...distributedPattern,
		tubes: distributedPattern.tubes.map((tube) => {
			return {
				...tube,
				bands: tube.bands.map((band) => {
					return {
						...band,
						panels: band.panels.map((panel) => {
							return {
								...panel,
								meta: applyHolesToEdgeMeta(panel.meta, panel.triangle, pxHoleConfig)
							};
						})
					};
				})
			};
	})};
	return postProcessedPattern;
};
const holeUnitConversionFactors: Record<ScaleUnit, Partial<Record<ScaleUnit, number>>> = {
	mm: {
		in: 1 / 25.4
	},
	in: {
		mm: 25.4
	},
	px: {
		mm: 1 / 20,
		in: 1 / 100
	}
};
const scaleHoleConfig = (holeConfig: PanelHoleConfig, scaleConfig: PatternScale) => {
	const { unit: scaleUnit, unitPerSvgUnit } = scaleConfig;
	const { units: holeUnit } = holeConfig;

	const conversionFactor = (holeUnitConversionFactors[holeUnit][scaleUnit] || 1) / unitPerSvgUnit;
	
	const pxHoleConfig: PanelHoleConfig = {
		units: 'px',
		count: holeConfig.count,
		holeDistribution: holeConfig.holeDistribution,
		thickness: holeConfig.thickness * conversionFactor,
		minimumInset: holeConfig.minimumInset * conversionFactor,
		vertexInset: holeConfig.vertexInset * conversionFactor,
		holeDiameter: holeConfig.holeDiameter * conversionFactor,
		headDiameter: holeConfig.headDiameter * conversionFactor,
		nutDiameter: holeConfig.nutDiameter * conversionFactor
	};
	return pxHoleConfig;
};

export const getBandBasePoints = (
	orientation: FacetOrientation
): [{ p0: TrianglePoint; p1: TrianglePoint }, { p0: TrianglePoint; p1: TrianglePoint }] => {
	const base0 = getTrianglePointFromTriangleEdge(
		getEdge('base', 'even', orientation),
		'triangle-order'
	);
	const base1 = getTrianglePointFromTriangleEdge(
		getEdge('base', 'odd', orientation),
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

	let edgeMeta = Object.fromEntries(
		(['ab', 'bc', 'ac'] as TriangleEdge[]).map((edge) => {
			if (!facet.meta || !facet.meta[edge]) throw Error('facet edge missing meta');
			const { partner } = facet.meta[edge];
			const partnerFacet = tubes[partner.tube].bands[partner.band].facets[partner.facet];
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

const edges = ['ab', 'bc', 'ac'] as TriangleEdge[];



export type PanelHoleConfig = {
	holeDistribution: 'spaced' | 'vertex' | 'matched'
	units: ScaleUnit;
	thickness: number;
	count: number;
	minimumInset: number;
	vertexInset: number;
	holeDiameter: number;
	headDiameter: number;
	nutDiameter: number;
}

const Z_AXIS = new Vector3(0, 0, 1);


const getInsetLines = (edge: TriangleEdge, index: number, insets: number[], triangle: Triangle) => {
		const [p0, p1] = getTrianglePointFromTriangleEdge(edge, 'triangle-order');
		const edgeVector = getEdgeVector(triangle, [p0, p1]);
		const rotatedEdgeVector = edgeVector.clone().applyAxisAngle(Z_AXIS, Math.PI / 2);
		rotatedEdgeVector.setLength(-insets[index]);
		const insetPoint0 = triangle[p0].clone().addScaledVector(rotatedEdgeVector, 1);
		const insetPoint1 = triangle[p1].clone().addScaledVector(rotatedEdgeVector, 1);
		return { v0: insetPoint0, v1: insetPoint1 };
	}

export const applyHolesToEdgeMeta = (meta: PanelPattern['meta'], triangle: Triangle, config: PanelHoleConfig): PanelPattern['meta'] => {
	const backFaceInsets = edges.map((edge) => {
		return config.thickness * Math.tan(meta.edges[edge].cutAngle)
	})
	const insets = edges.map((edge, e) => {
		return meta.edges[edge].cutAngle <= 0
			? Math.max(config.headDiameter / 2, config.minimumInset )
			: Math.max(backFaceInsets[e] + config.headDiameter / 2, config.minimumInset)
	})
	
	const insetLines = edges.map((edge, index) => getInsetLines(edge, index, insets, triangle))
	const backFaceLines = edges.map((edge, index) => getInsetLines(edge, index, backFaceInsets, triangle))

	const intersections = [
		findLineIntersection(insetLines[0], insetLines[2]),
		findLineIntersection(insetLines[1], insetLines[0]),
		findLineIntersection(insetLines[1], insetLines[2])
	]
	const backFaceIntersections = [
		findLineIntersection(backFaceLines[0], backFaceLines[2]),
		findLineIntersection(backFaceLines[1], backFaceLines[0]),
		findLineIntersection(backFaceLines[1], backFaceLines[2])
	]

	if (intersections.every(intersection => intersection !== null) && backFaceIntersections.every(intersection => intersection !== null)) {
		const insetTriangle = new Triangle(
			intersections[0],
			intersections[1],
			intersections[2]
		)
		const backFaceTriangle = new Triangle(
			backFaceIntersections[0],
			backFaceIntersections[1],
			backFaceIntersections[2]
		)
		meta.insetTriangle = insetTriangle;
		meta.backFaceTriangle = backFaceTriangle;
		meta.frontFaceRegistrationPoints = {
			ab: getMidPoint(triangle.a, triangle.b),
			bc: getMidPoint(triangle.b, triangle.c),
			ac: getMidPoint(triangle.a, triangle.c)
		}
		meta.backFaceRegistrationPoints = {ab: new Vector3(), bc: new Vector3(), ac: new Vector3()}




		for (const edge of edges) {
			const [p0, p1] = getTrianglePointFromTriangleEdge(edge as TriangleEdge, 'triangle-order');

			const backEdgeLine = new Line3(backFaceTriangle[p0], backFaceTriangle[p1])
			backEdgeLine.closestPointToPoint(meta.frontFaceRegistrationPoints[edge], false, meta.backFaceRegistrationPoints[edge])

			// meta.backFaceRegistrationPoints[edge] = getMidPoint(backFaceTriangle[p0], backFaceTriangle[p1])
			const holes: { location: Vector3, holeDiameter: number, headDiameter: number }[] = []
			if (config.holeDistribution === 'spaced') {
				
				holes.push(...getSpacedHoles(triangle, config, edge, insetTriangle))
			}
			if (config.holeDistribution === 'vertex') {
				const edgeHoles = Array.from({ length: config.count }, (_, i) => ({
					location: insetTriangle[p0].clone().lerp(insetTriangle[p1], i / (config.count)),
					holeDiameter: config.holeDiameter,
					headDiameter: config.headDiameter,
					nutDiameter: config.nutDiameter
				}))
				holes.push(...edgeHoles)
			}

			meta.edges[edge] = { ...meta.edges[edge], holes };
		}
	}
	
	return meta ;
};

// const getVertexHoles = (triangle: Triangle, config: PanelHoleConfig, edge: TriangleEdge, insetTriangle: Triangle) => {
// 	const [p0, p1] = getTrianglePointFromTriangleEdge(edge as TriangleEdge, 'triangle-order');
// 	const p2 = getOtherTriangleElements([p0, p1])
// 	const edgeVector0 = getEdgeVector(insetTriangle, [p0, p1]);
// 	const edgeVector1 = getEdgeVector(insetTriangle, [p0, p2]);
// 	const angle0 = edgeVector0.angleTo(edgeVector1) / 2;
// 	const oppositeSideLength = config.holeDiameter / 2
// 	const adjacentSideLength = oppositeSideLength / Math.tan(angle0)
// 	const hole = new Vector3()
// 	hole.lerpVectors(insetTriangle[p0], insetTriangle[p1], adjacentSideLength / edgeVector0.length())
// 	const opppositeSideVector = edgeVector0.clone().applyAxisAngle(Z_AXIS, -Math.PI / 2).setLength(oppositeSideLength)
// 	console.debug('getVertexHoles', {v0: insetTriangle[p0], v1: insetTriangle[p1], edgeVector0, length: edgeVector0.length(), adjacentSideLength, oppositeSideLength, angle0, opppositeSideVector, hole})
// 	hole.addScaledVector(opppositeSideVector, 1)
// 	return [hole]
// }

const getSpacedHoles = (triangle: Triangle, config: PanelHoleConfig, edge: TriangleEdge, insetTriangle: Triangle) => {
	const [p0, p1] = getTrianglePointFromTriangleEdge(edge as TriangleEdge, 'triangle-order');
	const edgeVector = getEdgeVector(triangle, [p0, p1]);
	const alpha = config.vertexInset / edgeVector.length();
	const hole0 = new Vector3();
	const hole1 = new Vector3();
	hole0.lerpVectors(insetTriangle[p0], insetTriangle[p1], alpha);
	hole1.lerpVectors(insetTriangle[p1], insetTriangle[p0], alpha);
	return [
		{ location: hole0, holeDiameter: config.holeDiameter, headDiameter: config.headDiameter },
		{ location: hole1, holeDiameter: config.holeDiameter, headDiameter: config.headDiameter }
	]
}



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
	const [p0, p1] = TRIANGLE_POINT_MAP[ordering][edge] as [TrianglePoint, TrianglePoint];
	const p2 = getOtherTrianglePointFromTriangleEdge(edge)
	return [p0, p1, p2] as [TrianglePoint, TrianglePoint, TrianglePoint];
};

export const getTrianglePointAsKVFromTriangleEdge = (
	edge: TriangleEdge,
	ordering: 'edge-order' | 'triangle-order'
) => {
	const [p0, p1] = TRIANGLE_POINT_MAP[ordering][edge] as [TrianglePoint, TrianglePoint];
	return { p0, p1 };
};

export type TrianglePointPair = [TrianglePoint, TrianglePoint];

const isTrianglePointPair = (
	p: TrianglePoint | [TrianglePoint, TrianglePoint] | TriangleEdgePermissive
): p is TrianglePointPair => {
	return (
		Array.isArray(p) &&
		p[0] !== p[1] &&
		['a', 'b', 'c'].includes(p[0]) &&
		['a', 'b', 'c'].includes(p[1])
	);
};

type GetOtherTriangleElementsConfig = {
	ordering?: 'edge-order' | 'triangle-order';
	split?: boolean;
};

// Function overloads for type-safe return types
export function getOtherTriangleElements(
	p: TrianglePoint,
	config?: undefined
): TrianglePointPair;

export function getOtherTriangleElements(
	p: TrianglePoint,
	config: GetOtherTriangleElementsConfig & { split?: true }
): TrianglePointPair;

export function getOtherTriangleElements(
	p: TrianglePoint,
	config: GetOtherTriangleElementsConfig & { split: false }
): TriangleEdge;

export function getOtherTriangleElements(
	p: TriangleEdgePermissive | TrianglePointPair,
	config?: GetOtherTriangleElementsConfig
): TrianglePoint;


// Implementation
export function getOtherTriangleElements(
	p: TrianglePoint | [TrianglePoint, TrianglePoint] | TriangleEdgePermissive,
	config: GetOtherTriangleElementsConfig = {ordering: 'triangle-order', split: true}
): TriangleEdgePermissive | TrianglePoint | TrianglePointPair {
	const { ordering = 'triangle-order', split = true } = config;
	const others: { [key: string]: { [key: string]: TriangleEdgePermissive | TrianglePoint } } = {
		'edge-order': {
			a: 'bc',
			b: 'ac',
			c: 'ab',
			ab: 'c',
			bc: 'a',
			ac: 'b',
			ba: 'c',
			cb: 'a',
			ca: 'b'
		},
		'triangle-order': {
			a: 'bc',
			b: 'ca',
			c: 'ab',
			ab: 'c',
			bc: 'a',
			ac: 'b',
			ba: 'c',
			cb: 'a',
			ca: 'b'
		}
	};
	
	const key: TrianglePoint | TriangleEdgePermissive = isTrianglePointPair(p) ? `${p[0]}${p[1]}` as TriangleEdgePermissive : p;
	const result = others[ordering][key];
	return result.length === 2 && split ? result.split('') as TrianglePointPair : result;
}

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

export const getOtherTrianglePointsFromTrianglePoint = (
	point: TrianglePoint,
	ordering: 'edge-order' | 'triangle-order'
): [TrianglePoint, TrianglePoint] => {
	const otherPoints = {
		'edge-order': {
			a: ['b', 'c'],
			b: ['a', 'c'],
			c: ['a', 'b']
		},
		'triangle-order': {
			a: ['b', 'c'],
			b: ['c', 'a'],
			c: ['a', 'b']
		}
	};
	return otherPoints[ordering][point] as [TrianglePoint, TrianglePoint];
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

	let dihedral = Math.acos(cross1.dot(cross2) / (cross1.length() * cross2.length()));

	if (isNaN(dihedral)) {
		if (isSameVector3(b1, b2)) {
			dihedral = 0;
		} else {
			dihedral = Math.PI;
		}
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
	
	tubes.forEach((tube) => {
		tube.bands.forEach((band) => {
			band.panels.forEach((panel) => {
				(['ab', 'bc', 'ac'] as TriangleEdge[]).forEach((edge) => {
					try {
						validateEdge(edge, panel, tubes);
						// validateEdgeMeta({
						// 	edge,
						// 	edgeMeta: panel.meta.edges[edge],
						// 	panelAddress: panel.address,
						// 	tubes
						// });
					} catch (err) {
						console.error(err);
					}
				});
			});
		});
	});
};

const validateEdge = (edge: TriangleEdge, panel: PanelPattern, tubes: TubePanelPattern[]) => {
	const partnerAddress = panel.meta.edges[corrected(edge)].partner;
	const panelAddress = panel.address;
	const panelEdgeAddress = { ...panelAddress, edge };
	const partner = tubes[partnerAddress.tube].bands[partnerAddress.band].panels[panelAddress.facet];
	const partnerEdge = partnerAddress.edge;
	const partnerSelfAddress = partner.meta.edges[partnerEdge].partner;

	if (!facetEdgeAddressMatch(panelEdgeAddress, partnerSelfAddress)) {
		throw Error(
			`self partner address mismatch ${printProjectionAddress(
				panelEdgeAddress
			)} : ${printProjectionAddress(partnerSelfAddress)}`
		);
	}
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
	const partner = tubes[pA.tube].bands[pA.band].panels[pA.facet];
	const partnerMeta = partner.meta.edges[corrected(edge)];

	const isCreaseMatched = partnerMeta?.crease === edgeMeta?.crease;
	const isCutAngleMatched =
		Math.abs(partnerMeta?.cutAngle - edgeMeta?.cutAngle) < cutAnglePrecision;
	// const isPartnerAddressMatched = facetEdgeAddressMatch({...panelAddress, edge}, )

	if (!isCreaseMatched || !isCutAngleMatched) {
		const thisPanel = tubes[panelAddress.tube].bands[panelAddress.band].panels[panelAddress.facet];
		console.debug('VALIDATE EDGE META', {
			partner,
			partnerMeta,
			edgeMeta,
			panelAddress,
			partnerAddress: pA
		});
		throw Error(
			`partner cut does not match - cutAngle ${partnerMeta?.cutAngle}, ${
				edgeMeta?.cutAngle
			} diff ${Math.abs(partnerMeta?.cutAngle - edgeMeta?.cutAngle)} - ${partnerMeta?.crease}, ${
				edgeMeta?.crease
			}
this edge ${printProjectionAddress({
				...panelAddress,
				edge
			})} -> ${printProjectionAddress(edgeMeta.partner)}
partner   ${printProjectionAddress(pA)} -> ${printProjectionAddress(
				partner.meta.edges[edge].partner
			)}`
		);
	}
};

const facetEdgeAddressMatch = (
	a0: ProjectionAddress_FacetEdge,
	a1: ProjectionAddress_FacetEdge
) => {
	return (
		a0.projection === a1.projection &&
		a0.tube === a1.tube &&
		a0.band === a1.band &&
		a0.facet === a1.facet &&
		a0.edge === a1.edge
	);
};
