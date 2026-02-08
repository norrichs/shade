import { generateTempId } from '$lib/id-handler';
import type { Point3 } from '$lib/types';
import { defaultEdgeConfig } from './curve-definitions';

import type {
	CurveIndex,
	EdgeConfig,
	LevelIndex,
	PointIndex,
	PolygonConfig,
	PolyhedronConfig,
	ProjectorConfig,
	VertexIndex,
	VerticesConfig
} from './types';

export type PolygonType =
	| 'pentagon'
	| 'hexagon'
	| 'triangle'
	| 'quadrilateral'
	| 'decagon'
	| 'dodecagon';

export type PolygonMapRow = {
	polygonType: PolygonType;
	count: number;
	levels?: number[];
	directions?: (1 | 0 | -1)[];
	sequence: [LevelIndex, PointIndex][];
};

export type PolarVertex = {
	r: number;
	theta: number;
	x: number;
	y: number;
	z: number;
	vertexIndex: number;
};

// export const polygonTypeDefinitions: Record<PolygonType, { edgeCount: number }> = {
// 	triangle: { edgeCount: 3 },
// 	quadrilateral: { edgeCount: 4 },
// 	pentagon: { edgeCount: 5 },
// 	hexagon: { edgeCount: 6 }
// };

export const getPolarVertices = (
	vertices: VerticesConfig,
	precision: number = 0.00001
): PolarVertex[] => {
	const polarVertices = vertices
		.map((vertex, vertexIndex) => {
			const polarVertex = {
				...vertex,
				r: Math.sqrt(vertex.x ** 2 + vertex.y ** 2),
				theta: Math.atan2(vertex.y, vertex.x) + Math.PI, // Add Math.PI to make all theta values positive
				vertexIndex
			} as PolarVertex;
			if (Math.abs(polarVertex.theta - Math.PI * 2) < precision) {
				polarVertex.theta = 0;
			}
			return polarVertex;
		})
		.sort((a, b) => {
			const diff = a.z - b.z;
			if (Math.abs(diff) < precision) {
				return a.theta - b.theta;
			}
			return diff;
		});
	if (polarVertices.some((v) => v.theta < 0)) {
		throw new Error('Some theta values are negative');
	}
	return polarVertices;
};

export const applyDirectionMatching = (
	polygons: PolygonConfig<undefined, VertexIndex, CurveIndex, CurveIndex>[]
): PolygonConfig<undefined, VertexIndex, CurveIndex, CurveIndex>[] => {
	// Create a map to store edges by their vertex pairs
	// Key format: "min,max" where min and max are the sorted vertex indices
	// Value: array of {polygonIndex, edgeIndex, vertex0, vertex1}
	const edgeMap = new Map<
		string,
		{ polygonIndex: number; edgeIndex: number; vertex0: VertexIndex; vertex1: VertexIndex }[]
	>();

	// Build the edge map
	polygons.forEach((polygon, polygonIndex) => {
		polygon.edges.forEach((edge, edgeIndex) => {
			// vertex0 is the vertex1 of the previous edge
			const vertex0 =
				edgeIndex === 0
					? polygon.edges[polygon.edges.length - 1].vertex1
					: polygon.edges[edgeIndex - 1].vertex1;
			const vertex1 = edge.vertex1;

			// Create a key using sorted vertices to match edges regardless of direction
			const key = [vertex0, vertex1].sort((a, b) => a - b).join(',');

			if (!edgeMap.has(key)) {
				edgeMap.set(key, []);
			}
			edgeMap.get(key)!.push({ polygonIndex, edgeIndex, vertex0, vertex1 });
		});
	});

	// Apply direction matching flags
	edgeMap.forEach((edgeList) => {
		// Each edge should have exactly 2 partners in a closed polyhedron
		if (edgeList.length === 2) {
			const [edge1, edge2] = edgeList;

			// Check if directions match
			// Directions match if both edges go from the same vertex to the same vertex
			// (not if they're opposites)
			const directionsMatch = edge1.vertex0 === edge2.vertex0 && edge1.vertex1 === edge2.vertex1;

			if (!directionsMatch) {
				// Add isDirectionMatched: false to the edge in the polygon with higher index
				const higherPolygonEdge = edge1.polygonIndex > edge2.polygonIndex ? edge1 : edge2;
				polygons[higherPolygonEdge.polygonIndex].edges[
					higherPolygonEdge.edgeIndex
				].isDirectionMatched = false;
			}
		}
	});

	return polygons;
};

