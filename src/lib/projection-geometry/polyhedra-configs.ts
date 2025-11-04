import { generateTempId } from '$lib/id-handler';
import type { Point3 } from '$lib/types';
import {
	defaultCrossSection,
	defaultEdgeConfig,
	defaultEdgeCurveConfig,
	secondEdgeCurveConfig
} from './configs';
import fullereneXYZString from './models/fullerene';
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

const pTetrahedron: VerticesConfig = [
	{ x: 0, y: 0, z: 100 },
	{ x: -81.64966, y: -47.14045, z: -33.33333 },
	{ x: 81.64966, y: -47.14045, z: -33.33333 },
	{ x: 0, y: 94.2809, z: -33.33333 }
];
const pSquare: VerticesConfig = [
	{ x: -50, y: -50, z: -50 },
	{ x: -50, y: 50, z: -50 },
	{ x: 50, y: 50, z: -50 },
	{ x: 50, y: -50, z: -50 },
	{ x: -50, y: -50, z: 50 },
	{ x: -50, y: 50, z: 50 },
	{ x: 50, y: 50, z: 50 },
	{ x: 50, y: -50, z: 50 }
];
const pIcosohedron: VerticesConfig = [
	{ x: 0, y: 0, z: 95.10565 }, // top vertex
	{ x: 0, y: 85.06508, z: 42.53254 },
	{ x: 80.9017, y: 26.28656, z: 42.53254 },
	{ x: 50, y: -68.8191, z: 42.53254 },
	{ x: -50, y: -68.8191, z: 42.53254 },
	{ x: -80.9017, y: 26.28656, z: 42.53254 },
	{ x: 0, y: -85.06508, z: -42.53254 },
	{ x: -80.9017, y: -26.28656, z: -42.53254 },
	{ x: -50, y: 68.8191, z: -42.53254 },
	{ x: 50, y: 68.8191, z: -42.53254 },
	{ x: 80.9017, y: -26.28656, z: -42.53254 },
	{ x: 0, y: 0, z: -95.10565 } // bottom vertex
];

const p60Dodeca: VerticesConfig = [
	{ x: 0, y: 0, z: 140.12585 },

	{ x: 0, y: 85.06508, z: 111.35164 },
	{ x: 80.9017, y: 26.28656, z: 111.35164 },
	{ x: 50, y: -68.8191, z: 111.35164 },
	{ x: -50, y: -68.8191, z: 111.35164 },
	{ x: -80.9017, y: 26.28656, z: 111.35164 },

	{ x: -73.66852, y: 101.39602, z: 62.66619 },
	{ x: 73.66852, y: 101.39602, z: 62.66619 },
	{ x: 119.19817, y: -38.72983, z: 62.66619 },
	{ x: 0, y: -125.33237, z: 62.66619 },
	{ x: -119.19817, y: -38.72983, z: 62.66619 },

	{ x: 0, y: 137.63819, z: 26.28656 },
	{ x: 130.9017, y: 42.53254, z: 26.28656 },
	{ x: 80.9017, y: -111.35164, z: 26.28656 },
	{ x: -80.9017, y: -111.35164, z: 26.28656 },
	{ x: -130.9017, y: 42.53254, z: 26.28656 },

	{ x: -80.9017, y: 111.35164, z: -26.28656 },
	{ x: 80.9017, y: 111.35164, z: -26.28656 },
	{ x: 130.9017, y: -42.53254, z: -26.28656 },
	{ x: 0, y: -137.63819, z: -26.28656 },
	{ x: -130.9017, y: -42.53254, z: -26.28656 },

	{ x: 0, y: 125.33237, z: -62.66619 },
	{ x: 119.19817, y: 38.72983, z: -62.66619 },
	{ x: 73.66852, y: -101.39602, z: -62.66619 },
	{ x: -73.66852, y: -101.39602, z: -62.66619 },
	{ x: -119.19817, y: 38.72983, z: -62.66619 },

	{ x: -50, y: 68.8191, z: -111.35164 },
	{ x: 50, y: 68.8191, z: -111.35164 },
	{ x: 80.9017, y: -26.28656, z: -111.35164 },
	{ x: 0, y: -85.06508, z: -111.35164 },
	{ x: -80.9017, y: -26.28656, z: -111.35164 },

	{ x: 0, y: 0, z: -140.12585 }
];

const pFullerene = convertXYZtoVertices(fullereneXYZString);

const fullerenePolygonMap: PolygonMapRow[] = [
	{
		polygonType: 'pentagon', // purple
		count: 1,
		levels: [0, 0, 0, 0, 0],
		directions: [1, 1, 1, 1],
		sequence: [
			[0, 0],
			[0, 1],
			[0, 2],
			[0, 3],
			[0, 4]
		]
	},
	{
		polygonType: 'hexagon', // blue
		count: 5,
		levels: [0, 0, 1, 2, 2, 1],
		directions: [1, 0, -1, -1, -1],
		sequence: [
			[0, 0],
			[0, 1],
			[1, 1],
			[2, 1],
			[2, 0],
			[1, 0]
		]
	},
	{
		polygonType: 'pentagon', //teal
		count: 5,
		levels: [1, 2, 3, 3, 2],
		directions: [1, -1, -1, -1],
		sequence: [
			[1, 0],
			[2, 0],
			[3, 0],
			[3, -1],
			[2, -1]
		]
	},

	{
		polygonType: 'hexagon', // green
		count: 5,
		levels: [2, 2, 3, 4, 4, 3],
		directions: [1, 1, -1, -1, -1],
		sequence: [
			[2, 0],
			[2, 1],
			[3, 1],
			[4, 1],
			[4, 0],
			[3, 0]
		]
	},
	{
		polygonType: 'hexagon', // yellow
		count: 5,
		levels: [3, 3, 4, 5, 5, 4],
		directions: [1, 1, -1, -1, -1],
		sequence: [
			[3, 0],
			[4, 0],
			[5, 0],
			[5, -1],
			[4, -1],
			[3, -1]
		]
	},
	{
		polygonType: 'pentagon', // orange
		count: 5,
		levels: [4, 4, 5, 6, 5],
		directions: [1, 1, -1, -1],
		sequence: [
			[4, 0],
			[4, 1],
			[5, 1],
			[6, 0],
			[5, 0]
		]
	},
	{
		polygonType: 'hexagon', // red
		count: 5,
		levels: [5, 5, 6, 7, 7, 6],
		directions: [1, 1, 0, -1, 0],
		sequence: [
			[5, 0],
			[6, 0],
			[7, 0],
			[7, -1],
			[6, -1],
			[5, -1]
		]
	},
	{
		polygonType: 'pentagon', // dark red
		count: 1,
		levels: [7, 7, 7, 7, 7],
		directions: [1, 1, 1, 1],
		sequence: [
			[7, 0],
			[7, 1],
			[7, 2],
			[7, 3],
			[7, 4]
		]
	}
];

