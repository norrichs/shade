import {
	getOtherTriangleElements,
	type TrianglePointPair
} from '$lib/cut-pattern/generate-pattern';
import { getBandTrianglePoints } from '$lib/projection-geometry/generate-projection';
import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';
import type { BandPanelPattern, PanelPattern, ProjectionPanelPattern, TrianglePoint, TubePanelPattern } from '$lib/types';
import { Triangle, Vector3 } from 'three';
import { radToDeg } from 'three/src/math/MathUtils.js';

export type ProjectionDistribution = {
	tubes: {
		bands: {
			panels: {
				x: number;
				y: number;
				angle: number;
			}[];
		}[];
	}[];
};

export type DistributionConfig =
	| { type: 'none' }
	| { type: 'contiguous'; panelOffset?: number, reAlignBands?: boolean }
	| { type: 'spaced' };


export const distributePanels = (
	pattern: ProjectionPanelPattern | { tubes: never[] },
	config: DistributionConfig
): ProjectionPanelPattern => {
	if (config.type === 'contiguous') {
		return {
			...pattern, tubes: getContiguousDistribution2(pattern.tubes, config)
		} as ProjectionPanelPattern;
	}

	return pattern as ProjectionPanelPattern;
};

const DEFAULT_PANEL_OFFSET = 10;
const getContiguousDistribution2 = (tubes: TubePanelPattern[], config?: DistributionConfig & { type: 'contiguous' }): TubePanelPattern[] => {
	const panelOffset = config?.panelOffset ?? DEFAULT_PANEL_OFFSET;
	const reAlignBands = config?.reAlignBands ?? false;

	return tubes.map((tube) => {
		return {
			...tube,
			bands: tube.bands.map((band) => {
				const bandTrianglePoints = getBandTrianglePoints(band.orientation);
				let leadingEdge = {anchor: new Vector3(300, 0, 0), vector: new Vector3(1, 0, 0), p0: bandTrianglePoints[0].base.p0, p1: bandTrianglePoints[0].base.p1};
				const distributedBand = {
					...band,
					panels: band.panels.map((panel, p) => {
						const triangle = redrawTriangle({triangle: panel.triangle, ...leadingEdge});
						leadingEdge = {
							anchor: getTriangleParallelOffset(triangle, [bandTrianglePoints[p % 2].second.p0, bandTrianglePoints[p % 2].second.p1], panelOffset), 
							vector: getEdgeVector(triangle, [bandTrianglePoints[p % 2].second.p0, bandTrianglePoints[p % 2].second.p1]),
							p0: bandTrianglePoints[(p + 1) % 2].base.p1,
							p1: bandTrianglePoints[(p + 1) % 2].base.p0
						}
						return {
							...panel,
							triangle
						};
					})
				};
				if (reAlignBands) {
					const bounds = getMinimalBoundingBoxAndRotationAngle(getAllTrianglePoints(distributedBand));
					const realignedBand = reAlignBand(distributedBand, bounds.rotatedCoordinates);
					realignedBand.bounds = getSimpleBounds(realignedBand);
					if (realignedBand.bounds.left !== 0 || realignedBand.bounds.top !== 0) {
						return normalizeBand(realignedBand);
					}
					return realignedBand;
				}
				
				return distributedBand;
			})
		};
	});
};


 const normalizeBand = (band: BandPanelPattern): BandPanelPattern => {
	const anchor = new Vector3(band.bounds?.left || 0, band.bounds?.top || 0, 0);
	const newPanels = band.panels.map((panel) => {
		return {...panel, triangle: new Triangle(
			panel.triangle.a.clone().sub(anchor),
			panel.triangle.b.clone().sub(anchor),
			panel.triangle.c.clone().sub(anchor))};
		});
		const newBand: BandPanelPattern = {
			...band,
			panels: newPanels
		};
	const newBounds = getSimpleBounds(newBand);
	newBand.bounds = newBounds;
		
	return newBand;
};


const getSimpleBounds = (band: BandPanelPattern): {left: number, top: number, width: number, height: number, center: Vector3} => {
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
	return {left: minX, top: minY, width, height, center};
};