export const getPolygonEdgesFromSequence = ({
	row,
	polygonIndex,
	levels,
	standardEdgeConfig,
	radialSymmetry = 5
}: {
	row: PolygonMapRow;
	levels: PolarVertex[][];
	standardEdgeConfig: EdgeConfig<undefined, number, number, number>;
	polygonIndex: number;
	radialSymmetry?: number;
}): EdgeConfig<undefined, number, number, number>[] => {
	const { sequence } = row;
	let edges: EdgeConfig<undefined, number, number, number>[] = [];
	sequence.forEach(([levelIndex, pointIndex]) => {
		const pointIndexOffset = polygonIndex * (levels[levelIndex].length / row.count); // 5 is the radial symmetry.  Some rows have 5 points, some 10

		let actualPointIndex = pointIndex + pointIndexOffset;
		actualPointIndex =
			actualPointIndex < 0 ? levels[levelIndex].length + actualPointIndex : actualPointIndex;
		actualPointIndex = actualPointIndex % levels[levelIndex].length;
		edges.push({
			...standardEdgeConfig,
			vertex1: levels[levelIndex][actualPointIndex].vertexIndex
		});
	});
	return edges;
};

export const generateProjectorConfig = (
	polyhedron: PolyhedronConfig<undefined, VertexIndex, CurveIndex, CurveIndex>
) => {
	return {
		name: polyhedron.name,
		id: generateTempId('cfg'),
		polyhedron
	};
};
// 	[key: string]: ProjectorConfig<undefined, VertexIndex, CurveIndex, CurveIndex>;
// } = {
// 	icosohedron: {
// 		name: 'Icosohedron',
// 		id: generateTempId('cfg'),
// 		polyhedron: {
// 			name: 'defaultTetrahedron',
// 			id: generateTempId('cfg'),
// 			crossSectionCurves: [defaultCrossSection],
// 			edgeCurves: [secondEdgeCurveConfig],
// 			vertices: icosohedron,
// 			transform: 'inherit',
// 			polygons: [
// 				{
// 					name: 'triangle1',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 0 },
// 						{ ...defaultEdgeConfig, vertex1: 1, isDirectionMatched: false },
// 						{ ...defaultEdgeConfig, vertex1: 2 }
// 					]
// 				},
// 				{
// 					name: 'triangle2',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 0 },
// 						{ ...defaultEdgeConfig, vertex1: 2, isDirectionMatched: false },
// 						{ ...defaultEdgeConfig, vertex1: 3 }
// 					]
// 				},
// 				{
// 					name: 'triangle3',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 0 },
// 						{ ...defaultEdgeConfig, vertex1: 3, isDirectionMatched: false },
// 						{ ...defaultEdgeConfig, vertex1: 4 }
// 					]
// 				},
// 				{
// 					name: 'triangle4',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 0 },
// 						{ ...defaultEdgeConfig, vertex1: 4, isDirectionMatched: false },
// 						{ ...defaultEdgeConfig, vertex1: 5 }
// 					]
// 				},
// 				{
// 					name: 'triangle5',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 0 },
// 						{ ...defaultEdgeConfig, vertex1: 5, isDirectionMatched: false },
// 						{ ...defaultEdgeConfig, vertex1: 1 }
// 					]
// 				},
// 				{
// 					name: 'triangle6',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 1 },
// 						{ ...defaultEdgeConfig, vertex1: 2 },
// 						{ ...defaultEdgeConfig, vertex1: 9 }
// 					]
// 				},
// 				{
// 					name: 'triangle7',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 2 },
// 						{ ...defaultEdgeConfig, vertex1: 3 },
// 						{ ...defaultEdgeConfig, vertex1: 10 }
// 					]
// 				},
// 				{
// 					name: 'triangle8',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 3 },
// 						{ ...defaultEdgeConfig, vertex1: 4 },
// 						{ ...defaultEdgeConfig, vertex1: 6 }
// 					]
// 				},
// 				{
// 					name: 'triangle9',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 4 },
// 						{ ...defaultEdgeConfig, vertex1: 5 },
// 						{ ...defaultEdgeConfig, vertex1: 7 }
// 					]
// 				},
// 				{
// 					name: 'triangle10',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 5 },
// 						{ ...defaultEdgeConfig, vertex1: 1 },
// 						{ ...defaultEdgeConfig, vertex1: 8 }
// 					]
// 				},
// 				{
// 					name: 'triangle11',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 9 },
// 						{ ...defaultEdgeConfig, vertex1: 10 },
// 						{ ...defaultEdgeConfig, vertex1: 2 }
// 					]
// 				},
// 				{
// 					name: 'triangle12',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 10 },
// 						{ ...defaultEdgeConfig, vertex1: 6 },
// 						{ ...defaultEdgeConfig, vertex1: 3 }
// 					]
// 				},
// 				{
// 					name: 'triangle13',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 6 },
// 						{ ...defaultEdgeConfig, vertex1: 7 },
// 						{ ...defaultEdgeConfig, vertex1: 4 }
// 					]
// 				},
// 				{
// 					name: 'triangle14',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 7 },
// 						{ ...defaultEdgeConfig, vertex1: 8 },
// 						{ ...defaultEdgeConfig, vertex1: 5 }
// 					]
// 				},
// 				{
// 					name: 'triangle15',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 8 },
// 						{ ...defaultEdgeConfig, vertex1: 9 },
// 						{ ...defaultEdgeConfig, vertex1: 1 }
// 					]
// 				},
// 				{
// 					name: 'triangle16',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 9, isDirectionMatched: false },
// 						{ ...defaultEdgeConfig, vertex1: 10 },
// 						{ ...defaultEdgeConfig, vertex1: 11 }
// 					]
// 				},
// 				{
// 					name: 'triangle17',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 10, isDirectionMatched: false },
// 						{ ...defaultEdgeConfig, vertex1: 6 },
// 						{ ...defaultEdgeConfig, vertex1: 11 }
// 					]
// 				},
// 				{
// 					name: 'triangle18',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 6, isDirectionMatched: false },
// 						{ ...defaultEdgeConfig, vertex1: 7 },
// 						{ ...defaultEdgeConfig, vertex1: 11 }
// 					]
// 				},
// 				{
// 					name: 'triangle19',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 7, isDirectionMatched: false },
// 						{ ...defaultEdgeConfig, vertex1: 8 },
// 						{ ...defaultEdgeConfig, vertex1: 11 }
// 					]
// 				},
// 				{
// 					name: 'triangle20',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 8, isDirectionMatched: false },
// 						{ ...defaultEdgeConfig, vertex1: 9 },
// 						{ ...defaultEdgeConfig, vertex1: 11 }
// 					]
// 				}
// 			]
// 		}
// 	},
// 	tetrahedron: {
// 		name: 'Tetrahedron',
// 		id: generateTempId('cfg'),
// 		polyhedron: {
// 			name: 'defaultTetrahedron',
// 			id: generateTempId('cfg'),
// 			// sampleMethod: defaultEdgeSampleMethod,
// 			crossSectionCurves: [defaultCrossSection],
// 			edgeCurves: [defaultEdgeCurveConfig],
// 			vertices: pTetrahedron,
// 			transform: 'inherit',
// 			polygons: [
// 				{
// 					name: 'triangle0',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 0 },
// 						{ ...defaultEdgeConfig, vertex1: 2 },
// 						{ ...defaultEdgeConfig, vertex1: 1 }
// 					]
// 				},
// 				{
// 					name: 'triangle1',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 0 },
// 						{ ...defaultEdgeConfig, vertex1: 3, isDirectionMatched: false },
// 						{ ...defaultEdgeConfig, vertex1: 1 }
// 					]
// 				},
// 				{
// 					name: 'triangle2',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 0 },
// 						{ ...defaultEdgeConfig, vertex1: 2 },
// 						{ ...defaultEdgeConfig, vertex1: 3, isDirectionMatched: false }
// 					]
// 				},
// 				{
// 					name: 'triangle3',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 3, isDirectionMatched: false },
// 						{ ...defaultEdgeConfig, vertex1: 2 },
// 						{ ...defaultEdgeConfig, vertex1: 1 }
// 					]
// 				}
// 			]
// 		}
// 	},
// 	cube: {
// 		name: 'Cube',
// 		id: generateTempId('cfg'),
// 		polyhedron: {
// 			name: 'defaultCube',
// 			id: generateTempId('cfg'),
// 			crossSectionCurves: [defaultCrossSection],
// 			edgeCurves: [secondEdgeCurveConfig],
// 			vertices: pSquare,
// 			transform: 'inherit',
// 			polygons: [
// 				{
// 					name: 'square1',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 0 },
// 						{ ...defaultEdgeConfig, vertex1: 1 },
// 						{ ...defaultEdgeConfig, vertex1: 2 },
// 						{ ...defaultEdgeConfig, vertex1: 3 }
// 					]
// 				},
// 				{
// 					name: 'square2',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 0, isDirectionMatched: false },
// 						{ ...defaultEdgeConfig, vertex1: 1 },
// 						{ ...defaultEdgeConfig, vertex1: 5 },
// 						{ ...defaultEdgeConfig, vertex1: 4 }
// 					]
// 				},
// 				{
// 					name: 'square3',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 1, isDirectionMatched: false },
// 						{ ...defaultEdgeConfig, vertex1: 2 },
// 						{ ...defaultEdgeConfig, vertex1: 6 },
// 						{ ...defaultEdgeConfig, vertex1: 5 }
// 					]
// 				},
// 				{
// 					name: 'square4',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 2, isDirectionMatched: false },
// 						{ ...defaultEdgeConfig, vertex1: 3 },
// 						{ ...defaultEdgeConfig, vertex1: 7 },
// 						{ ...defaultEdgeConfig, vertex1: 6 }
// 					]
// 				},
// 				{
// 					name: 'square5',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 3, isDirectionMatched: false },
// 						{ ...defaultEdgeConfig, vertex1: 0 },
// 						{ ...defaultEdgeConfig, vertex1: 4 },
// 						{ ...defaultEdgeConfig, vertex1: 7 }
// 					]
// 				},
// 				{
// 					name: 'square6',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{ ...defaultEdgeConfig, vertex1: 7 },
// 						{ ...defaultEdgeConfig, vertex1: 6 },
// 						{ ...defaultEdgeConfig, vertex1: 5 },
// 						{ ...defaultEdgeConfig, vertex1: 4 }
// 					]
// 				}
// 			]
// 		}
// 	},
// 	// poly60dodeca: {
// 	// 	name: 'Poy 60 Dodecahedron',
// 	// 	id: generateTempId('cfg'),
// 	// 	polyhedron: {
// 	// 		name: 'defaultCube',
// 	// 		id: generateTempId('cfg'),
// 	// 		crossSectionCurves: [defaultCrossSection],
// 	// 		edgeCurves: [defaultEdgeCurveConfig, secondEdgeCurveConfig],
// 	// 		vertices: p60Dodeca,
// 	// 		transform: 'inherit',
// 	// 		polygons: [
// 	// 			{
// 	// 				name: 'pentagon1',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 1, widthCurve: 1 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 2, widthCurve: 1 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 3, widthCurve: 1 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 4, widthCurve: 1 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 5, widthCurve: 1 }
// 	// 				]
// 	// 			},
// 	// 			// {
// 	// 			// 	name: 'square1',
// 	// 			// 	id: generateTempId('cfg'),
// 	// 			// 	edges: [
// 	// 			// 		{ ...defaultEdgeConfig, vertex1: 0 },
// 	// 			// 		{ ...defaultEdgeConfig, vertex1: 1, isDirectionMatched: false },
// 	// 			// 		{ ...defaultEdgeConfig, vertex1: 2 }
// 	// 			// 	]
// 	// 			// },
// 	// 			// {
// 	// 			// 	name: 'square2',
// 	// 			// 	id: generateTempId('cfg'),
// 	// 			// 	edges: [
// 	// 			// 		{ ...defaultEdgeConfig, vertex1: 0 },
// 	// 			// 		{ ...defaultEdgeConfig, vertex1: 2, isDirectionMatched: false },
// 	// 			// 		{ ...defaultEdgeConfig, vertex1: 3 }
// 	// 			// 	]
// 	// 			// },
// 	// 			// {
// 	// 			// 	name: 'square3',
// 	// 			// 	id: generateTempId('cfg'),
// 	// 			// 	edges: [
// 	// 			// 		{ ...defaultEdgeConfig, vertex1: 0 },
// 	// 			// 		{ ...defaultEdgeConfig, vertex1: 3, isDirectionMatched: false },
// 	// 			// 		{ ...defaultEdgeConfig, vertex1: 4 }
// 	// 			// 	]
// 	// 			// },
// 	// 			// {
// 	// 			// 	name: 'square4',
// 	// 			// 	id: generateTempId('cfg'),
// 	// 			// 	edges: [
// 	// 			// 		{ ...defaultEdgeConfig, vertex1: 0 },
// 	// 			// 		{ ...defaultEdgeConfig, vertex1: 4, isDirectionMatched: false },
// 	// 			// 		{ ...defaultEdgeConfig, vertex1: 5 }
// 	// 			// 	]
// 	// 			// },
// 	// 			// {
// 	// 			// 	name: 'square5',
// 	// 			// 	id: generateTempId('cfg'),
// 	// 			// 	edges: [
// 	// 			// 		{ ...defaultEdgeConfig, vertex1: 0 },
// 	// 			// 		{ ...defaultEdgeConfig, vertex1: 5, isDirectionMatched: false },
// 	// 			// 		{ ...defaultEdgeConfig, vertex1: 1 }
// 	// 			// 	]
// 	// 			// },
// 	// 			{
// 	// 				name: 'square6',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 1, widthCurve: 1 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 5, widthCurve: 1, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 6, widthCurve: 1 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square7',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 2, widthCurve: 1 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 1, widthCurve: 1, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 7, widthCurve: 1 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square8',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 3, widthCurve: 1 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 2, widthCurve: 1, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 8, widthCurve: 1 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square9',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 4, widthCurve: 1 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 3, widthCurve: 1, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 9, widthCurve: 1 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square10',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 5, widthCurve: 1 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 4, widthCurve: 1, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 10, widthCurve: 1 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square11',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 1 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 6, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 11 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square12',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 1, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 11, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 7 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square13',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 2 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 7, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 12 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square14',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 2, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 12, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 8 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square15',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 3 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 8, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 13 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square16',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 3, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 13, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 9 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square17',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 4 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 9, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 14 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square18',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 4, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 14, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 10 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square19',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 5 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 10, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 15 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square20',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 5, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 15, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 6 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square21',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 6 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 15, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 16 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square22',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 6, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 16, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 11 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square23',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 7 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 11, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 17 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square24',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 7, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 17, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 12 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square25',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 8 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 12, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 18 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square26',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 8, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 18, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 13 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square27',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 9 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 13, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 19 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square28',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 9, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 19, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 14 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square29',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 10 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 14, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 20 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square30',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 10, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 20, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 15 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square31',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 14, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 19, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 24 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square32',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 14, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 24 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 20 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square33',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 15, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 20, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 25 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square34',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 15, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 25 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 16 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square35',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 11, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 16, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 21 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square36',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 11, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 21 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 17 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square37',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 12, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 17, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 22 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square38',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 12, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 22 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 18 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square39',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 13, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 18, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 23 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square40',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 13, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 23 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 19 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square41',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 17, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 21, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 27 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square42',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 17, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 27 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 22 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square43',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 18, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 22, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 28 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square44',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 18, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 28 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 23 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square45',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 19, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 23, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 29 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square46',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 19, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 29 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 24 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square47',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 20, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 24, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 30 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square48',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 20, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 30 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 25 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square49',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 16, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 25, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 26 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square50',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 16, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 26 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 21 }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square51',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 21, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 26, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 27, isDirectionMatched: false }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square52',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 22, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 27, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 28, isDirectionMatched: false }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square53',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 23, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 28, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 29, isDirectionMatched: false }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square54',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 24, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 29, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 30, isDirectionMatched: false }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square55',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 25, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 30, isDirectionMatched: false },
// 	// 					{ ...defaultEdgeConfig, vertex1: 26, isDirectionMatched: false }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square56',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 26 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 31 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 27, isDirectionMatched: false }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square57',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 27 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 31 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 28, isDirectionMatched: false }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square58',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 28 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 31 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 29, isDirectionMatched: false }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square59',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 29 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 31 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 30, isDirectionMatched: false }
// 	// 				]
// 	// 			},
// 	// 			{
// 	// 				name: 'square60',
// 	// 				id: generateTempId('cfg'),
// 	// 				edges: [
// 	// 					{ ...defaultEdgeConfig, vertex1: 30 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 31 },
// 	// 					{ ...defaultEdgeConfig, vertex1: 26, isDirectionMatched: false }
// 	// 				]
// 	// 			}
// 	// 		]
// 	// 	}
// 	// }
// };