type PolygonType = 'pentagon' | 'hexagon' | 'triangle' | 'quadrilateral';

const polygonTypeDefinitions: Record<PolygonType, { edgeCount: number }> = {
	triangle: { edgeCount: 3 },
	quadrilateral: { edgeCount: 4 },
	pentagon: { edgeCount: 5 },
	hexagon: { edgeCount: 6 }
};

type PolygonMapRow = {
	polygonType: PolygonType;
	count: number;
	levels: number[];
	directions: (1 | 0 | -1)[];
	sequence: [LevelIndex, PointIndex][];
};

type PolarVertex = {
	r: number;
	theta: number;
	x: number;
	y: number;
	z: number;
	vertexIndex: number;
};

const FULLERENE_SCALE_FACTOR = 50;

const generateFullereneConfig = (
	vertices: VerticesConfig,
	polygonMap: PolygonMapRow[]
): PolyhedronConfig<undefined, VertexIndex, CurveIndex, CurveIndex> => {
	vertices = vertices.map((vertex) => {
		return {
			x: vertex.x * FULLERENE_SCALE_FACTOR,
			y: vertex.y * FULLERENE_SCALE_FACTOR,
			z: vertex.z * FULLERENE_SCALE_FACTOR
		};
	});
	const polarVertices = getPolarVertices(vertices);

	const levelStartIndices = [0, 5, 10, 20, 30, 40, 50, 55];
	const levelCounts = [5, 5, 10, 10, 10, 10, 5, 5];
	const levels: PolarVertex[][] = levelStartIndices.map((startIndex, levelIndex) => {
		const sliced = polarVertices.slice(startIndex, startIndex + levelCounts[levelIndex]);
		return sliced;
	});


	let polygons: PolygonConfig<undefined, VertexIndex, CurveIndex, CurveIndex>[] = [];

	type PolygonType = (typeof polygonMap)[number]['polygonType'];
	const tally: Record<PolygonType, number> = {
		triangle: 0,
		quadrilateral: 0,
		pentagon: 0,
		hexagon: 0
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
					standardEdgeConfig: defaultEdgeConfig
				})
			};
			polygons.push(polygon);
		}
	});

	// TODO: loop through all polygons and match each edge to it's partner, determine if the edges have the same direction, and if not, add the `isDirectionMatched` flag to the edge from the polygon with the higher index.
	polygons = applyDirectionMatching(polygons);

	const polyhedronConfig: PolyhedronConfig<undefined, VertexIndex, CurveIndex, CurveIndex> = {
		name: 'Fullerene',
		id: generateTempId('cfg'),
		polygons,
		crossSectionCurves: [defaultCrossSection],
		edgeCurves: [secondEdgeCurveConfig],
		vertices,
		transform: 'inherit'
	};
	
	return polyhedronConfig;
};

