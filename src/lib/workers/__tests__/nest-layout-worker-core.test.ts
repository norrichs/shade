import { runNestRequest } from '../nest-layout-worker-core';
const geom = {
	pageScale: 1,
	pageWidth: 100,
	pageHeight: 100,
	contentWidth: 100,
	contentHeight: 100,
	marginPx: 0,
	pageGap: 10,
	gap: 0,
	reorderWindow: 1,
	allowRotation: false,
	rotationStep: 0,
	cellMm: 1
};
const sq = {
	polygons: [
		[
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 }
		]
	],
	pivot: { x: 5, y: 5 }
};
it('echoes requestId and returns plain-object origins', () => {
	const r = runNestRequest({ requestId: 7, shapes: [sq], geom });
	expect(r.requestId).toBe(7);
	expect(r.result?.origins[0]).toEqual({ x: expect.any(Number), y: expect.any(Number) });
	expect(Object.getPrototypeOf(r.result!.origins[0])).toBe(Object.prototype);
});
it('reports errors instead of throwing', () => {
	const r = runNestRequest({ requestId: 1, shapes: null as never, geom });
	expect(r.error).toBeTruthy();
});