export function convertXYZtoVertices(
	xyz: string,
	scaleFactor: number = 1,
	adjustZToCenter: boolean = false
): VerticesConfig {
	let vertices = xyz.split('\n').map((line, i) => {
		const coords = line.split(' ').map(Number);
		return {
			x: coords[0] * scaleFactor,
			y: coords[1] * scaleFactor,
			z: coords[2] * scaleFactor
		} as Point3;
	});

	if (adjustZToCenter) {
		const minZ = Math.min(...vertices.map((v) => v.z));
		const maxZ = Math.max(...vertices.map((v) => v.z));
		const centerZ = (minZ + maxZ) / 2;
		vertices = vertices.map((v) => ({ ...v, z: v.z - centerZ }));
	}

	vertices = vertices.sort((a, b) => {
		return a.z - b.z;
	});
	return vertices;
}

export function groupIntoLevels(
	polarVertices: PolarVertex[],
	zTolerance: number = 0.0000001
): PolarVertex[][] {
	const levels: PolarVertex[][] = [];
	polarVertices.forEach((vertex) => {
		const existingLevel = levels.find(
			(level) => level.length > 0 && Math.abs(level[0].z - vertex.z) < zTolerance
		);
		if (existingLevel) {
			existingLevel.push(vertex);
		} else {
			levels.push([vertex]);
		}
	});
	return levels;
}