const getPolarVertices = (vertices: VerticesConfig, precision: number = 0.00001): PolarVertex[] => {
	const polarVertices = vertices
		.map((vertex, vertexIndex) => {
			const polarVertex = {
				...vertex,
				r: Math.sqrt(vertex.x ** 2 + vertex.y ** 2),
				theta: Math.atan2(vertex.y, vertex.x) + Math.PI, // Add Math.PI to make all theta values positive
				vertexIndex
			} as PolarVertex;
			if (Math.abs(polarVertex.theta - (Math.PI * 2)) < precision) {
				polarVertex.theta = 0
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

const applyDirectionMatching = (
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

const getPolygonEdgesFromSequence = ({
	row,
	polygonIndex,
	levels,
	standardEdgeConfig
}: {
	row: PolygonMapRow;
	levels: PolarVertex[][];
	standardEdgeConfig: EdgeConfig<undefined, number, number, number>;
	polygonIndex: number;
}): EdgeConfig<undefined, number, number, number>[] => {
	
	const { sequence } = row;
	let edges: EdgeConfig<undefined, number, number, number>[] = [];
	sequence.forEach(([levelIndex, pointIndex]) => {
    const pointIndexOffset = polygonIndex * (levels[levelIndex].length / 5) // 5 is the radial symmetry.  Some rows have 5 points, some 10

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

const getPolygonEdges = ({	
	row,
	polygonIndex,
	levels,
	standardEdgeConfig
}: {
	row: PolygonMapRow;
	polygonIndex: number;
	levels: PolarVertex[][];
	standardEdgeConfig: EdgeConfig<undefined, number, number, number>;
}): EdgeConfig<undefined, number, number, number>[] => {
	let edges: EdgeConfig<undefined, number, number, number>[];
	const { edgeCount } = polygonTypeDefinitions[row.polygonType];

	const isSingleLevel = row.count === 1;

	if (isSingleLevel) {
		edges = row.levels.map((levelIndex, i) => ({
			...standardEdgeConfig,
			vertex1: levels[levelIndex][(i + 1) % edgeCount].vertexIndex
		}));
	} else {
		let prevTheta = levels[row.levels[0]][polygonIndex].theta;
		edges = row.levels.map((levelIndex, i) => {
			const level = levels[levelIndex];
			if (i === 0) {
				return { ...standardEdgeConfig, vertex1: level[0].vertexIndex };
			}
			const direction = row.directions[i - 1];
			const polarVertexIndex = getVertexByTheta(level, direction, prevTheta).vertexIndex;

			return {
				...standardEdgeConfig,
				vertex1: polarVertexIndex
			};
		});
	}

	return edges;
};

// TODO: refactor this so that we loop back around.  Maybe we add or subtract 2pi to the theta for the diff
const getVertexByTheta = (
	vertices: PolarVertex[],
	direction: 1 | 0 | -1,
	prevTheta: number,
	precision: number = 0.0001
): PolarVertex => {

	if (direction === 0) {
		return vertices.find((v) => v.theta - prevTheta < precision)!;
	}

	const diffed = vertices
		.map((vertex: PolarVertex) => {
			const diff = vertex.theta - prevTheta;
			if (direction === -1 && diff > 0) return { ...vertex, diff: diff - 2 * Math.PI };
			if (direction === 1 && diff < 0) return { ...vertex, diff: diff + 2 * Math.PI };
			return { ...vertex, diff };
		})
		.filter((v) => v.diff !== 0);

	let targetDiff: number;
	if (direction === -1) targetDiff = Math.max(...diffed.map((v) => v.diff));
	else if (direction === 1) targetDiff = Math.min(...diffed.map((v) => v.diff));

	const result = diffed.find((v) => v.diff === targetDiff);
	if (!result) throw new Error('No vertex found');
	return result;
};

const fullerenePolar = [
	{
		x: -1.00338244,
		y: -0.72899997,
		z: -3.33919501,
		r: 1.2402488771050568,
		theta: -2.513274151908273
	},
	{
		x: 0.38325799,
		y: -1.17954683,
		z: -3.33919501,
		r: 1.2402489310867755,
		theta: -1.256637067337486
	},
	{
		x: 1.24024892,
		y: 0,
		z: -3.33919501,
		r: 1.24024892,
		theta: 0
	},
	{
		x: 0.38325799,
		y: 1.17954683,
		z: -3.33919501,
		r: 1.2402489310867755,
		theta: 1.256637067337486
	},
	{
		x: -1.00338244,
		y: 0.72899997,
		z: -3.33919501,
		r: 1.2402488771050568,
		theta: 2.513274151908273
	},
	{
		x: -1.967538,
		y: -1.42949998,
		z: -2.60264564,
		r: 2.432010685474881,
		theta: -2.5132741403250396
	},
	{
		x: 0.75153261,
		y: -2.3129797,
		z: -2.60264564,
		r: 2.4320107640603696,
		theta: -1.256637081581989
	},
	{
		x: 2.43201065,
		y: 0,
		z: -2.60264564,
		r: 2.43201065,
		theta: 0
	},
	{
		x: 0.75153261,
		y: 2.3129797,
		z: -2.60264564,
		r: 2.4320107640603696,
		theta: 1.256637081581989
	},
	{
		x: -1.967538,
		y: 1.42949998,
		z: -2.60264564,
		r: 2.432010685474881,
		theta: 2.5132741403250396
	},
	{
		x: -2.97092032,
		y: -0.70050001,
		z: -1.83612978,
		r: 3.0523872316268954,
		theta: -2.910036407995465
	},
	{
		x: -1.58428001,
		y: -2.6090467,
		z: -1.83612978,
		r: 3.052387235077897,
		theta: -2.1165118535469443
	},
	{
		x: -0.2518498,
		y: -3.04197955,
		z: -1.83612978,
		r: 3.0523872467919673,
		theta: -1.6533993564577754
	},
	{
		x: 1.99178147,
		y: -2.3129797,
		z: -1.83612978,
		r: 3.0523873471182275,
		theta: -0.8598748014171159
	},
	{
		x: 2.81526875,
		y: -1.17954683,
		z: -1.83612978,
		r: 3.0523874031468567,
		theta: -0.3967622945495904
	},
	{
		x: 2.81526875,
		y: 1.17954683,
		z: -1.83612978,
		r: 3.0523874031468567,
		theta: 0.3967622945495904
	},
	{
		x: 1.99178147,
		y: 2.3129797,
		z: -1.83612978,
		r: 3.0523873471182275,
		theta: 0.8598748014171159
	},
	{
		x: -0.2518498,
		y: 3.04197955,
		z: -1.83612978,
		r: 3.0523872467919673,
		theta: 1.6533993564577754
	},
	{
		x: -1.58428001,
		y: 2.6090467,
		z: -1.83612978,
		r: 3.052387235077897,
		theta: 2.1165118535469443
	},
	{
		x: -2.97092032,
		y: 0.70050001,
		z: -1.83612978,
		r: 3.0523872316268954,
		theta: 2.910036407995465
	},
	{
		x: -3.2077868,
		y: -1.42949998,
		z: -0.59588087,
		r: 3.5118892845695235,
		theta: -2.722375131916868
	},
	{
		x: -2.35079598,
		y: -2.6090467,
		z: -0.59588087,
		r: 3.5118892952889404,
		theta: -2.3041731392269567
	},
	{
		x: 0.36827466,
		y: -3.49252629,
		z: -0.59588087,
		r: 3.5118892510355844,
		theta: -1.4657380624565646
	},
	{
		x: 1.754915,
		y: -3.04197955,
		z: -0.59588087,
		r: 3.5118892693026647,
		theta: -1.0475360594607184
	},
	{
		x: 3.4353931,
		y: -0.72899997,
		z: -0.59588087,
		r: 3.5118893359255514,
		theta: -0.2091009982979862
	},
	{
		x: 3.4353931,
		y: 0.72899997,
		z: -0.59588087,
		r: 3.5118893359255514,
		theta: 0.2091009982979862
	},
	{
		x: 1.754915,
		y: 3.04197955,
		z: -0.59588087,
		r: 3.5118892693026647,
		theta: 1.0475360594607184
	},
	{
		x: 0.36827466,
		y: 3.49252629,
		z: -0.59588087,
		r: 3.5118892510355844,
		theta: 1.4657380624565646
	},
	{
		x: -2.35079598,
		y: 2.6090467,
		z: -0.59588087,
		r: 3.5118892952889404,
		theta: 2.3041731392269567
	},
	{
		x: -3.2077868,
		y: 1.42949998,
		z: -0.59588087,
		r: 3.5118892845695235,
		theta: 2.722375131916868
	},
	{
		x: -3.4353931,
		y: -0.72899997,
		z: 0.59588087,
		r: 3.5118893359255514,
		theta: -2.932491655291807
	},
	{
		x: -1.754915,
		y: -3.04197955,
		z: 0.59588087,
		r: 3.5118892693026647,
		theta: -2.094056594129075
	},
	{
		x: -0.36827466,
		y: -3.49252629,
		z: 0.59588087,
		r: 3.5118892510355844,
		theta: -1.6758545911332288
	},
	{
		x: 2.35079598,
		y: -2.6090467,
		z: 0.59588087,
		r: 3.5118892952889404,
		theta: -0.8374195143628368
	},
	{
		x: 3.2077868,
		y: -1.42949998,
		z: 0.59588087,
		r: 3.5118892845695235,
		theta: -0.4192175216729253
	},
	{
		x: 3.2077868,
		y: 1.42949998,
		z: 0.59588087,
		r: 3.5118892845695235,
		theta: 0.4192175216729253
	},
	{
		x: 2.35079598,
		y: 2.6090467,
		z: 0.59588087,
		r: 3.5118892952889404,
		theta: 0.8374195143628368
	},
	{
		x: -0.36827466,
		y: 3.49252629,
		z: 0.59588087,
		r: 3.5118892510355844,
		theta: 1.6758545911332288
	},
	{
		x: -1.754915,
		y: 3.04197955,
		z: 0.59588087,
		r: 3.5118892693026647,
		theta: 2.094056594129075
	},
	{
		x: -3.4353931,
		y: 0.72899997,
		z: 0.59588087,
		r: 3.5118893359255514,
		theta: 2.932491655291807
	},
	{
		x: -2.81526875,
		y: -1.17954683,
		z: 1.83612978,
		r: 3.0523874031468567,
		theta: -2.744830359040203
	},
	{
		x: -1.99178147,
		y: -2.3129797,
		z: 1.83612978,
		r: 3.0523873471182275,
		theta: -2.2817178521726773
	},
	{
		x: 0.2518498,
		y: -3.04197955,
		z: 1.83612978,
		r: 3.0523872467919673,
		theta: -1.488193297132018
	},
	{
		x: 1.58428001,
		y: -2.6090467,
		z: 1.83612978,
		r: 3.052387235077897,
		theta: -1.025080800042849
	},
	{
		x: 2.97092032,
		y: -0.70050001,
		z: 1.83612978,
		r: 3.0523872316268954,
		theta: -0.23155624559432844
	},
	{
		x: 2.97092032,
		y: 0.70050001,
		z: 1.83612978,
		r: 3.0523872316268954,
		theta: 0.23155624559432844
	},
	{
		x: 1.58428001,
		y: 2.6090467,
		z: 1.83612978,
		r: 3.052387235077897,
		theta: 1.025080800042849
	},
	{
		x: 0.2518498,
		y: 3.04197955,
		z: 1.83612978,
		r: 3.0523872467919673,
		theta: 1.488193297132018
	},
	{
		x: -1.99178147,
		y: 2.3129797,
		z: 1.83612978,
		r: 3.0523873471182275,
		theta: 2.2817178521726773
	},
	{
		x: -2.81526875,
		y: 1.17954683,
		z: 1.83612978,
		r: 3.0523874031468567,
		theta: 2.744830359040203
	},
	{
		x: -0.75153261,
		y: -2.3129797,
		z: 2.60264564,
		r: 2.4320107640603696,
		theta: -1.8849555720078044
	},
	{
		x: 1.967538,
		y: -1.42949998,
		z: 2.60264564,
		r: 2.432010685474881,
		theta: -0.6283185132647539
	},
	{
		x: 1.967538,
		y: 1.42949998,
		z: 2.60264564,
		r: 2.432010685474881,
		theta: 0.6283185132647539
	},
	{
		x: -0.75153261,
		y: 2.3129797,
		z: 2.60264564,
		r: 2.4320107640603696,
		theta: 1.8849555720078044
	},
	{
		x: -2.43201065,
		y: 0,
		z: 2.60264564,
		r: 2.43201065,
		theta: 3.141592653589793
	},
	{
		x: -0.38325799,
		y: -1.17954683,
		z: 3.33919501,
		r: 1.2402489310867755,
		theta: -1.8849555862523073
	},
	{
		x: 1.00338244,
		y: -0.72899997,
		z: 3.33919501,
		r: 1.2402488771050568,
		theta: -0.62831850168152
	},
	{
		x: 1.00338244,
		y: 0.72899997,
		z: 3.33919501,
		r: 1.2402488771050568,
		theta: 0.62831850168152
	},
	{
		x: -0.38325799,
		y: 1.17954683,
		z: 3.33919501,
		r: 1.2402489310867755,
		theta: 1.8849555862523073
	},
	{
		x: -1.24024892,
		y: 0,
		z: 3.33919501,
		r: 1.24024892,
		theta: 3.141592653589793
	}
];

// const fullereneConfig: PolyhedronConfig<undefined, VertexIndex, CurveIndex, CurveIndex> = {
// 	name: 'Fullerene',
// 	id: generateTempId('cfg'),
// 	crossSectionCurves: [defaultCrossSection],
// 	edgeCurves: [secondEdgeCurveConfig],
// 	vertices: fullerenePolar,
// 	transform: 'inherit',
// 	polygons: [
// 		{
// 			name: 'pentagon1',
// 			id: generateTempId('cfg'),
// 			edges: [
// 				{ ...defaultEdgeConfig, vertex1: 0 },
// 				{ ...defaultEdgeConfig, vertex1: 1 },
// 				{ ...defaultEdgeConfig, vertex1: 2 },
// 				{ ...defaultEdgeConfig, vertex1: 3 },
// 				{ ...defaultEdgeConfig, vertex1: 4 }
// 			]
// 		},
// 		{
// 			name: 'hexagon1',
// 			id: generateTempId('cfg'),
// 			edges: [
// 				{ ...defaultEdgeConfig, vertex1: 0 },
// 				{ ...defaultEdgeConfig, vertex1: 1 },
// 				{ ...defaultEdgeConfig, vertex1: 5 },
// 				{ ...defaultEdgeConfig, vertex1: 11 },
// 				{ ...defaultEdgeConfig, vertex1: 12 },
// 				{ ...defaultEdgeConfig, vertex1: 6 }
// 			]
// 		},
// 		{
// 			name: 'hexagon2',
// 			id: generateTempId('cfg'),
// 			edges: [
// 				{ ...defaultEdgeConfig, vertex1: 1 },
// 				{ ...defaultEdgeConfig, vertex1: 2 },
// 				{ ...defaultEdgeConfig, vertex1: 6 },
// 				{ ...defaultEdgeConfig, vertex1: 13 },
// 				{ ...defaultEdgeConfig, vertex1: 14 },
// 				{ ...defaultEdgeConfig, vertex1: 7 }
// 			]
// 		},
// 		{
// 			name: 'hexagon3',
// 			id: generateTempId('cfg'),
// 			edges: [
// 				{ ...defaultEdgeConfig, vertex1: 2 },
// 				{ ...defaultEdgeConfig, vertex1: 3 },
// 				{ ...defaultEdgeConfig, vertex1: 7 },
// 				{ ...defaultEdgeConfig, vertex1: 15 },
// 				{ ...defaultEdgeConfig, vertex1: 16 },
// 				{ ...defaultEdgeConfig, vertex1: 8 }
// 			]
// 		},
// 		{
// 			name: 'hexagon4',
// 			id: generateTempId('cfg'),
// 			edges: [
// 				{ ...defaultEdgeConfig, vertex1: 3 },
// 				{ ...defaultEdgeConfig, vertex1: 4 },
// 				{ ...defaultEdgeConfig, vertex1: 8 },
// 				{ ...defaultEdgeConfig, vertex1: 17 },
// 				{ ...defaultEdgeConfig, vertex1: 18 },
// 				{ ...defaultEdgeConfig, vertex1: 9 }
// 			]
// 		},
// 		{
// 			name: 'hexagon5',
// 			id: generateTempId('cfg'),
// 			edges: [
// 				{ ...defaultEdgeConfig, vertex1: 4 },
// 				{ ...defaultEdgeConfig, vertex1: 0 },
// 				{ ...defaultEdgeConfig, vertex1: 9 },
// 				{ ...defaultEdgeConfig, vertex1: 19 },
// 				{ ...defaultEdgeConfig, vertex1: 10 },
// 				{ ...defaultEdgeConfig, vertex1: 5 }
// 			]
// 		}
// 	]
// };

const tetrahedron: PolyhedronConfig<undefined, VertexIndex, CurveIndex, CurveIndex> = {
	name: 'Regular Tetrahedron',
	id: generateTempId('cfg'),
	crossSectionCurves: [defaultCrossSection],
	edgeCurves: [secondEdgeCurveConfig],
	vertices: pIcosohedron,
	transform: 'inherit',
	polygons: [
		{
			name: 'triangle1',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 0 },
				{ ...defaultEdgeConfig, vertex1: 1, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 2 }
			]
		},
		{
			name: 'triangle2',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 0 },
				{ ...defaultEdgeConfig, vertex1: 2, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 3 }
			]
		},
		{
			name: 'triangle3',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 0 },
				{ ...defaultEdgeConfig, vertex1: 3, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 4 }
			]
		},
		{
			name: 'triangle4',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 0 },
				{ ...defaultEdgeConfig, vertex1: 4, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 5 }
			]
		},
		{
			name: 'triangle5',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 0 },
				{ ...defaultEdgeConfig, vertex1: 5, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 1 }
			]
		},
		{
			name: 'triangle6',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 1 },
				{ ...defaultEdgeConfig, vertex1: 2 },
				{ ...defaultEdgeConfig, vertex1: 9 }
			]
		},
		{
			name: 'triangle7',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 2 },
				{ ...defaultEdgeConfig, vertex1: 3 },
				{ ...defaultEdgeConfig, vertex1: 10 }
			]
		},
		{
			name: 'triangle8',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 3 },
				{ ...defaultEdgeConfig, vertex1: 4 },
				{ ...defaultEdgeConfig, vertex1: 6 }
			]
		},
		{
			name: 'triangle9',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 4 },
				{ ...defaultEdgeConfig, vertex1: 5 },
				{ ...defaultEdgeConfig, vertex1: 7 }
			]
		},
		{
			name: 'triangle10',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 5 },
				{ ...defaultEdgeConfig, vertex1: 1 },
				{ ...defaultEdgeConfig, vertex1: 8 }
			]
		},
		{
			name: 'triangle11',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 9 },
				{ ...defaultEdgeConfig, vertex1: 10 },
				{ ...defaultEdgeConfig, vertex1: 2 }
			]
		},
		{
			name: 'triangle12',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 10 },
				{ ...defaultEdgeConfig, vertex1: 6 },
				{ ...defaultEdgeConfig, vertex1: 3 }
			]
		},
		{
			name: 'triangle13',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 6 },
				{ ...defaultEdgeConfig, vertex1: 7 },
				{ ...defaultEdgeConfig, vertex1: 4 }
			]
		},
		{
			name: 'triangle14',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 7 },
				{ ...defaultEdgeConfig, vertex1: 8 },
				{ ...defaultEdgeConfig, vertex1: 5 }
			]
		},
		{
			name: 'triangle15',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 8 },
				{ ...defaultEdgeConfig, vertex1: 9 },
				{ ...defaultEdgeConfig, vertex1: 1 }
			]
		},
		{
			name: 'triangle16',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 9, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 10 },
				{ ...defaultEdgeConfig, vertex1: 11 }
			]
		},
		{
			name: 'triangle17',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 10, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 6 },
				{ ...defaultEdgeConfig, vertex1: 11 }
			]
		},
		{
			name: 'triangle18',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 6, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 7 },
				{ ...defaultEdgeConfig, vertex1: 11 }
			]
		},
		{
			name: 'triangle19',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 7, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 8 },
				{ ...defaultEdgeConfig, vertex1: 11 }
			]
		},
		{
			name: 'triangle20',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 8, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 9 },
				{ ...defaultEdgeConfig, vertex1: 11 }
			]
		}
	]
};

