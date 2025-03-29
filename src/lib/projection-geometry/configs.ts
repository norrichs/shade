import { generateTempId } from '$lib/id-handler';
import type { BezierConfig, CurveSampleMethod } from '$lib/types';
import type {
	ProjectorConfig,
	SphereConfig,
	SurfaceConfig,
	ProjectionConfig,
	CrossSectionConfig,
	CrossSectionScaling,
	ProjectionBandConfig,
	EdgeCurveConfig,
	VertexIndex,
	CurveIndex,
	VerticesConfig
} from './types';

const defaultSphereConfig: SphereConfig = {
	type: 'SphereConfig',
	radius: 240,
	center: { x: 0, y: 0, z: 0 }
};

const defaultSurfaceConfig: SurfaceConfig = defaultSphereConfig;

const asymmetricEdgeCurve: BezierConfig[] = [
	{
		type: 'BezierConfig',
		points: [
			{ type: 'PointConfig2', x: 0.1, y: 0 },
			{ type: 'PointConfig2', x: 0.1, y: 0 },
			{ type: 'PointConfig2', x: 0.7, y: 1 },
			{ type: 'PointConfig2', x: 0.7, y: 1 }
		]
	}
];

const defaultEdgeCurve: BezierConfig[] = [
	{
		type: 'BezierConfig',
		points: [
			{ type: 'PointConfig2', x: 0.7, y: 0 },
			{ type: 'PointConfig2', x: 0.5, y: 0.5 },
			{ type: 'PointConfig2', x: 0.5, y: 0.5 },
			{ type: 'PointConfig2', x: 0.7, y: 1 }
		]
	}
];
const defaultEdgeSampleMethod: CurveSampleMethod = { method: 'divideCurvePath', divisions: 10 };
const defaultEdgeCurveConfig: EdgeCurveConfig = {
	curves: defaultEdgeCurve,
	sampleMethod: defaultEdgeSampleMethod
};

const defaultCrossSection: CrossSectionConfig = {
	curves: [
		{
			type: 'BezierConfig',
			points: [
				{ type: 'PointConfig2', x: 0, y: 0 },
				{ type: 'PointConfig2', x: 1, y: 0 },
				{ type: 'PointConfig2', x: 1, y: 1 },
				{ type: 'PointConfig2', x: 0, y: 1 }
			]
		}
	],
	center: { x: 0, y: 0.5 },
	sampleMethod: { method: 'divideCurvePath', divisions: 10 },
	scaling: { width: 'curve', height: 40 }
};

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

// TODO: implement curve store and point store so that we can memoize common, repeated operations, such as getting points from a curve that is used often