// --- Shared helpers for polygon map computation ---

function buildVertexToLevelMap(levels: PolarVertex[][]): Map<number, [LevelIndex, PointIndex]> {
	const vertexToLevel = new Map<number, [LevelIndex, PointIndex]>();
	levels.forEach((level, levelIndex) => {
		level.forEach((v, pointIndex) => {
			vertexToLevel.set(v.vertexIndex, [levelIndex, pointIndex]);
		});
	});
	return vertexToLevel;
}

function buildAdjacencyGraph(polarVertices: PolarVertex[]): {
	adjacency: Map<number, Set<number>>;
	edgeThreshold: number;
} {
	const distances: number[] = [];
	for (let i = 0; i < polarVertices.length; i++) {
		for (let j = i + 1; j < polarVertices.length; j++) {
			const a = polarVertices[i];
			const b = polarVertices[j];
			const d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
			distances.push(d);
		}
	}
	distances.sort((a, b) => a - b);

	const edgeThreshold = findEdgeThreshold(distances);

	const adjacency = new Map<number, Set<number>>();
	for (const pv of polarVertices) {
		adjacency.set(pv.vertexIndex, new Set());
	}
	for (let i = 0; i < polarVertices.length; i++) {
		for (let j = i + 1; j < polarVertices.length; j++) {
			const a = polarVertices[i];
			const b = polarVertices[j];
			const d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
			if (d <= edgeThreshold) {
				adjacency.get(a.vertexIndex)!.add(b.vertexIndex);
				adjacency.get(b.vertexIndex)!.add(a.vertexIndex);
			}
		}
	}

	return { adjacency, edgeThreshold };
}

