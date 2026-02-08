import { generateTempId } from '$lib/id-handler';
import {
	defaultCrossSection,
	secondEdgeCurveConfig,
	defaultEdgeConfig
} from '../curve-definitions';

import type { VerticesConfig, PolyhedronConfig, VertexIndex, CurveIndex } from '../types';

const pTetrahedron: VerticesConfig = [
	{ x: 0, y: 0, z: 100 },
	{ x: -81.64966, y: -47.14045, z: -33.33333 },
	{ x: 81.64966, y: -47.14045, z: -33.33333 },
	{ x: 0, y: 94.2809, z: -33.33333 }
];

const tetrahedron: PolyhedronConfig<undefined, VertexIndex, CurveIndex, CurveIndex> = {
	name: 'Regular Tetrahedron',
	id: generateTempId('cfg'),
	crossSectionCurves: [defaultCrossSection],
	edgeCurves: [secondEdgeCurveConfig],
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
};

export default tetrahedron;