const icosohedron: PolyhedronConfig<undefined, VertexIndex, CurveIndex, CurveIndex> = {
	name: 'Regular Icosahedron',
	id: generateTempId('cfg'),
	crossSectionCurves: [defaultCrossSection],
	edgeCurves: [secondEdgeCurveConfig],
	vertices: pIcosohedron,
	transform: 'inherit',
	polygons: [
		{
			name: 'triangle1',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 0 },
				{ ...defaultEdgeConfig, vertex1: 1, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 2 }
			]
		},
		{
			name: 'triangle2',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 0 },
				{ ...defaultEdgeConfig, vertex1: 2, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 3 }
			]
		},
		{
			name: 'triangle3',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 0 },
				{ ...defaultEdgeConfig, vertex1: 3, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 4 }
			]
		},
		{
			name: 'triangle4',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 0 },
				{ ...defaultEdgeConfig, vertex1: 4, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 5 }
			]
		},
		{
			name: 'triangle5',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 0 },
				{ ...defaultEdgeConfig, vertex1: 5, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 1 }
			]
		},
		{
			name: 'triangle6',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 1 },
				{ ...defaultEdgeConfig, vertex1: 2 },
				{ ...defaultEdgeConfig, vertex1: 9 }
			]
		},
		{
			name: 'triangle7',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 2 },
				{ ...defaultEdgeConfig, vertex1: 3 },
				{ ...defaultEdgeConfig, vertex1: 10 }
			]
		},
		{
			name: 'triangle8',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 3 },
				{ ...defaultEdgeConfig, vertex1: 4 },
				{ ...defaultEdgeConfig, vertex1: 6 }
			]
		},
		{
			name: 'triangle9',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 4 },
				{ ...defaultEdgeConfig, vertex1: 5 },
				{ ...defaultEdgeConfig, vertex1: 7 }
			]
		},
		{
			name: 'triangle10',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 5 },
				{ ...defaultEdgeConfig, vertex1: 1 },
				{ ...defaultEdgeConfig, vertex1: 8 }
			]
		},
		{
			name: 'triangle11',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 9 },
				{ ...defaultEdgeConfig, vertex1: 10 },
				{ ...defaultEdgeConfig, vertex1: 2 }
			]
		},
		{
			name: 'triangle12',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 10 },
				{ ...defaultEdgeConfig, vertex1: 6 },
				{ ...defaultEdgeConfig, vertex1: 3 }
			]
		},
		{
			name: 'triangle13',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 6 },
				{ ...defaultEdgeConfig, vertex1: 7 },
				{ ...defaultEdgeConfig, vertex1: 4 }
			]
		},
		{
			name: 'triangle14',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 7 },
				{ ...defaultEdgeConfig, vertex1: 8 },
				{ ...defaultEdgeConfig, vertex1: 5 }
			]
		},
		{
			name: 'triangle15',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 8 },
				{ ...defaultEdgeConfig, vertex1: 9 },
				{ ...defaultEdgeConfig, vertex1: 1 }
			]
		},
		{
			name: 'triangle16',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 9, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 10 },
				{ ...defaultEdgeConfig, vertex1: 11 }
			]
		},
		{
			name: 'triangle17',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 10, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 6 },
				{ ...defaultEdgeConfig, vertex1: 11 }
			]
		},
		{
			name: 'triangle18',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 6, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 7 },
				{ ...defaultEdgeConfig, vertex1: 11 }
			]
		},
		{
			name: 'triangle19',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 7, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 8 },
				{ ...defaultEdgeConfig, vertex1: 11 }
			]
		},
		{
			name: 'triangle20',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 8, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 9 },
				{ ...defaultEdgeConfig, vertex1: 11 }
			]
		}
	]
};