/**
 * Tries rotational symmetry counts for a face's [level, point] sequence.
 * Returns the best count and marks rotated copies as grouped.
 *
 * @param sequence - The face's vertex sequence as [levelIndex, pointIndex] pairs
 * @param levels - All levels of the polyhedron
 * @param allFaceVertexSets - Set of sorted vertex-index strings for all faces
 * @param allFaces - Array of all faces as vertex index arrays (for finding indices to mark grouped)
 * @param radialSymmetry - The base radial symmetry to try
 * @param grouped - Set of face indices already grouped (mutated)
 * @returns The symmetry count found
 */
function groupByRotationalSymmetry({
	sequence,
	levels,
	allFaceVertexSets,
	allFaces,
	radialSymmetry,
	grouped
}: {
	sequence: [LevelIndex, PointIndex][];
	levels: PolarVertex[][];
	allFaceVertexSets: Set<string>;
	allFaces: number[][];
	radialSymmetry: number;
	grouped: Set<number>;
}): number {
	const countsToTry = [radialSymmetry, radialSymmetry * 2];
	let bestCount = 1;

	for (const count of countsToTry) {
		const allDivisible = sequence.every(([levelIndex]) => levels[levelIndex].length % count === 0);
		if (!allDivisible) continue;

		// Collect all rotated copy keys (including k=0) and check they all exist
		const rotatedKeys: string[] = [];
		let allExist = true;
		for (let k = 0; k < count; k++) {
			const rotatedVertexIndices: number[] = [];
			for (const [levelIndex, pointIndex] of sequence) {
				const levelSize = levels[levelIndex].length;
				const step = levelSize / count;
				let rotatedPointIndex = pointIndex + k * step;
				rotatedPointIndex =
					rotatedPointIndex < 0 ? levelSize + rotatedPointIndex : rotatedPointIndex % levelSize;
				rotatedVertexIndices.push(levels[levelIndex][rotatedPointIndex].vertexIndex);
			}
			const key = [...rotatedVertexIndices].sort((a, b) => a - b).join(',');
			if (!allFaceVertexSets.has(key)) {
				allExist = false;
				break;
			}
			rotatedKeys.push(key);
		}
		if (!allExist) continue;

		// Count distinct rotated copies — if a face is invariant under rotation,
		// all copies map to the same vertex set, so the true count is fewer
		const distinctKeys = new Set(rotatedKeys);
		const distinctCount = distinctKeys.size;

		if (distinctCount > 1) {
			bestCount = distinctCount;
			break;
		}
	}

	// Mark all rotated copies as grouped
	for (let k = 0; k < bestCount; k++) {
		const rotatedVertexIndices: number[] = [];
		for (const [levelIndex, pointIndex] of sequence) {
			const levelSize = levels[levelIndex].length;
			const step = levelSize / bestCount;
			let rotatedPointIndex = pointIndex + k * step;
			rotatedPointIndex =
				rotatedPointIndex < 0 ? levelSize + rotatedPointIndex : rotatedPointIndex % levelSize;
			rotatedVertexIndices.push(levels[levelIndex][rotatedPointIndex].vertexIndex);
		}
		const key = [...rotatedVertexIndices].sort((a, b) => a - b).join(',');
		for (let fj = 0; fj < allFaces.length; fj++) {
			const fjKey = [...allFaces[fj]].sort((a, b) => a - b).join(',');
			if (fjKey === key) {
				grouped.add(fj);
				break;
			}
		}
	}

	return bestCount;
}

