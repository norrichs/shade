import { generateTempId } from '$lib/id-handler';
import { defaultCrossSection, secondEdgeCurveConfig } from '../curve-definitions';
import {
	convertXYZtoVertices,
	computeMixedPolygonMap,
	generatePolygonConfigs,
	type FaceSpec
} from '../generate-polyhedra';
import type { PolyhedronConfig_Initial } from '../types';

const FULLERENE_SCALE_FACTOR = 50;

const fullereneXYZString = `-2.43201065 0 -2.60264564
-1.99178147 2.3129797 -1.83612978
-2.81526875 1.17954683 -1.83612978
-1.24024892 -0 -3.33919501
-0.75153261 2.3129797 -2.60264564
-0.38325799 1.17954683 -3.33919501
0.2518498 3.04197955 -1.83612978
1.00338244 0.72899997 -3.33919501
1.58428001 2.6090467 -1.83612978
1.967538 1.42949998 -2.60264564
-3.2077868 1.42949998 0.59588087
-3.4353931 0.72899997 -0.59588087
-2.35079598 2.6090467 0.59588087
-1.754915 3.04197955 -0.59588087
-1.754915 -3.04197955 -0.59588087
0.36827466 -3.49252629 0.59588087
-0.36827466 -3.49252629 -0.59588087
-2.35079598 -2.6090467 0.59588087
-1.58428001 -2.6090467 1.83612978
-0.2518498 -3.04197955 1.83612978
-1.99178147 -2.3129797 -1.83612978
-3.2077868 -1.42949998 0.59588087
-2.81526875 -1.17954683 -1.83612978
-3.4353931 -0.72899997 -0.59588087
2.81526875 1.17954683 1.83612978
3.2077868 1.42949998 -0.59588087
3.4353931 0.72899997 0.59588087
1.99178147 2.3129797 1.83612978
2.35079598 2.6090467 -0.59588087
1.754915 3.04197955 0.59588087
-1.967538 -1.42949998 2.60264564
-2.97092032 -0.70050001 1.83612978
-0.2518498 3.04197955 1.83612978
0.36827466 3.49252629 0.59588087
0.75153261 2.3129797 2.60264564
2.35079598 -2.6090467 -0.59588087
1.967538 -1.42949998 -2.60264564
1.58428001 -2.6090467 -1.83612978
3.2077868 -1.42949998 -0.59588087
2.97092032 -0.70050001 -1.83612978
2.97092032 0.70050001 -1.83612978
-0.36827466 3.49252629 -0.59588087
-2.97092032 0.70050001 1.83612978
-1.58428001 2.6090467 1.83612978
-1.967538 1.42949998 2.60264564
-1.00338244 0.72899997 3.33919501
-1.00338244 -0.72899997 3.33919501
3.4353931 -0.72899997 0.59588087
-0.75153261 -2.3129797 -2.60264564
-0.38325799 -1.17954683 -3.33919501
1.24024892 -0 3.33919501
0.38325799 1.17954683 3.33919501
2.43201065 0 2.60264564
0.75153261 -2.3129797 2.60264564
0.38325799 -1.17954683 3.33919501
1.99178147 -2.3129797 1.83612978
2.81526875 -1.17954683 1.83612978
1.754915 -3.04197955 0.59588087
1.00338244 -0.72899997 -3.33919501
0.2518498 -3.04197955 -1.83612978`;

const vertices = convertXYZtoVertices(fullereneXYZString, FULLERENE_SCALE_FACTOR);

const faces: FaceSpec[] = [
	{ type: 'pentagon', vertices: [0, 3, 4, 2, 1] },
	{ type: 'hexagon', vertices: [0, 3, 9, 14, 15, 5] },
	{ type: 'hexagon', vertices: [3, 4, 8, 16, 19, 9] },
	{ type: 'hexagon', vertices: [4, 2, 7, 18, 17, 8] },
	{ type: 'hexagon', vertices: [2, 1, 6, 12, 13, 7] },
	{ type: 'hexagon', vertices: [1, 0, 5, 11, 10, 6] },
	{ type: 'pentagon', vertices: [5, 15, 24, 20, 11] },
	{ type: 'pentagon', vertices: [9, 19, 23, 22, 14] },
	{ type: 'pentagon', vertices: [8, 17, 28, 27, 16] },
	{ type: 'pentagon', vertices: [7, 13, 26, 25, 18] },
	{ type: 'pentagon', vertices: [6, 10, 21, 29, 12] },
	{ type: 'hexagon', vertices: [15, 14, 22, 33, 34, 24] },
	{ type: 'hexagon', vertices: [19, 16, 27, 39, 32, 23] },
	{ type: 'hexagon', vertices: [17, 18, 25, 35, 38, 28] },
	{ type: 'hexagon', vertices: [13, 12, 29, 37, 36, 26] },
	{ type: 'hexagon', vertices: [10, 11, 20, 30, 31, 21] },
	{ type: 'hexagon', vertices: [24, 34, 44, 46, 30, 20] },
	{ type: 'hexagon', vertices: [23, 32, 41, 40, 33, 22] },
	{ type: 'hexagon', vertices: [28, 38, 49, 48, 39, 27] },
	{ type: 'hexagon', vertices: [26, 36, 43, 42, 35, 25] },
	{ type: 'hexagon', vertices: [21, 31, 47, 45, 37, 29] },
	{ type: 'pentagon', vertices: [34, 33, 40, 50, 44] },
	{ type: 'pentagon', vertices: [32, 39, 48, 54, 41] },
	{ type: 'pentagon', vertices: [38, 35, 42, 53, 49] },
	{ type: 'pentagon', vertices: [36, 37, 45, 51, 43] },
	{ type: 'pentagon', vertices: [31, 30, 46, 52, 47] },
	{ type: 'hexagon', vertices: [44, 50, 56, 55, 52, 46] },
	{ type: 'hexagon', vertices: [41, 54, 59, 56, 50, 40] },
	{ type: 'hexagon', vertices: [49, 53, 57, 59, 54, 48] },
	{ type: 'hexagon', vertices: [43, 51, 58, 57, 53, 42] },
	{ type: 'hexagon', vertices: [47, 52, 55, 58, 51, 45] },
	{ type: 'pentagon', vertices: [56, 59, 57, 58, 55] }
];

const polygonMap = computeMixedPolygonMap({ vertices, faces, radialSymmetry: 5 });

const fullerene: PolyhedronConfig_Initial = {
	name: 'Fullerene',
	id: generateTempId('cfg'),
	polygons: generatePolygonConfigs({ vertices, polygonMap }),
	crossSectionCurves: [defaultCrossSection],
	edgeCurves: [secondEdgeCurveConfig],
	vertices,
	transform: 'inherit'
};

export default fullerene;