// const projectorConfigs: { [key: string]: ProjectorConfig } = {
// 	tetrahedron: {
// 		name: 'defaultProjectorConfig',
// 		id: generateTempId('cfg'),
// 		crossSectionConfig: defaultCrossSection,
// 		polyhedron: {
// 			name: 'defaultTetrahedron',
// 			id: generateTempId('cfg'),
// 			sampleMethod: defaultEdgeSampleMethod,
// 			crossSectionScaling: defaultCrossSectionScaling,
// 			edgeMap: {
// 				edgePairs: [
// 					[
// 						[0, 0],
// 						[1, 0]
// 					],
// 					[
// 						[0, 1],
// 						[3, 0]
// 					],
// 					[
// 						[0, 2],
// 						[2, 0]
// 					],
// 					[
// 						[1, 1],
// 						[3, 2]
// 					],
// 					[
// 						[1, 2],
// 						[2, 2]
// 					],
// 					[
// 						[2, 1],
// 						[3, 1]
// 					]
// 				]
// 			},
// 			polygons: [
// 				{
// 					name: 'triangle0',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							//
// 							p0: p[0],
// 							p1: p[1],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							//
// 							p0: p[1],
// 							p1: p[2],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							//
// 							p0: p[2],
// 							p1: p[0],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle1',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							//
// 							p0: p[0],
// 							p1: p[1],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							//
// 							p0: p[1],
// 							p1: p[3],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							//
// 							p0: p[3],
// 							p1: p[0],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle2',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							//
// 							p0: p[0],
// 							p1: p[2],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							//
// 							p0: p[2],
// 							p1: p[3],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							//
// 							p0: p[3],
// 							p1: p[0],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle3',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							//
// 							p0: p[1],
// 							p1: p[2],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							//
// 							p0: p[2],
// 							p1: p[3],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							//
// 							p0: p[3],
// 							p1: p[1],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				}
// 			]
// 		}
// 	},
// 	cube: {
// 		name: 'defaultProjectorConfig',
// 		id: generateTempId('cfg'),
// 		crossSectionConfig: defaultCrossSection,
// 		polyhedron: {
// 			name: 'defaultTetrahedron',
// 			id: generateTempId('cfg'),
// 			sampleMethod: defaultEdgeSampleMethod,
// 			crossSectionScaling: defaultCrossSectionScaling,
// 			polygons: [
// 				{
// 					name: 'square1',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pSquare[0],
// 							p1: pSquare[1],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[1],
// 							p1: pSquare[2],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[2],
// 							p1: pSquare[3],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[3],
// 							p1: pSquare[0],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'square2',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pSquare[4],
// 							p1: pSquare[5],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[5],
// 							p1: pSquare[6],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[6],
// 							p1: pSquare[7],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[7],
// 							p1: pSquare[4],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'square3',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pSquare[0],
// 							p1: pSquare[1],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[1],
// 							p1: pSquare[5],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[5],
// 							p1: pSquare[4],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[4],
// 							p1: pSquare[0],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'square4',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pSquare[1],
// 							p1: pSquare[2],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[2],
// 							p1: pSquare[6],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[6],
// 							p1: pSquare[5],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[5],
// 							p1: pSquare[1],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'square5',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pSquare[2],
// 							p1: pSquare[3],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[3],
// 							p1: pSquare[7],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[7],
// 							p1: pSquare[6],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[6],
// 							p1: pSquare[2],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'square5',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pSquare[3],
// 							p1: pSquare[0],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[0],
// 							p1: pSquare[4],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[4],
// 							p1: pSquare[7],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pSquare[7],
// 							p1: pSquare[3],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				}
// 			]
// 		}
// 	},
// 	icosohedron: {
// 		name: 'defaultProjectorConfig',
// 		id: generateTempId('cfg'),
// 		crossSectionConfig: defaultCrossSection,
// 		polyhedron: {
// 			name: 'defaultIcosohedron',
// 			id: generateTempId('cfg'),
// 			sampleMethod: defaultEdgeSampleMethod,
// 			crossSectionScaling: defaultCrossSectionScaling,
// 			polygons: [
// 				{
// 					name: 'triangle1',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[0],
// 							p1: pIcosohedron[1],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[1],
// 							p1: pIcosohedron[2],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[2],
// 							p1: pIcosohedron[0],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle2',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[0],
// 							p1: pIcosohedron[2],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[2],
// 							p1: pIcosohedron[3],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[3],
// 							p1: pIcosohedron[0],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle3',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[0],
// 							p1: pIcosohedron[3],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[3],
// 							p1: pIcosohedron[4],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[4],
// 							p1: pIcosohedron[0],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle4',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[0],
// 							p1: pIcosohedron[4],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[4],
// 							p1: pIcosohedron[5],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[5],
// 							p1: pIcosohedron[0],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle5',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[0],
// 							p1: pIcosohedron[5],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[5],
// 							p1: pIcosohedron[1],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[1],
// 							p1: pIcosohedron[0],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle6',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[1],
// 							p1: pIcosohedron[2],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[2],
// 							p1: pIcosohedron[9],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[9],
// 							p1: pIcosohedron[1],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle7',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[2],
// 							p1: pIcosohedron[3],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[3],
// 							p1: pIcosohedron[10],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[10],
// 							p1: pIcosohedron[2],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle8',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[3],
// 							p1: pIcosohedron[4],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[4],
// 							p1: pIcosohedron[6],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[6],
// 							p1: pIcosohedron[3],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle9',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[4],
// 							p1: pIcosohedron[5],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[5],
// 							p1: pIcosohedron[7],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[7],
// 							p1: pIcosohedron[4],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle10',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[5],
// 							p1: pIcosohedron[1],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[1],
// 							p1: pIcosohedron[8],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[8],
// 							p1: pIcosohedron[5],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle11',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[1],
// 							p1: pIcosohedron[8],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[8],
// 							p1: pIcosohedron[9],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[9],
// 							p1: pIcosohedron[1],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle12',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[2],
// 							p1: pIcosohedron[9],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[9],
// 							p1: pIcosohedron[10],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[10],
// 							p1: pIcosohedron[2],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle13',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[3],
// 							p1: pIcosohedron[10],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[10],
// 							p1: pIcosohedron[6],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[6],
// 							p1: pIcosohedron[3],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle14',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[4],
// 							p1: pIcosohedron[6],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[6],
// 							p1: pIcosohedron[7],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[7],
// 							p1: pIcosohedron[4],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle15',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[5],
// 							p1: pIcosohedron[7],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[7],
// 							p1: pIcosohedron[8],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[8],
// 							p1: pIcosohedron[5],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle16',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[6],
// 							p1: pIcosohedron[7],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[7],
// 							p1: pIcosohedron[11],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[11],
// 							p1: pIcosohedron[6],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle17',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[7],
// 							p1: pIcosohedron[8],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[8],
// 							p1: pIcosohedron[11],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[11],
// 							p1: pIcosohedron[7],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle18',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[8],
// 							p1: pIcosohedron[9],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[9],
// 							p1: pIcosohedron[11],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[11],
// 							p1: pIcosohedron[8],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle19',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[9],
// 							p1: pIcosohedron[10],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[10],
// 							p1: pIcosohedron[11],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[11],
// 							p1: pIcosohedron[9],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				},
// 				{
// 					name: 'triangle20',
// 					id: generateTempId('cfg'),
// 					edges: [
// 						{
// 							p0: pIcosohedron[10],
// 							p1: pIcosohedron[6],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[6],
// 							p1: pIcosohedron[11],
// 							widthCurve: defaultEdgeCurve
// 						},
// 						{
// 							p0: pIcosohedron[11],
// 							p1: pIcosohedron[10],
// 							widthCurve: defaultEdgeCurve
// 						}
// 					]
// 				}
// 			]
// 		}
// 	}
// };