function sortPolygonMapRows(rows: PolygonMapRow[]): PolygonMapRow[] {
	return rows.sort((a, b) => {
		const aMinLevel = Math.min(...a.sequence.map(([l]) => l));
		const bMinLevel = Math.min(...b.sequence.map(([l]) => l));
		if (aMinLevel !== bMinLevel) return aMinLevel - bMinLevel;

		const aMaxLevel = Math.max(...a.sequence.map(([l]) => l));
		const bMaxLevel = Math.max(...b.sequence.map(([l]) => l));
		if (aMaxLevel !== bMaxLevel) return aMaxLevel - bMaxLevel;

		return a.sequence[0][1] - b.sequence[0][1];
	});
}

// --- End shared helpers ---

/**
 * Automatically computes a PolygonMapRow[] for all-triangle polyhedra.
 * Only handles polyhedra where every face is a triangle (e.g. geodesic spheres, icosahedra).
 * Mixed-polygon models (fullerene, truncated icosahedra) need computeMixedPolygonMap instead.
 */
export function computeTrianglePolygonMap({
	vertices,
	radialSymmetry = 5
}: {
	vertices: VerticesConfig;
	radialSymmetry?: number;
}): PolygonMapRow[] {
	const polarVertices = getPolarVertices(vertices);
	const levels = groupIntoLevels(polarVertices);
	const vertexToLevel = buildVertexToLevelMap(levels);
	const { adjacency } = buildAdjacencyGraph(polarVertices);

	// Find all triangles: for each edge (vi, vj), find common neighbors vk
	const sortedVertexIndices = [...adjacency.keys()].sort((a, b) => a - b);
	const triangleSet = new Set<string>();
	const triangles: [number, number, number][] = [];

	for (const vi of sortedVertexIndices) {
		const neighborsI = adjacency.get(vi)!;
		for (const vj of neighborsI) {
			if (vj <= vi) continue;
			const neighborsJ = adjacency.get(vj)!;
			for (const vk of neighborsJ) {
				if (vk <= vj) continue;
				if (neighborsI.has(vk)) {
					const key = `${vi},${vj},${vk}`;
					if (!triangleSet.has(key)) {
						triangleSet.add(key);
						triangles.push([vi, vj, vk]);
					}
				}
			}
		}
	}

	// Validate triangle count using Euler formula: F = 2V - 4 for genus-0 all-triangle
	const expectedTriangles = 2 * vertices.length - 4;
	if (triangles.length !== expectedTriangles) {
		throw new Error(
			`computeTrianglePolygonMap: expected ${expectedTriangles} triangles but found ${triangles.length}`
		);
	}

	// Convert triangles from vertexIndex to [levelIndex, pointIndex]
	type LevelPoint = [number, number]; // [levelIndex, pointIndex]
	const trianglesAsLevelPoints: [LevelPoint, LevelPoint, LevelPoint][] = triangles.map(
		([vi, vj, vk]) => {
			return [vertexToLevel.get(vi)!, vertexToLevel.get(vj)!, vertexToLevel.get(vk)!];
		}
	);

	// Build a set of all triangles by their resolved vertex indices for symmetry verification
	const allFaceVertexSets = new Set<string>();
	for (const tri of triangles) {
		allFaceVertexSets.add([...tri].sort((a, b) => a - b).join(','));
	}

	// Group by rotational symmetry
	const grouped = new Set<number>();
	const rows: PolygonMapRow[] = [];

	for (let ti = 0; ti < trianglesAsLevelPoints.length; ti++) {
		if (grouped.has(ti)) continue;

		const sequence: [LevelIndex, PointIndex][] = trianglesAsLevelPoints[ti].map(
			([levelIndex, pointIndex]) => [levelIndex, pointIndex]
		);

		const bestCount = groupByRotationalSymmetry({
			sequence,
			levels,
			allFaceVertexSets,
			allFaces: triangles,
			radialSymmetry,
			grouped
		});

		rows.push({
			polygonType: 'triangle',
			count: bestCount,
			sequence
		});
	}

	sortPolygonMapRows(rows);

	// Validate all triangles are accounted for
	const totalTriangles = rows.reduce((sum, row) => sum + row.count, 0);
	if (totalTriangles !== expectedTriangles) {
		throw new Error(
			`computeTrianglePolygonMap: grouped ${totalTriangles} triangles but expected ${expectedTriangles}`
		);
	}

	return rows;
}