const reAlignBand = (band: BandPanelPattern , rotatedCoordinates: { x: number, y: number }[]): BandPanelPattern => {
	const newBand = {
		...band,
		panels: band.panels.map((panel, panelIndex) => {
			return {
				...panel, triangle: new Triangle(
					new Vector3(rotatedCoordinates[panelIndex * 3].x, rotatedCoordinates[panelIndex * 3].y, 0),
					new Vector3(rotatedCoordinates[panelIndex * 3 + 1].x, rotatedCoordinates[panelIndex * 3 + 1].y, 0),
					new Vector3(rotatedCoordinates[panelIndex * 3 + 2].x, rotatedCoordinates[panelIndex * 3 + 2].y, 0))
			};
		})
	};
	const isAscending = newBand.panels[0].triangle.a.y < newBand.panels[newBand.panels.length - 1].triangle.a.y;
	if (isAscending) {
		newBand.panels = rotatePanels(newBand.panels, Math.PI)
	}
	return newBand;
};

const rotatePanels = (panels: BandPanelPattern['panels'], angle: number) => {
	return panels.map((panel: PanelPattern) => {
		return {
			...panel, triangle: new Triangle(
				panel.triangle.a.clone().applyAxisAngle(Z_AXIS, angle),
				panel.triangle.b.clone().applyAxisAngle(Z_AXIS, angle),
				panel.triangle.c.clone().applyAxisAngle(Z_AXIS, angle)
			)
		};
	});
};


const getTriangleParallelOffset = (triangle: Triangle, points: TrianglePointPair, offset: number) => {
	const anchor = triangle[points[0]].clone()
	const offsetVector = getEdgeVector(triangle, points)
	offsetVector.setLength(offset).applyAxisAngle(Z_AXIS, Math.PI / 2);
	return anchor.addScaledVector(offsetVector, 1);
};


// Redraws a triangle based on an anchor point, a vector, and a triangle point
// The triangle point of the new triangle is on the anchor
// The next point of the triangle has the same length as the orignal triangle edge, but with the direction of the vector
// The last point of the new triangle is derived by rotating a vector from the newly drawn edge by the angle of the second vertex, then setting the length to the length of the original edge

const Z_AXIS = new Vector3(0, 0, 1);

const redrawTriangle = ({triangle, anchor, vector, p0, p1}:
	{triangle: Triangle,
	anchor: Vector3,
	vector: Vector3,
	p0: TrianglePoint,
	p1: TrianglePoint}
) => {
	const normalizedVector = vector.normalize();

	const p2 = getOtherTriangleElements([p0, p1])
 

	const firstEdgeVector = getEdgeVector(triangle, [p0, p1]);
	const secondEdgeVector = getEdgeVector(triangle, [p0, p2]);

	// const angle = firstEdgeVector.angleTo(vector);
	const angle = signedZAxisAngleTo(firstEdgeVector, vector);
	// angle is always going to be positive
	// it should be subtracted from the firstEdgeVector in order to align with `vector`

	const rotatedFirstEdgeVector = firstEdgeVector.clone().applyAxisAngle(Z_AXIS, angle);
	const rotatedSecondEdgeVector = secondEdgeVector.clone().applyAxisAngle(Z_AXIS, angle);

	const newTriangleDef: { [key: string]: Vector3 | undefined } = {
		a: undefined,
		b: undefined,
		c: undefined
	};
	newTriangleDef[p0] = anchor.clone();
	newTriangleDef[p1] = anchor.clone().addScaledVector(rotatedFirstEdgeVector, 1);
	newTriangleDef[p2] = anchor.clone().addScaledVector(rotatedSecondEdgeVector, 1);
	const newTriangle = new Triangle(newTriangleDef.a, newTriangleDef.b, newTriangleDef.c);

	
	return newTriangle;
};

export const rotateVectors = (vectors: Vector3[], angle: number) => {
	return vectors.map((vector) => {
		return vector.clone().applyAxisAngle(Z_AXIS, angle);
	});
}

export const shiftVectors = (vectors: Vector3[], shiftVector: Vector3) => {
	return vectors.map((vector) => {
		return vector.clone().addScaledVector(shiftVector, 1);
	});
}