const defaultEdgeConfig = {
	vertex0: undefined,
	widthCurve: 0,
	crossSectionCurve: 0,
	isDirectionMatched: true
};

const projectorConfigs: {
	[key: string]: ProjectorConfig<undefined, VertexIndex, CurveIndex, CurveIndex>;
} = {
	icosohedron: {
		name: 'defaultProjectorConfig',
		id: generateTempId('cfg'),
		polyhedron: {
			name: 'defaultTetrahedron',
			id: generateTempId('cfg'),
			// sampleMethod: defaultEdgeSampleMethod,
			crossSectionCurves: [defaultCrossSection],
			edgeCurves: [defaultEdgeCurveConfig],
			vertices: pIcosohedron,

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
		name: 'defaultProjectorConfig',
		id: generateTempId('cfg'),
		polyhedron: {
			name: 'defaultTetrahedron',
			id: generateTempId('cfg'),
			// sampleMethod: defaultEdgeSampleMethod,
			crossSectionCurves: [defaultCrossSection],
			edgeCurves: [defaultEdgeCurveConfig],
			vertices: pTetrahedron,

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
	}
};

const defaultBandConfig: ProjectionBandConfig = {
	orientation: 0
};

const defaultProjectorConfig = projectorConfigs.icosohedron;

export const defaultProjectionConfig: ProjectionConfig<
	undefined,
	VertexIndex,
	CurveIndex,
	CurveIndex
> = {
	surfaceConfig: defaultSurfaceConfig,
	projectorConfig: defaultProjectorConfig,
	bandConfig: defaultBandConfig
};
