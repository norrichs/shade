import { nestPageLayout, type NestGeom } from '$lib/cut-pattern/page-layout/nest/nest';
import type { NestShape } from '$lib/cut-pattern/page-layout/nest/types';
import type { PageRect } from '$lib/cut-pattern/page-layout/types';

export type NestRequest = { requestId: number; shapes: NestShape[]; geom: NestGeom };
export type NestWireResult = {
	origins: { x: number; y: number }[];
	rotations: number[];
	pages: PageRect[];
	overflow?: { itemIndex: number; requiredScale: number };
	utilisation?: number[];
};
export type NestResponse = { requestId: number; result?: NestWireResult; error?: string };

export const runNestRequest = (req: NestRequest): NestResponse => {
	try {
		const r = nestPageLayout(req.shapes, req.geom);
		return {
			requestId: req.requestId,
			result: { ...r, origins: r.origins.map((o) => ({ x: o.x, y: o.y })) }
		};
	} catch (e) {
		return { requestId: req.requestId, error: e instanceof Error ? e.message : String(e) };
	}
};
