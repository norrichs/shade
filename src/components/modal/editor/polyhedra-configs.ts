import cube from '$lib/projection-geometry/models/cube';
import doublyTruncatedIcosohedron from '$lib/projection-geometry/models/doubly-truncated-icosohedron';
import fullerene from '$lib/projection-geometry/models/fullerene';
import geodesic from '$lib/projection-geometry/models/geodesic';
import icosohedron from '$lib/projection-geometry/models/icosohedron';
import p60Dodecahedron from '$lib/projection-geometry/models/p60dodecahedron';
import tetrahedron from '$lib/projection-geometry/models/tetrahedron';
import truncatedDodecahedron from '$lib/projection-geometry/models/truncated-dodecahedron';
import type { PolyhedronConfig, VertexIndex, CurveIndex } from '$lib/projection-geometry/types';

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