export const redrawTriangle2 = (triangle: Triangle, shiftVector: Vector3, angle: number, anchorPoint: TrianglePoint): Triangle => {
	const anchor = triangle[anchorPoint].clone();
	const [p1, p2] = getOtherTriangleElements(anchorPoint);
	const newTriangle = new Triangle(
		triangle[anchorPoint].clone(),
		triangle[p1].clone(),
		triangle[p2].clone()
	)
  console.debug('redrawTriangle2', {triangle, shiftVector, angle: radToDeg(angle), anchorPoint, p1, p2})

	// translate the triangle 0,0,0
	newTriangle[anchorPoint] = newTriangle[anchorPoint].addScaledVector(anchor, -1);
	newTriangle[p1] = newTriangle[p1].addScaledVector(anchor, -1);
	newTriangle[p2] = newTriangle[p2].addScaledVector(anchor, -1);



	newTriangle[anchorPoint].applyAxisAngle(Z_AXIS, -angle);
	newTriangle[p2].applyAxisAngle(Z_AXIS, -angle);

	newTriangle[anchorPoint] = newTriangle[anchorPoint].addScaledVector(shiftVector, 1).addScaledVector(anchor, 1);
	newTriangle[p1] = newTriangle[p1].addScaledVector(shiftVector, 1).addScaledVector(anchor, 1);
	newTriangle[p2] = newTriangle[p2].addScaledVector(shiftVector, 1).addScaledVector(anchor, 1);

	return newTriangle;
};




export function signedZAxisAngleTo(u: Vector3, v: Vector3) {
	const angle = u.angleTo(v);
	
	// Handle the case when vectors are exactly opposite (180 degrees)
	// In this case, cross product is zero, so we return π
	if (Math.abs(angle - Math.PI) < 1e-10) {
		return Math.PI;k
	}
	
	const cross = new Vector3().crossVectors(u, v);
	const sign = Math.sign(cross.dot(Z_AXIS));
	return angle * sign;
}


export const getEdgeVector = (triangle: Triangle, points: TrianglePointPair) => {
	const [p0, p1] = points;
	const edgeVector = new Vector3(triangle[p1].x - triangle[p0].x, triangle[p1].y - triangle[p0].y, triangle[p1].z - triangle[p0].z);
	return edgeVector;
};

/**
 * Finds the intersection point of two lines defined by points on those lines
 * @param line1Point1 First point on line 1
 * @param line1Point2 Second point on line 1
 * @param line2Point1 First point on line 2
 * @param line2Point2 Second point on line 2
 * @returns The intersection point, or null if lines are parallel
 */
export const findLineIntersection = (
	line1: { v0: Vector3, v1: Vector3 },
	line2: { v0: Vector3, v1: Vector3 }
): Vector3 | null => {
	const x1 = line1.v0.x;
	const y1 = line1.v0.y;
	const x2 = line1.v1.x;
	const y2 = line1.v1.y;
	const x3 = line2.v0.x;
	const y3 = line2.v0.y;
	const x4 = line2.v1.x;
	const y4 = line2.v1.y;

	// Calculate the denominator for the intersection formula
	const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

	// If denominator is 0, lines are parallel
	if (Math.abs(denominator) < 1e-10) {
		return null;
	}

	// Calculate intersection point using parametric line intersection formula
	const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
	
	const intersectionX = x1 + t * (x2 - x1);
	const intersectionY = y1 + t * (y2 - y1);

	return new Vector3(intersectionX, intersectionY, 0);
};



export const getTransform = (
	distribution: null | ProjectionDistribution,
	address: GlobuleAddress_Facet
): string => {
	const panelDistribution =
		distribution?.tubes[address.tube].bands[address.band].panels[address.facet];
	if (panelDistribution) {
		const { x, y, angle } = panelDistribution;
		return `translate(${x}, ${y}) rotate(${angle})`;
	}
	return '';
};

export const getBandTransforms = (tubes: TubePanelPattern[]) => {
	return {tubes: tubes.map((tube) => ({
		bands: tube.bands.map((band) => getBandTransform(band))
	}))}
};

const getBandTransform = (band: BandPanelPattern) => {
	const firstPanel = band.panels[0];
	const lastPanel = band.panels[band.panels.length - 1];
	const firstPanelCenter = new Vector3();
	const lastPanelCenter = new Vector3();
	firstPanel.triangle.getMidpoint(firstPanelCenter);
	lastPanel.triangle.getMidpoint(lastPanelCenter);
	const vector = lastPanelCenter.clone().addScaledVector(firstPanelCenter, -1);
	const angle = vector.angleTo(new Vector3(0, 1, 0));
	return {x: 0, y: 0, angle: radToDeg(angle)};
}

export const getBandSlopeVector = (band: BandPanelPattern) => {
	const points = getAllTrianglePoints(band);
	return findSlopeVectorByLeastSquares(points);
}


type GenericBand = {panels?: {triangle: Triangle}[], facets?: {triangle: Triangle}[]}
export const getAllTrianglePoints = (band: GenericBand): Vector3[] => {
	const points: Vector3[] = [];
	(band.panels || band.facets || []).forEach((panel) => {
		points.push(panel.triangle.a);
		points.push(panel.triangle.b);
		points.push(panel.triangle.c);
	});
	return points;
}