export type FaceSpec = {
	type: PolygonType;
	vertices: number[];
};

/**
 * Computes a PolygonMapRow[] for polyhedra with mixed polygon types (e.g. pentagons + hexagons).
 * Requires an explicit face list since face structure is ambiguous from vertices alone.
 *
 * @param vertices - The VerticesConfig (sorted by Z, as produced by convertXYZtoVertices)
 * @param faces - Array of FaceSpec, each listing polygon type and vertex indices into the vertices array
 * @param radialSymmetry - The base radial symmetry of the polyhedron (default 5)
 */
export function computeMixedPolygonMap({
	vertices,
	faces,
	radialSymmetry = 5
}: {
	vertices: VerticesConfig;
	faces: FaceSpec[];
	radialSymmetry?: number;
}): PolygonMapRow[] {
	const polarVertices = getPolarVertices(vertices);
	const levels = groupIntoLevels(polarVertices);
	const vertexToLevel = buildVertexToLevelMap(levels);

	// Convert faces to [level, pointIndex] sequences and validate vertex indices
	const facesAsLevelPoints: [LevelIndex, PointIndex][][] = [];
	const facesAsVertexIndices: number[][] = [];

	for (let fi = 0; fi < faces.length; fi++) {
		const face = faces[fi];
		const levelPointSeq: [LevelIndex, PointIndex][] = [];

		for (const vi of face.vertices) {
			const lp = vertexToLevel.get(vi);
			if (!lp) {
				throw new Error(
					`computeMixedPolygonMap: face ${fi} references vertex index ${vi} which is not in the vertex-to-level map`
				);
			}
			levelPointSeq.push(lp);
		}

		facesAsLevelPoints.push(levelPointSeq);
		facesAsVertexIndices.push([...face.vertices]);
	}

	// Build face vertex set for symmetry checking
	const allFaceVertexSets = new Set<string>();
	for (const faceVerts of facesAsVertexIndices) {
		allFaceVertexSets.add([...faceVerts].sort((a, b) => a - b).join(','));
	}

	// Group by rotational symmetry
	const grouped = new Set<number>();
	const rows: PolygonMapRow[] = [];

	for (let fi = 0; fi < faces.length; fi++) {
		if (grouped.has(fi)) continue;

		const sequence = facesAsLevelPoints[fi];

		const bestCount = groupByRotationalSymmetry({
			sequence,
			levels,
			allFaceVertexSets,
			allFaces: facesAsVertexIndices,
			radialSymmetry,
			grouped
		});

		rows.push({
			polygonType: faces[fi].type,
			count: bestCount,
			sequence
		});
	}

	sortPolygonMapRows(rows);

	// Validate total face count
	const totalFaces = rows.reduce((sum, row) => sum + row.count, 0);
	if (totalFaces !== faces.length) {
		throw new Error(
			`computeMixedPolygonMap: grouped ${totalFaces} faces but expected ${faces.length}`
		);
	}

	// Validate Euler's formula: V - E + F = 2 for genus-0
	const edgeSet = new Set<string>();
	for (const face of faces) {
		for (let ei = 0; ei < face.vertices.length; ei++) {
			const v0 = face.vertices[ei];
			const v1 = face.vertices[(ei + 1) % face.vertices.length];
			edgeSet.add([Math.min(v0, v1), Math.max(v0, v1)].join(','));
		}
	}
	const V = vertices.length;
	const E = edgeSet.size;
	const F = faces.length;
	const euler = V - E + F;
	if (euler !== 2) {
		throw new Error(
			`computeMixedPolygonMap: Euler formula check failed: V(${V}) - E(${E}) + F(${F}) = ${euler}, expected 2`
		);
	}

	return rows;
}

