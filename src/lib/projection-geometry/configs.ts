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
	VerticesConfig,
	TransformConfig
} from './types';

const defaultSphereConfig: SphereConfig = {
	type: 'SphereConfig',
	radius: 220,
	center: { x: 0, y: 0, z: 0 }
};

const defaultSurfaceConfig: SurfaceConfig = {
	...defaultSphereConfig,
	transform: 'inherit'
};

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

const secondEdgeCurve: BezierConfig[] = [
	{
		type: 'BezierConfig',
		points: [
			{ type: 'PointConfig2', x: 0.75, y: 0 },
			{ type: 'PointConfig2', x: 0.6, y: 0.4 },
			{ type: 'PointConfig2', x: 0.6, y: 0.6 },
			{ type: 'PointConfig2', x: 0.75, y: 1 }
		]
	}
];

const defaultEdgeCurve: BezierConfig[] = [
	{
		type: 'BezierConfig',
		points: [
			{ type: 'PointConfig2', x: 0.6, y: 0 },
			{ type: 'PointConfig2', x: 0.5, y: 0.1 },
			{ type: 'PointConfig2', x: 0.5, y: 0.2 },
			{ type: 'PointConfig2', x: 0.3, y: 0.4 }
		]
	},
	{
		type: 'BezierConfig',
		points: [
			{ type: 'PointConfig2', x: 0.3, y: 0.4 },
			{ type: 'PointConfig2', x: 0.2, y: 0.5 },
			{ type: 'PointConfig2', x: 0.2, y: 0.5 },
			{ type: 'PointConfig2', x: 0.3, y: 0.6 }
		]
	},
	{
		type: 'BezierConfig',
		points: [
			{ type: 'PointConfig2', x: 0.3, y: 0.6 },
			{ type: 'PointConfig2', x: 0.5, y: 0.8 },
			{ type: 'PointConfig2', x: 0.5, y: 0.9 },
			{ type: 'PointConfig2', x: 0.6, y: 1 }
		]
	}
];
const defaultEdgeSampleMethod: CurveSampleMethod = { method: 'divideCurvePath', divisions: 4 };
const defaultEdgeCurveConfig: EdgeCurveConfig = {
	curves: secondEdgeCurve,
	// curves: asymmetricEdgeCurve,
	sampleMethod: defaultEdgeSampleMethod
};

const secondEdgeCurveConfig: EdgeCurveConfig = {
	curves: secondEdgeCurve,
	sampleMethod: defaultEdgeSampleMethod
};
const defaultCrossSection: CrossSectionConfig = {
	curves: [
		{
			type: 'BezierConfig',
			points: [
				{ type: 'PointConfig2', x: 0, y: 0 },
				{ type: 'PointConfig2', x: 0.5, y: 0 },
				{ type: 'PointConfig2', x: 0.5, y: 1 },
				{ type: 'PointConfig2', x: 0, y: 1 }
			]
		}
	],
	center: { x: 0, y: 0.5 },
	sampleMethod: { method: 'divideCurvePath', divisions: 3 },
	scaling: { width: 'curve', height: 120 }
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

// const p60Dodeca: VerticesConfig = [
// 	{ x: 0, y: 0, z: 140.12585 },

// 	{ x: 0, y: 85.06508, z: 111.35164 },
// 	{ x: 80.9017, y: 26.28656, z: 111.35164 },
// 	{ x: 50, y: -68.8191, z: 111.35164 },
// 	{ x: -50, y: -68.8191, z: 111.35164 },
// 	{ x: -80.9017, y: 26.28656, z: 111.35164 },

// 	{ x: -73.66852, y: 101.39602, z: 62.66619 },
// 	{ x: 73.66852, y: 101.39602, z: 62.66619 },
// 	{ x: 119.19817, y: -38.72983, z: 62.66619 },
// 	{ x: 0, y: -125.33237, z: 62.66619 },
// 	{ x: -119.19817, y: -38.72983, z: 62.66619 },

// 	{ x: 0, y: 137.63819, z: 26.28656 },
// 	{ x: 130.9017, y: 42.53254, z: 26.28656 },
// 	{ x: 80.9017, y: -111.35164, z: 26.28656 },
// 	{ x: -80.9017, y: -111.35164, z: 26.28656 },
// 	{ x: -130.9017, y: 42.53254, z: 26.28656 },

// 	{ x: -80.9017, y: 111.35164, z: -26.28656 },
// 	{ x: 80.9017, y: 111.35164, z: -26.28656 },
// 	{ x: 130.9017, y: -42.53254, z: -26.28656 },
// 	{ x: 0, y: -137.63819, z: -26.28656 },
// 	{ x: -130.9017, y: -42.53254, z: -26.28656 }
// ];

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
		name: 'defaultProjectorConfig',
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
		name: 'defaultProjectorConfig',
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
		name: 'defaultProjectorConfig',
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

const defaultBandConfig: ProjectionBandConfig = {
	orientation: 'axial-right'
};

const defaultProjectorConfig = projectorConfigs.tetrahedron;

const flattenedDefaultTransform: TransformConfig = {
	translate: { x: 0, y: 0, z: 0 },
	scale: { x: 1, y: 1, z: 1 },
	rotate: { x: 0, y: 0, z: 0 }
};

export const defaultProjectionConfig: ProjectionConfig<
	undefined,
	VertexIndex,
	CurveIndex,
	CurveIndex
> = {
	surfaceConfig: defaultSurfaceConfig,
	projectorConfig: defaultProjectorConfig,
	bandConfig: defaultBandConfig,
	meta: { transform: flattenedDefaultTransform }
};
