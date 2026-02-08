import { generateTempId } from '$lib/id-handler';
import {
	defaultCrossSection,
	defaultEdgeConfig,
	secondEdgeCurveConfig
} from '../curve-definitions';

import type { PolyhedronConfig, VertexIndex, CurveIndex, VerticesConfig } from '../types';

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

export default cube;
