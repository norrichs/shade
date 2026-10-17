import { Vector3, Triangle } from 'three';
import { generateMultiFacetFullTab, generateFullTab, generateTrapTab } from '../generate-shape';
import { getFlatTriangle } from './generate-panel-pattern';
import { getBandBasePoints } from './generate-pattern';
import type {
	AlignTrianglesConfig,
	Band,
	BandStyle,
	EdgeConfig,
	Facet,
	FlatStripConfig,
	PanelBase,
	CutPattern,
	Strip,
	Strut,
	TabStyle,
	TrianglePoint,
	BandCutPattern,
	DynamicStrokeConfig
} from '#lib/types.js';

const alignTriangle = (triangle: Triangle, config: AlignTrianglesConfig): Triangle => {
	// for odd facets (which should also be Greater Side), reverse the lead / follow vectors, and the angle?

	const parity = config.isEven ? 1 : -1;
	const tabParity = config.isTabOnGreaterSide ? -1 : 1;
	const zAxis = new Vector3(0, 0, 1);
	const pointSet: TrianglePoint[] = ['a', 'b', 'c'];

	const pivot = config.lead.p; // pivot is the same point as prevTriangle[config.follow], but has the same label as config.lead
	const constrained = config.follow.p;
	const free: TrianglePoint = pointSet.find((p) => p !== constrained && p !== pivot) || 'a';
	const segmentOldPivotFree = triangle[pivot].clone().addScaledVector(triangle[free], -1);
	const segmentOldPivotConstrained = triangle[pivot]
		.clone()
		.addScaledVector(triangle[constrained], -1);
	const len = segmentOldPivotFree.length();
	const angle = segmentOldPivotConstrained.angleTo(segmentOldPivotFree);

	const alignedTriangle = new Triangle();
	alignedTriangle[pivot] = config.isTabOnGreaterSide
		? config.lead.vec.clone()
		: config.follow.vec.clone();
	alignedTriangle[constrained] = config.isTabOnGreaterSide
		? config.follow.vec.clone()
		: config.lead.vec.clone();
	const segment = alignedTriangle[constrained]
		.clone()
		.addScaledVector(alignedTriangle[pivot], -1)
		.setLength(len)
		.applyAxisAngle(zAxis, angle * parity * tabParity);
	alignedTriangle[free] = segment.addScaledVector(alignedTriangle[pivot], 1);

	return alignedTriangle;
};

export const getFlatStripV2 = <T extends Strut | Band>(
	strip: T,
	flatStripConfig: FlatStripConfig,
	tabStyle?: TabStyle
): T => {
	const config = {
		origin: new Vector3(0, 0, 0),
		direction: new Vector3(0, -1, 0),
		...flatStripConfig
	};

	const flatStrip: Strip = { ...strip, facets: [] };

	// Get the base points for even/odd triangles based on the first facet's orientation
	const bandBasePoints = getBandBasePoints(strip.facets[0].orientation);

	strip.facets.forEach((facet, i) => {
		const alignedFacet: Facet = { ...facet };

		// Determine which base points to use (even or odd)
		const thisBasePoints = bandBasePoints[i % 2];
		let base: PanelBase;

		if (i === 0) {
			// First triangle: use origin and (1,0,0) as the base
			base = {
				...thisBasePoints,
				v0: config.origin.clone(),
				v1: config.origin.clone().add(new Vector3(1, 0, 0))
			};
		} else {
			// Subsequent triangles: derive base from previous triangle's "second" points
			// The second points are p1, p0 (reversed order) from thisBasePoints
			const prevTriangle = flatStrip.facets[i - 1].triangle;
			base = {
				...thisBasePoints,
				v0: prevTriangle[thisBasePoints.p1].clone(),
				v1: prevTriangle[thisBasePoints.p0].clone()
			};
		}

		// Use getFlatTriangle to get the aligned triangle
		if (facet.isDegenerate) {
			// Synthetic zero-area fill facet: do not run law-of-cosines (it divides by a
			// zero-length edge → NaN, poisoning the whole strip). Place the two collapsed
			// vertices coincident on the shared base edge so the facet occupies its quad
			// slot with finite coordinates and contributes zero rotation.
			alignedFacet.triangle = new Triangle(base.v0.clone(), base.v1.clone(), base.v1.clone());
		} else {
			alignedFacet.triangle = getFlatTriangle({ triangle: facet.triangle, base });
		}

		// Handle tabs
		if (facet.tab && tabStyle) {
			const edgeConfig = generateEdgeConfig(config.bandStyle, i % 2 === 0, false, true);
			const tabAlignConfig = {
				isEven: Math.abs((i - 1) % 2) === 0,
				isTabOnGreaterSide: Math.abs((i - 1) % 2) === 1,
				lead: { p: edgeConfig.lead, vec: alignedFacet.triangle[edgeConfig.lead].clone() },
				follow: { p: edgeConfig.follow, vec: alignedFacet.triangle[edgeConfig.follow].clone() }
			};
			if (facet.tab.style === 'full' || facet.tab.style === 'trapezoid') {
				const tabFootprint = alignTriangle(facet.tab.footprint.triangle, tabAlignConfig);

				if (tabStyle?.style === 'full') {
					alignedFacet.tab = generateFullTab(tabStyle, tabFootprint, edgeConfig);
				} else if (tabStyle?.style === 'trapezoid') {
					alignedFacet.tab = generateTrapTab(tabStyle, tabFootprint, edgeConfig);
				}
			} else if (facet.tab?.style.startsWith('multi-facet')) {
				if (facet.tab.style === 'multi-facet-full') {
					const edgeConfig0 = generateEdgeConfig(config.bandStyle, i % 2 === 0, false, true);
					const alignConfig0: AlignTrianglesConfig = {
						isEven: i % 2 === 0,
						isTabOnGreaterSide: i % 2 === 1,
						lead: { vec: alignedFacet.triangle[edgeConfig0.follow], p: edgeConfig0.follow },
						follow: { vec: alignedFacet.triangle[edgeConfig0.lead], p: edgeConfig0.lead }
					};
					const tabTriangle0: Triangle = alignTriangle(
						facet.tab.footprint[0].triangle,
						alignConfig0
					);
					// Configure second triangle of tab
					const edgeConfig1 =
						i % 2 === 0
							? generateEdgeConfig(config.bandStyle, i % 2 !== 0, false, false)
							: ({ lead: 'b', follow: 'a' } as EdgeConfig);
					const alignConfig1: AlignTrianglesConfig = {
						isEven: false,
						isTabOnGreaterSide: false,
						lead: { vec: tabTriangle0[edgeConfig1.lead], p: edgeConfig1.lead },
						follow: { vec: tabTriangle0[edgeConfig1.follow], p: edgeConfig1.follow }
					};
					const tabTriangle1: Triangle = alignTriangle(
						facet.tab.footprint[1].triangle,
						alignConfig1
					);
					alignedFacet.tab = generateMultiFacetFullTab(
						{
							...facet.tab.footprint[0],
							triangle: tabTriangle0
						},
						{
							...facet.tab.footprint[1],
							triangle: tabTriangle1
						},
						generateEdgeConfig(flatStripConfig.bandStyle, i % 2 === 0, false, true),
						i % 2 === 0 ? 'lesser' : 'greater',
						tabStyle
					);
				}
			}
		}
		flatStrip.facets.push(alignedFacet);
	});

	if ((flatStrip as Band).sideOrientation === 'inside') {
		flatStrip.facets.forEach((facet) => {
			facet.triangle.a.x = -facet.triangle.a.x;
			facet.triangle.b.x = -facet.triangle.b.x;
			facet.triangle.c.x = -facet.triangle.c.x;
		});
	}

	return flatStrip as T;
};

