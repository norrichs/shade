import cube from '#lib/projection-geometry/models/cube.js';
import doublyTruncatedIcosohedron from '#lib/projection-geometry/models/doubly-truncated-icosohedron.js';
import fullerene from '#lib/projection-geometry/models/fullerene.js';
import geodesic from '#lib/projection-geometry/models/geodesic.js';
import icosohedron from '#lib/projection-geometry/models/icosohedron.js';
import p60Dodecahedron from '#lib/projection-geometry/models/p60dodecahedron.js';
import tetrahedron from '#lib/projection-geometry/models/tetrahedron.js';
import truncatedDodecahedron from '#lib/projection-geometry/models/truncated-dodecahedron.js';
import type { PolyhedronConfig, VertexIndex, CurveIndex } from '#lib/projection-geometry/types.js';

export const polyhedronConfigs: PolyhedronConfig<undefined, VertexIndex, CurveIndex, CurveIndex>[] =
	[
		tetrahedron,
		cube,
		icosohedron,
		fullerene,
		p60Dodecahedron,
		truncatedDodecahedron,
		doublyTruncatedIcosohedron,
		geodesic
	];