const findSlopeVectorByLeastSquares = (points: Vector3[]) => {
	const values_x = points.map((point) => point.x);
	const values_y = points.map((point) => point.y);

	let x_sum = 0;
	let y_sum = 0;
	let xy_sum = 0;
	let xx_sum = 0;
	let count = 0;

	
	let x = 0;
	let y = 0;
	let values_length = values_x.length;

	for (let i = 0; i< values_length; i++) {
			x = values_x[i];
			y = values_y[i];
			x_sum+= x;
			y_sum+= y;
			xx_sum += x*x;
			xy_sum += x*y;
			count++;
	}

	let m = (count*xy_sum - x_sum*y_sum) / (count*xx_sum - x_sum*x_sum);
	let b = (y_sum / count) - (m * x_sum) / count;
	
	const vector = new Vector3(1, m, 0)
	return vector


	/*
	 * We then return the x and y data points according to our fit
	 */
	// var result_values_x = [];
	// var result_values_y = [];

	// for (let i = 0; i < values_length; i++) {
	// 		x = values_x[i];
	// 		y = x * m + b;
	// 		result_values_x.push(x);
	// 		result_values_y.push(y);
	// }

	// return [result_values_x, result_values_y];
}

export const getBounds = (pattern: TubePanelPattern[]): { bands: { angle: number, width: number, height: number, averageX: number, averageY: number }[] }[] => {
	const bounds = pattern.map((tube) => ({
		bands: tube.bands.map((band) => getMinimalBoundingBoxAndRotationAngle(getAllTrianglePoints(band)))
	}));

	return bounds;
}

export const getMinimalBoundingBoxAndRotationAngle = (points: Vector3[]): {
	angle: number,
	width: number, height: number, averageX: number, averageY: number, rotatedCoordinates: { x: number, y: number }[]
} => {

	
	if (points.length === 0) {
		return { angle: 0, width: 0, height: 0, averageX: 0, averageY: 0, rotatedCoordinates: [] };
	}
	
	// Test multiple rotation angles to find the one that gives minimal width
	let minWidth = Infinity;
	let bestAngle = 0;
	let bestHeight = 0;
	let bestAverageX = 0;
	let bestAverageY = 0;
	let bestRotatedCoordinates: { x: number, y: number }[] = [];
	// Test angles from 0 to π (180 degrees) in small increments
	const angleStep = Math.PI / 180; // 1 degree steps
	
	for (let angle = 0; angle < Math.PI; angle += angleStep) {
		const { width, height, averageX, averageY, rotatedCoordinates } = getBoundingBoxAtAngle(points, angle);
		
		if (width < minWidth) {
			minWidth = width;
			bestAngle = angle;
			bestHeight = height;
			bestAverageX = averageX;
			bestAverageY = averageY;
			bestRotatedCoordinates = rotatedCoordinates;
		}
	}

	return { angle: bestAngle, width: minWidth, height: bestHeight, averageX: bestAverageX, averageY: bestAverageY, rotatedCoordinates: bestRotatedCoordinates };
}

// Helper function to calculate bounding box dimensions at a specific rotation angle
const getBoundingBoxAtAngle = (points: Vector3[], angle: number): {
	width: number, height: number, averageX: number, averageY: number, rotatedCoordinates: { x: number, y: number }[]
} => {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	let averageX = 0
	let averageY = 0
	// Rotate each point and find the axis-aligned bounding box in the rotated space

	const rotatedCoordinates = points.map((point) => {
		const rotatedX = point.x * cos - point.y * sin;
		const rotatedY = point.x * sin + point.y * cos;
		return { x: rotatedX, y: rotatedY }
	});

	rotatedCoordinates.forEach((coordinate) => {
		minX = Math.min(minX, coordinate.x);
		maxX = Math.max(maxX, coordinate.x);
		minY = Math.min(minY, coordinate.y);
		maxY = Math.max(maxY, coordinate.y);
	});

	averageX = getAverage(rotatedCoordinates.map((coordinate) => coordinate.x));
	averageY = getAverage(rotatedCoordinates.map((coordinate) => coordinate.y));
	
	return {
		rotatedCoordinates,
		width: maxX - minX,
		height: maxY - minY,
		averageX,
		averageY
	};
}

const getAverage = (values: number[]) => {
	return values.reduce((acc, value) => acc + value, 0) / values.length;
}