function findEdgeThreshold(sortedDistances: number[]): number {
	// Find the largest gap in the first portion of sorted pairwise distances.
	// For polyhedra, edge distances cluster tightly, then there's a large gap
	// to the next-nearest non-edge distances. We find that largest gap.
	let maxGap = 0;
	let maxGapIndex = 0;
	const searchLimit = Math.min(sortedDistances.length, 500);
	for (let i = 1; i < searchLimit; i++) {
		const gap = sortedDistances[i] - sortedDistances[i - 1];
		if (gap > maxGap) {
			maxGap = gap;
			maxGapIndex = i;
		}
	}

	// Threshold is midpoint between last edge distance and first non-edge distance
	return (sortedDistances[maxGapIndex - 1] + sortedDistances[maxGapIndex]) / 2;
}

export const generatePolygonConfigs = ({
	vertices,
	polygonMap,
	levelStartIndices,
	levelCounts,
	radialSymmetry
}: {
	vertices: VerticesConfig;
	polygonMap: PolygonMapRow[];
	levelStartIndices?: number[];
	levelCounts?: number[];
	radialSymmetry?: number;
}) => {
	const polarVertices = getPolarVertices(vertices);

	let levels: PolarVertex[][];

	if (levelStartIndices && levelCounts) {
		levels = levelStartIndices.map((startIndex, levelIndex) => {
			const sliced = polarVertices.slice(startIndex, startIndex + levelCounts[levelIndex]);
			return sliced;
		});
	} else {
		levels = groupIntoLevels(polarVertices);
	}

	let polygons: PolygonConfig<undefined, VertexIndex, CurveIndex, CurveIndex>[] = [];

	type PolygonType = (typeof polygonMap)[number]['polygonType'];
	const tally: Record<PolygonType, number> = {
		triangle: 0,
		quadrilateral: 0,
		pentagon: 0,
		hexagon: 0,
		decagon: 0,
		dodecagon: 0
	};

	polygonMap.forEach((row, rowIndex) => {
		for (let polygonIndex = 0; polygonIndex < row.count; polygonIndex++) {
			tally[row.polygonType] += 1;

			const polygon: PolygonConfig<undefined, VertexIndex, CurveIndex, CurveIndex> = {
				name: `${row.polygonType}${tally[row.polygonType]}`,
				id: generateTempId('cfg'),
				edges: getPolygonEdgesFromSequence({
					row,
					polygonIndex,
					levels,
					standardEdgeConfig: defaultEdgeConfig,
					radialSymmetry
				})
			};
			polygons.push(polygon);
		}
	});

	polygons = applyDirectionMatching(polygons);

	return polygons;
};