// Looks up the edge configuration for a given triangle
// "lead" is defined as:
//  the forwardmost vertex of a pair of vertices on the edge of the strip
// "follow" is defined as:
//    when the edge is conjoined with another strip triangle, the "single" vertex on the strip edge
//    when the edge is conjoined with a tab, the rearmost of the pair of vertices

export const generateEdgeConfig = (
	bandStyle: BandStyle,
	isEven: boolean,
	isStrut: boolean,
	isTabEdge: boolean
): EdgeConfig => {
	if (isStrut) {
		if (bandStyle === 'helical-right') {
			if (isEven) return { lead: 'a', follow: 'b' };
			else return { lead: 'c', follow: 'b' };
			// else if (isEven && !isTabEdge) return { lead: 'c', follow: 'b' };
			// else if (!isEven && isTabEdge) return { lead: 'a', follow: 'c' };
			// else return { lead: 'a', follow: 'b' };
		} else throw new Error('Only helical-right struts supported');
	} else {
		if (bandStyle === 'circumference') {
			if (isEven && isTabEdge) return { lead: 'b', follow: 'a' };
			else if (isEven && !isTabEdge) return { lead: 'b', follow: 'c' };
			else if (!isEven && isTabEdge) return { lead: 'a', follow: 'b' };
			else return { lead: 'a', follow: 'c' };
		} else if (bandStyle === 'helical-right') {
			if (isEven && isTabEdge) return { lead: 'c', follow: 'a' };
			else if (isEven && !isTabEdge) return { lead: 'c', follow: 'b' };
			else if (!isEven && isTabEdge) return { lead: 'a', follow: 'c' };
			else return { lead: 'a', follow: 'b' };
		} else {
			if (isEven && isTabEdge) return { lead: 'c', follow: 'b' };
			else if (isEven && !isTabEdge) return { lead: 'c', follow: 'a' };
			else if (!isEven && isTabEdge) return { lead: 'b', follow: 'c' };
			else return { lead: 'b', follow: 'a' };
		}
	}
};

export const applyStrokeWidth = (
	bands: BandCutPattern[],
	{ dynamicStroke, dynamicStrokeMax, dynamicStrokeMin }: DynamicStrokeConfig
): BandCutPattern[] => {
	let patternBands = [...bands];
	const widthVariesByBand = true;

	let maxValue: number;
	let minValue: number;

	if (dynamicStroke === 'quadWidth') {
		const values: number[] = [];
		patternBands.forEach((band) =>
			band.facets.forEach((facet) => {
				if (facet.quadWidth) {
					values.push(facet.quadWidth);
				}
			})
		);
		maxValue = Math.max(...values);
		minValue = Math.min(...values);

		if (!widthVariesByBand && patternBands[0]) {
			const strokeWidthPrototypes = patternBands[0].facets.map((facet: CutPattern) => {
				const ratio = facet.quadWidth ? (facet.quadWidth - minValue) / (maxValue - minValue) : 1;
				return ratio * (dynamicStrokeMax - dynamicStrokeMin) + dynamicStrokeMin;
			});
			patternBands = patternBands.map((band) => ({
				...band,
				facets: band.facets.map((facet: CutPattern, i) => {
					return {
						...facet,
						strokeWidth: strokeWidthPrototypes[i]
					};
				})
			}));
		} else {
			patternBands = patternBands.map((band) => ({
				...band,
				facets: band.facets.map((facet: CutPattern) => {
					const ratio = facet.quadWidth ? (facet.quadWidth - minValue) / (maxValue - minValue) : 1;
					const strokeWidth = ratio * (dynamicStrokeMax - dynamicStrokeMin) + dynamicStrokeMin;
					return {
						...facet,
						strokeWidth
					};
				})
			}));
		}
	}
	return patternBands;
};
