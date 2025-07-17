import type { GeometryConfigType } from '$lib/types';

// TODO - learn how to compose a signature that specifies enumerated keys
export const colorByType: { [key: string]: string } = {
	ShapeConfig: 'azure',
	SpineCurveConfig: 'beige'
};
