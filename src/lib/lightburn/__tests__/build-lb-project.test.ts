import { describe, it, expect } from '@jest/globals';
import { buildLbProject } from '../build-lb-project';

const pages = [
	{ x: 0, y: 0, width: 600, height: 600 },
	{ x: 0, y: 620, width: 600, height: 600 }
];

describe('buildLbProject', () => {
	it('makes one group per page with a T1 page rect in mm, Y up', () => {
		const p = buildLbProject({ shapes: [], pages, pageScale: 2 });
		expect(p.pages).toHaveLength(2);
		expect(p.pages[0].shapes[0]).toEqual({ kind: 'rect', cutIndex: 30, x: 0, y: 310, width: 300, height: 300 });
		expect(p.pages[1].shapes[0]).toEqual({ kind: 'rect', cutIndex: 30, x: 0, y: 0, width: 300, height: 300 });
	});

	it('scales, flips and assigns shapes to their page and layer', () => {
		const p = buildLbProject({
			shapes: [
				{ geometry: 'pattern-outline', segments: [['M', 100, 100], ['L', 200, 100]] },
				{ geometry: 'outline-gap', segments: [['M', 100, 700], ['L', 110, 700]] },
				{ geometry: 'page-outline', segments: [['M', 0, 0], ['L', 1, 1]] }
			],
			pages,
			pageScale: 2,
			layerMap: { 'outline-gap': 'C05' }
		});
		expect(p.pages[0].shapes[1]).toEqual({ kind: 'path', cutIndex: 0, segments: [['M', 50, 560], ['L', 100, 560]] });
		expect(p.pages[1].shapes[1]).toEqual({ kind: 'path', cutIndex: 5, segments: [['M', 50, 260], ['L', 55, 260]] });
		expect(p.pages[0].shapes).toHaveLength(2); // the DOM page-outline is ignored; the rect comes from page data
	});
});
