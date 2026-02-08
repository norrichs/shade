import { generateTempId } from '$lib/id-handler';
import { defaultCrossSection, secondEdgeCurveConfig } from '../curve-definitions';
import {
	convertXYZtoVertices,
	computeMixedPolygonMap,
	generatePolygonConfigs,
	type FaceSpec
} from '../generate-polyhedra';
import type { CurveIndex, PolyhedronConfig, VertexIndex } from '../types';

const truncatedDodecahedronXYZString = `-130.90170288 4.59736729 138.91818237
-130.90170288 -4.59736729 114.84605408
-112.34380341 6.11704111 58.74468231
-112.34380341 49.98432922 173.59072876
-99.45960236 22.75047302 43.8672905
-69.43228912 74.75930023 43.8672905
-99.45960236 72.30042267 173.59072876
-61.46941376 94.23406219 58.74468231
-69.43228912 111.06551361 138.91818237
-61.46941376 115.66287994 114.84605408
130.90170288 -4.59736729 114.84605408
112.34380341 -49.98432922 80.17350006
112.34380341 6.11704111 58.74468231
-50.87438583 100.35110474 195.01954651
-112.34380341 -6.11704111 195.01954651
-50.87438583 -29.37234116 244.56950378
-30.02731323 -17.33627701 253.76423645
0 58.74468231 244.56950378
0 34.67255402 253.76423645
-50.87438583 29.37234116 9.19473457
-30.02731323 17.33627701 -0
-12.8842001 122.28475189 80.17350006
30.02731323 17.33627701 -0
12.8842001 122.28475189 80.17350006
61.46941376 94.23406219 58.74468231
50.87438583 29.37234116 9.19473457
69.43228912 74.75930023 43.8672905
61.46941376 -94.23406219 195.01954651
12.8842001 -122.28475189 173.59072876
61.46941376 -115.66287994 138.91818237
30.02731323 -17.33627701 253.76423645
50.87438583 100.35110474 195.01954651
50.87438583 -29.37234116 244.56950378
99.45960236 72.30042267 173.59072876
112.34380341 49.98432922 173.59072876
112.34380341 -6.11704111 195.01954651
130.90170288 4.59736729 138.91818237
99.45960236 22.75047302 43.8672905
69.43228912 111.06551361 138.91818237
61.46941376 115.66287994 114.84605408
-99.45960236 -72.30042267 80.17350006
-112.34380341 -49.98432922 80.17350006
-50.87438583 -100.35110474 58.74468231
-30.02731323 -97.50977325 43.8672905
-0 -34.67255402 0
-0 -58.74468231 9.19473457
99.45960236 -72.30042267 80.17350006
50.87438583 -100.35110474 58.74468231
69.43228912 -111.06551361 114.84605408
30.02731323 -97.50977325 43.8672905
-69.43228912 -111.06551361 114.84605408
-61.46941376 -115.66287994 138.91818237
-12.8842001 -122.28475189 173.59072876
-61.46941376 -94.23406219 195.01954651
-99.45960236 -22.75047302 209.89694214
-69.43228912 -74.75930023 209.89694214
-30.02731323 97.50977325 209.89694214
30.02731323 97.50977325 209.89694214
69.43228912 -74.75930023 209.89694214
99.45960236 -22.75047302 209.89694214`;

const vertices = convertXYZtoVertices(truncatedDodecahedronXYZString, 1, true);

const faces: FaceSpec[] = [
	{ type: 'triangle', vertices: [2, 1, 0] },
	{ type: 'decagon', vertices: [2, 1, 4, 9, 14, 18, 23, 17, 11, 5] },
	{ type: 'decagon', vertices: [1, 0, 3, 7, 13, 19, 20, 15, 8, 4] },
	{ type: 'decagon', vertices: [0, 2, 5, 10, 16, 21, 22, 12, 6, 3] },
	{ type: 'triangle', vertices: [5, 10, 11] },
	{ type: 'triangle', vertices: [4, 9, 8] },
	{ type: 'triangle', vertices: [3, 7, 6] },
	{ type: 'decagon', vertices: [10, 16, 29, 35, 41, 38, 32, 28, 17, 11] },
	{ type: 'decagon', vertices: [9, 14, 26, 33, 40, 39, 34, 27, 15, 8] },
	{ type: 'decagon', vertices: [7, 13, 25, 31, 37, 36, 30, 24, 12, 6] },
	{ type: 'triangle', vertices: [16, 21, 29] },
	{ type: 'triangle', vertices: [17, 23, 28] },
	{ type: 'triangle', vertices: [14, 18, 26] },
	{ type: 'triangle', vertices: [15, 20, 27] },
	{ type: 'triangle', vertices: [13, 19, 25] },
	{ type: 'triangle', vertices: [12, 22, 24] },
	{ type: 'decagon', vertices: [22, 21, 29, 35, 47, 49, 48, 43, 30, 24] },
	{ type: 'decagon', vertices: [23, 18, 26, 33, 46, 53, 52, 44, 32, 28] },
	{ type: 'decagon', vertices: [20, 19, 25, 31, 42, 50, 51, 45, 34, 27] },
	{ type: 'triangle', vertices: [35, 47, 41] },
	{ type: 'triangle', vertices: [32, 44, 38] },
	{ type: 'triangle', vertices: [33, 46, 40] },
	{ type: 'triangle', vertices: [34, 45, 39] },
	{ type: 'triangle', vertices: [31, 42, 37] },
	{ type: 'triangle', vertices: [30, 43, 36] },
	{ type: 'decagon', vertices: [38, 41, 47, 49, 54, 57, 59, 56, 52, 44] },
	{ type: 'decagon', vertices: [39, 40, 46, 53, 56, 59, 58, 55, 51, 45] },
	{ type: 'decagon', vertices: [36, 37, 42, 50, 55, 58, 57, 54, 48, 43] },
	{ type: 'triangle', vertices: [48, 49, 54] },
	{ type: 'triangle', vertices: [52, 53, 56] },
	{ type: 'triangle', vertices: [51, 50, 55] },
	{ type: 'triangle', vertices: [57, 59, 58] }
];

const polygonMap = computeMixedPolygonMap({ vertices, faces, radialSymmetry: 3 });

const truncatedDodecahedron: PolyhedronConfig<undefined, VertexIndex, CurveIndex, CurveIndex> = {
	name: 'Truncated Dodecahedron',
	id: generateTempId('cfg'),
	polygons: generatePolygonConfigs({ vertices, polygonMap, radialSymmetry: 3 }),
	crossSectionCurves: [defaultCrossSection],
	edgeCurves: [secondEdgeCurveConfig],
	vertices,
	transform: 'inherit'
};

export default truncatedDodecahedron;