const cube: PolyhedronConfig<undefined, VertexIndex, CurveIndex, CurveIndex> = {
	name: 'Cube',
	id: generateTempId('cfg'),
	crossSectionCurves: [defaultCrossSection],
	edgeCurves: [secondEdgeCurveConfig],
	vertices: pSquare,
	transform: 'inherit',
	polygons: [
		{
			name: 'square1',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 0 },
				{ ...defaultEdgeConfig, vertex1: 1 },
				{ ...defaultEdgeConfig, vertex1: 2 },
				{ ...defaultEdgeConfig, vertex1: 3 }
			]
		},
		{
			name: 'square2',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 0, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 1 },
				{ ...defaultEdgeConfig, vertex1: 5 },
				{ ...defaultEdgeConfig, vertex1: 4 }
			]
		},
		{
			name: 'square3',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 1, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 2 },
				{ ...defaultEdgeConfig, vertex1: 6 },
				{ ...defaultEdgeConfig, vertex1: 5 }
			]
		},
		{
			name: 'square4',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 2, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 3 },
				{ ...defaultEdgeConfig, vertex1: 7 },
				{ ...defaultEdgeConfig, vertex1: 6 }
			]
		},
		{
			name: 'square5',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 3, isDirectionMatched: false },
				{ ...defaultEdgeConfig, vertex1: 0 },
				{ ...defaultEdgeConfig, vertex1: 4 },
				{ ...defaultEdgeConfig, vertex1: 7 }
			]
		},
		{
			name: 'square6',
			id: generateTempId('cfg'),
			edges: [
				{ ...defaultEdgeConfig, vertex1: 7 },
				{ ...defaultEdgeConfig, vertex1: 6 },
				{ ...defaultEdgeConfig, vertex1: 5 },
				{ ...defaultEdgeConfig, vertex1: 4 }
			]
		}
	]
};

