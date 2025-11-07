import { generateTempId } from "$lib/id-handler";
import { defaultCrossSection, defaultEdgeConfig, secondEdgeCurveConfig } from "../curve-definitions";
import type { VerticesConfig, PolyhedronConfig, VertexIndex, CurveIndex } from "../types";

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

export default icosohedron