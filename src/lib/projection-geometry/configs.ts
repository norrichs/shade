import { generateTempId } from '$lib/id-handler';
import type { BezierConfig, CurveSampleMethod } from '$lib/types';
import { secondEdgeCurve } from './curve-definitions';
import cube from './models/cube';
import doublyTruncatedIcosohedron from './models/doubly-truncated-icosohedron';
import icosohedron from './models/icosohedron';
import p60Dodecahedron from './models/p60dodecahedron';
import tetrahedron from './models/tetrahedron';
import truncatedDodecahedron from './models/truncated-dodecahedron';
import { defaultSurfaceConfig } from './surface-definitions';
import type {
	ProjectorConfig,
	ProjectionConfig,
	ProjectionBandConfig,
	VertexIndex,
	CurveIndex,
	TransformConfig,
} from './types';


const projectorConfigs: {
	[key: string]: ProjectorConfig<undefined, VertexIndex, CurveIndex, CurveIndex>;
} = {
	icosohedron: {
		name: 'defaultProjectorConfig',
		id: generateTempId('cfg'),
		polyhedron: icosohedron
	},
	tetrahedron: {
		name: 'defaultProjectorConfig',
		id: generateTempId('cfg'),
		polyhedron: tetrahedron
	},
	cube: {
		name: 'defaultProjectorConfig',
		id: generateTempId('cfg'),
		polyhedron: cube
	},
	poly60dodeca: {
		name: 'defaultProjectorConfig',
		id: generateTempId('cfg'),
		polyhedron: p60Dodecahedron
	},
	truncatedDodecahedron: {
		name: 'defaultTruncatedDodecahedronConfig',
		id: generateTempId('cfg'),
		polyhedron: doublyTruncatedIcosohedron
	}
};

const defaultBandConfig: ProjectionBandConfig = {
	orientation: 'axial-right',
	tubeSymmetry: 'lateral'
};

const defaultProjectorConfig = projectorConfigs.truncatedDodecahedron;

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