export const polyhedronConfigs: PolyhedronConfig<undefined, VertexIndex, CurveIndex, CurveIndex>[] =
	[tetrahedron, icosohedron, cube, generateFullereneConfig(pFullerene, fullerenePolygonMap)];

export const generateProjectorConfig = (
	polyhedron: PolyhedronConfig<undefined, VertexIndex, CurveIndex, CurveIndex>
) => {
	return {
		name: polyhedron.name,
		id: generateTempId('cfg'),
		polyhedron
	};
};

export const projectorConfigs: {
	[key: string]: ProjectorConfig<undefined, VertexIndex, CurveIndex, CurveIndex>;
} = {
	icosohedron: {
		name: 'Icosohedron',
		id: generateTempId('cfg'),
		polyhedron: {
			name: 'defaultTetrahedron',
			id: generateTempId('cfg'),
			crossSectionCurves: [defaultCrossSection],
			edgeCurves: [secondEdgeCurveConfig],
			vertices: pIcosohedron,
			transform: 'inherit',
			polygons: [
				{
					name: 'triangle1',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 0 },
						{ ...defaultEdgeConfig, vertex1: 1, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 2 }
					]
				},
				{
					name: 'triangle2',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 0 },
						{ ...defaultEdgeConfig, vertex1: 2, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 3 }
					]
				},
				{
					name: 'triangle3',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 0 },
						{ ...defaultEdgeConfig, vertex1: 3, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 4 }
					]
				},
				{
					name: 'triangle4',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 0 },
						{ ...defaultEdgeConfig, vertex1: 4, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 5 }
					]
				},
				{
					name: 'triangle5',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 0 },
						{ ...defaultEdgeConfig, vertex1: 5, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 1 }
					]
				},
				{
					name: 'triangle6',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 1 },
						{ ...defaultEdgeConfig, vertex1: 2 },
						{ ...defaultEdgeConfig, vertex1: 9 }
					]
				},
				{
					name: 'triangle7',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 2 },
						{ ...defaultEdgeConfig, vertex1: 3 },
						{ ...defaultEdgeConfig, vertex1: 10 }
					]
				},
				{
					name: 'triangle8',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 3 },
						{ ...defaultEdgeConfig, vertex1: 4 },
						{ ...defaultEdgeConfig, vertex1: 6 }
					]
				},
				{
					name: 'triangle9',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 4 },
						{ ...defaultEdgeConfig, vertex1: 5 },
						{ ...defaultEdgeConfig, vertex1: 7 }
					]
				},
				{
					name: 'triangle10',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 5 },
						{ ...defaultEdgeConfig, vertex1: 1 },
						{ ...defaultEdgeConfig, vertex1: 8 }
					]
				},
				{
					name: 'triangle11',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 9 },
						{ ...defaultEdgeConfig, vertex1: 10 },
						{ ...defaultEdgeConfig, vertex1: 2 }
					]
				},
				{
					name: 'triangle12',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 10 },
						{ ...defaultEdgeConfig, vertex1: 6 },
						{ ...defaultEdgeConfig, vertex1: 3 }
					]
				},
				{
					name: 'triangle13',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 6 },
						{ ...defaultEdgeConfig, vertex1: 7 },
						{ ...defaultEdgeConfig, vertex1: 4 }
					]
				},
				{
					name: 'triangle14',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 7 },
						{ ...defaultEdgeConfig, vertex1: 8 },
						{ ...defaultEdgeConfig, vertex1: 5 }
					]
				},
				{
					name: 'triangle15',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 8 },
						{ ...defaultEdgeConfig, vertex1: 9 },
						{ ...defaultEdgeConfig, vertex1: 1 }
					]
				},
				{
					name: 'triangle16',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 9, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 10 },
						{ ...defaultEdgeConfig, vertex1: 11 }
					]
				},
				{
					name: 'triangle17',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 10, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 6 },
						{ ...defaultEdgeConfig, vertex1: 11 }
					]
				},
				{
					name: 'triangle18',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 6, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 7 },
						{ ...defaultEdgeConfig, vertex1: 11 }
					]
				},
				{
					name: 'triangle19',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 7, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 8 },
						{ ...defaultEdgeConfig, vertex1: 11 }
					]
				},
				{
					name: 'triangle20',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 8, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 9 },
						{ ...defaultEdgeConfig, vertex1: 11 }
					]
				}
			]
		}
	},
	tetrahedron: {
		name: 'Tetrahedron',
		id: generateTempId('cfg'),
		polyhedron: {
			name: 'defaultTetrahedron',
			id: generateTempId('cfg'),
			// sampleMethod: defaultEdgeSampleMethod,
			crossSectionCurves: [defaultCrossSection],
			edgeCurves: [defaultEdgeCurveConfig],
			vertices: pTetrahedron,
			transform: 'inherit',
			polygons: [
				{
					name: 'triangle0',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 0 },
						{ ...defaultEdgeConfig, vertex1: 2 },
						{ ...defaultEdgeConfig, vertex1: 1 }
					]
				},
				{
					name: 'triangle1',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 0 },
						{ ...defaultEdgeConfig, vertex1: 3, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 1 }
					]
				},
				{
					name: 'triangle2',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 0 },
						{ ...defaultEdgeConfig, vertex1: 2 },
						{ ...defaultEdgeConfig, vertex1: 3, isDirectionMatched: false }
					]
				},
				{
					name: 'triangle3',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 3, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 2 },
						{ ...defaultEdgeConfig, vertex1: 1 }
					]
				}
			]
		}
	},
	cube: {
		name: 'Cube',
		id: generateTempId('cfg'),
		polyhedron: {
			name: 'defaultCube',
			id: generateTempId('cfg'),
			crossSectionCurves: [defaultCrossSection],
			edgeCurves: [secondEdgeCurveConfig],
			vertices: pSquare,
			transform: 'inherit',
			polygons: [
				{
					name: 'square1',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 0 },
						{ ...defaultEdgeConfig, vertex1: 1 },
						{ ...defaultEdgeConfig, vertex1: 2 },
						{ ...defaultEdgeConfig, vertex1: 3 }
					]
				},
				{
					name: 'square2',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 0, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 1 },
						{ ...defaultEdgeConfig, vertex1: 5 },
						{ ...defaultEdgeConfig, vertex1: 4 }
					]
				},
				{
					name: 'square3',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 1, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 2 },
						{ ...defaultEdgeConfig, vertex1: 6 },
						{ ...defaultEdgeConfig, vertex1: 5 }
					]
				},
				{
					name: 'square4',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 2, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 3 },
						{ ...defaultEdgeConfig, vertex1: 7 },
						{ ...defaultEdgeConfig, vertex1: 6 }
					]
				},
				{
					name: 'square5',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 3, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 0 },
						{ ...defaultEdgeConfig, vertex1: 4 },
						{ ...defaultEdgeConfig, vertex1: 7 }
					]
				},
				{
					name: 'square6',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 7 },
						{ ...defaultEdgeConfig, vertex1: 6 },
						{ ...defaultEdgeConfig, vertex1: 5 },
						{ ...defaultEdgeConfig, vertex1: 4 }
					]
				}
			]
		}
	},
	poly60dodeca: {
		name: 'Poy 60 Dodecahedron',
		id: generateTempId('cfg'),
		polyhedron: {
			name: 'defaultCube',
			id: generateTempId('cfg'),
			crossSectionCurves: [defaultCrossSection],
			edgeCurves: [defaultEdgeCurveConfig, secondEdgeCurveConfig],
			vertices: p60Dodeca,
			transform: 'inherit',
			polygons: [
				{
					name: 'pentagon1',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 1, widthCurve: 1 },
						{ ...defaultEdgeConfig, vertex1: 2, widthCurve: 1 },
						{ ...defaultEdgeConfig, vertex1: 3, widthCurve: 1 },
						{ ...defaultEdgeConfig, vertex1: 4, widthCurve: 1 },
						{ ...defaultEdgeConfig, vertex1: 5, widthCurve: 1 }
					]
				},
				// {
				// 	name: 'square1',
				// 	id: generateTempId('cfg'),
				// 	edges: [
				// 		{ ...defaultEdgeConfig, vertex1: 0 },
				// 		{ ...defaultEdgeConfig, vertex1: 1, isDirectionMatched: false },
				// 		{ ...defaultEdgeConfig, vertex1: 2 }
				// 	]
				// },
				// {
				// 	name: 'square2',
				// 	id: generateTempId('cfg'),
				// 	edges: [
				// 		{ ...defaultEdgeConfig, vertex1: 0 },
				// 		{ ...defaultEdgeConfig, vertex1: 2, isDirectionMatched: false },
				// 		{ ...defaultEdgeConfig, vertex1: 3 }
				// 	]
				// },
				// {
				// 	name: 'square3',
				// 	id: generateTempId('cfg'),
				// 	edges: [
				// 		{ ...defaultEdgeConfig, vertex1: 0 },
				// 		{ ...defaultEdgeConfig, vertex1: 3, isDirectionMatched: false },
				// 		{ ...defaultEdgeConfig, vertex1: 4 }
				// 	]
				// },
				// {
				// 	name: 'square4',
				// 	id: generateTempId('cfg'),
				// 	edges: [
				// 		{ ...defaultEdgeConfig, vertex1: 0 },
				// 		{ ...defaultEdgeConfig, vertex1: 4, isDirectionMatched: false },
				// 		{ ...defaultEdgeConfig, vertex1: 5 }
				// 	]
				// },
				// {
				// 	name: 'square5',
				// 	id: generateTempId('cfg'),
				// 	edges: [
				// 		{ ...defaultEdgeConfig, vertex1: 0 },
				// 		{ ...defaultEdgeConfig, vertex1: 5, isDirectionMatched: false },
				// 		{ ...defaultEdgeConfig, vertex1: 1 }
				// 	]
				// },
				{
					name: 'square6',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 1, widthCurve: 1 },
						{ ...defaultEdgeConfig, vertex1: 5, widthCurve: 1, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 6, widthCurve: 1 }
					]
				},
				{
					name: 'square7',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 2, widthCurve: 1 },
						{ ...defaultEdgeConfig, vertex1: 1, widthCurve: 1, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 7, widthCurve: 1 }
					]
				},
				{
					name: 'square8',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 3, widthCurve: 1 },
						{ ...defaultEdgeConfig, vertex1: 2, widthCurve: 1, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 8, widthCurve: 1 }
					]
				},
				{
					name: 'square9',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 4, widthCurve: 1 },
						{ ...defaultEdgeConfig, vertex1: 3, widthCurve: 1, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 9, widthCurve: 1 }
					]
				},
				{
					name: 'square10',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 5, widthCurve: 1 },
						{ ...defaultEdgeConfig, vertex1: 4, widthCurve: 1, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 10, widthCurve: 1 }
					]
				},
				{
					name: 'square11',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 1 },
						{ ...defaultEdgeConfig, vertex1: 6, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 11 }
					]
				},
				{
					name: 'square12',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 1, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 11, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 7 }
					]
				},
				{
					name: 'square13',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 2 },
						{ ...defaultEdgeConfig, vertex1: 7, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 12 }
					]
				},
				{
					name: 'square14',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 2, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 12, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 8 }
					]
				},
				{
					name: 'square15',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 3 },
						{ ...defaultEdgeConfig, vertex1: 8, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 13 }
					]
				},
				{
					name: 'square16',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 3, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 13, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 9 }
					]
				},
				{
					name: 'square17',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 4 },
						{ ...defaultEdgeConfig, vertex1: 9, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 14 }
					]
				},
				{
					name: 'square18',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 4, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 14, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 10 }
					]
				},
				{
					name: 'square19',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 5 },
						{ ...defaultEdgeConfig, vertex1: 10, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 15 }
					]
				},
				{
					name: 'square20',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 5, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 15, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 6 }
					]
				},
				{
					name: 'square21',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 6 },
						{ ...defaultEdgeConfig, vertex1: 15, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 16 }
					]
				},
				{
					name: 'square22',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 6, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 16, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 11 }
					]
				},
				{
					name: 'square23',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 7 },
						{ ...defaultEdgeConfig, vertex1: 11, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 17 }
					]
				},
				{
					name: 'square24',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 7, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 17, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 12 }
					]
				},
				{
					name: 'square25',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 8 },
						{ ...defaultEdgeConfig, vertex1: 12, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 18 }
					]
				},
				{
					name: 'square26',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 8, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 18, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 13 }
					]
				},
				{
					name: 'square27',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 9 },
						{ ...defaultEdgeConfig, vertex1: 13, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 19 }
					]
				},
				{
					name: 'square28',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 9, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 19, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 14 }
					]
				},
				{
					name: 'square29',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 10 },
						{ ...defaultEdgeConfig, vertex1: 14, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 20 }
					]
				},
				{
					name: 'square30',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 10, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 20, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 15 }
					]
				},
				{
					name: 'square31',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 14, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 19, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 24 }
					]
				},
				{
					name: 'square32',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 14, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 24 },
						{ ...defaultEdgeConfig, vertex1: 20 }
					]
				},
				{
					name: 'square33',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 15, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 20, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 25 }
					]
				},
				{
					name: 'square34',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 15, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 25 },
						{ ...defaultEdgeConfig, vertex1: 16 }
					]
				},
				{
					name: 'square35',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 11, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 16, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 21 }
					]
				},
				{
					name: 'square36',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 11, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 21 },
						{ ...defaultEdgeConfig, vertex1: 17 }
					]
				},
				{
					name: 'square37',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 12, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 17, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 22 }
					]
				},
				{
					name: 'square38',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 12, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 22 },
						{ ...defaultEdgeConfig, vertex1: 18 }
					]
				},
				{
					name: 'square39',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 13, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 18, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 23 }
					]
				},
				{
					name: 'square40',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 13, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 23 },
						{ ...defaultEdgeConfig, vertex1: 19 }
					]
				},
				{
					name: 'square41',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 17, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 21, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 27 }
					]
				},
				{
					name: 'square42',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 17, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 27 },
						{ ...defaultEdgeConfig, vertex1: 22 }
					]
				},
				{
					name: 'square43',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 18, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 22, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 28 }
					]
				},
				{
					name: 'square44',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 18, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 28 },
						{ ...defaultEdgeConfig, vertex1: 23 }
					]
				},
				{
					name: 'square45',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 19, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 23, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 29 }
					]
				},
				{
					name: 'square46',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 19, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 29 },
						{ ...defaultEdgeConfig, vertex1: 24 }
					]
				},
				{
					name: 'square47',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 20, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 24, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 30 }
					]
				},
				{
					name: 'square48',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 20, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 30 },
						{ ...defaultEdgeConfig, vertex1: 25 }
					]
				},
				{
					name: 'square49',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 16, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 25, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 26 }
					]
				},
				{
					name: 'square50',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 16, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 26 },
						{ ...defaultEdgeConfig, vertex1: 21 }
					]
				},
				{
					name: 'square51',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 21, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 26, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 27, isDirectionMatched: false }
					]
				},
				{
					name: 'square52',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 22, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 27, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 28, isDirectionMatched: false }
					]
				},
				{
					name: 'square53',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 23, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 28, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 29, isDirectionMatched: false }
					]
				},
				{
					name: 'square54',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 24, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 29, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 30, isDirectionMatched: false }
					]
				},
				{
					name: 'square55',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 25, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 30, isDirectionMatched: false },
						{ ...defaultEdgeConfig, vertex1: 26, isDirectionMatched: false }
					]
				},
				{
					name: 'square56',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 26 },
						{ ...defaultEdgeConfig, vertex1: 31 },
						{ ...defaultEdgeConfig, vertex1: 27, isDirectionMatched: false }
					]
				},
				{
					name: 'square57',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 27 },
						{ ...defaultEdgeConfig, vertex1: 31 },
						{ ...defaultEdgeConfig, vertex1: 28, isDirectionMatched: false }
					]
				},
				{
					name: 'square58',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 28 },
						{ ...defaultEdgeConfig, vertex1: 31 },
						{ ...defaultEdgeConfig, vertex1: 29, isDirectionMatched: false }
					]
				},
				{
					name: 'square59',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 29 },
						{ ...defaultEdgeConfig, vertex1: 31 },
						{ ...defaultEdgeConfig, vertex1: 30, isDirectionMatched: false }
					]
				},
				{
					name: 'square60',
					id: generateTempId('cfg'),
					edges: [
						{ ...defaultEdgeConfig, vertex1: 30 },
						{ ...defaultEdgeConfig, vertex1: 31 },
						{ ...defaultEdgeConfig, vertex1: 26, isDirectionMatched: false }
					]
				}
			]
		}
	}
};

function convertXYZtoVertices(xyz: string): VerticesConfig {
	let vertices = xyz.split('\n').map((line) => {
		const coords = line.split(' ').map(Number);
		return {
			x: coords[0],
			y: coords[1],
			z: coords[2]
		} as Point3;
	});
	vertices = vertices.sort((a, b) => {
		return a.z - b.z;
	});
	return vertices;
}
