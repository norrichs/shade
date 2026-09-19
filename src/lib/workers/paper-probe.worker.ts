import { uniteMany } from '$lib/paper';
import type { PathSegment } from '$lib/types';

const square = (x: number, y: number, size: number): PathSegment[] => [
	['M', x, y],
	['L', x + size, y],
	['L', x + size, y + size],
	['L', x, y + size],
	['Z']
];

self.onmessage = () => {
	try {
		const united = uniteMany([square(0, 0, 10), square(5, 0, 10)]);
		const contours = united.filter((s) => s[0] === 'M').length;
		self.postMessage({ ok: true, contours, segments: united.length });
	} catch (error) {
		self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
	}
};
