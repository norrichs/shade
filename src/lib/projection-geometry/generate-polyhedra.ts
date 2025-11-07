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
	console.debug('getPolarVertices', polarVertices);
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
		if (radialSymmetry === 3) {
			// console.debug('getPolygonEdgesFromSequence', levelIndex, {
			// 	levelIndex,
			// 	level: levels[levelIndex]
			// });
		}
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
	console.debug({ vertices });
	return vertices;
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
		// Group vertices by z value (within tolerance)
		levels = [];
		const Z_TOLERANCE = 0.0000001;

		polarVertices.forEach((vertex) => {
			// Find an existing level with a similar z value
			const existingLevel = levels.find(
				(level) => level.length > 0 && Math.abs(level[0].z - vertex.z) < Z_TOLERANCE
			);

			if (existingLevel) {
				// Add to existing level
				existingLevel.push(vertex);
			} else {
				// Create a new level
				levels.push([vertex]);
			}
		});
	}

	console.debug({ levels });

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
