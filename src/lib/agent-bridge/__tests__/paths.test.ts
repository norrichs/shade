import { getAtPath, setAtPath, summarize } from '../paths';

describe('agent bridge paths', () => {
	const root = { a: { b: [{ c: 1 }, { c: 2 }] }, keep: { x: 1 } };

	it('reads nested keys and array indexes', () => {
		expect(getAtPath(root, 'a.b.1.c')).toBe(2);
		expect(getAtPath(root, '')).toBe(root);
	});

	it('throws on a missing path', () => {
		expect(() => getAtPath(root, 'a.nope')).toThrow(/failed at "nope"/);
	});

	it('writes immutably and preserves untouched branches', () => {
		const next = setAtPath(root, 'a.b.0.c', 9);
		expect(next.a.b[0].c).toBe(9);
		expect(root.a.b[0].c).toBe(1);
		expect(next.keep).toBe(root.keep);
		expect(next.a.b[1]).toBe(root.a.b[1]);
		expect(Array.isArray(next.a.b)).toBe(true);
	});

	it('allows adding a leaf key but not inventing intermediate containers', () => {
		expect(setAtPath(root, 'keep.y', 2).keep).toEqual({ x: 1, y: 2 });
		expect(() => setAtPath(root, 'missing.y', 2)).toThrow(/does not exist/);
	});

	it('rejects non-index keys on arrays', () => {
		expect(() => setAtPath(root, 'a.b.foo', 1)).toThrow(/not a valid index/);
	});

	it('summarizes beyond depth and elides long arrays', () => {
		const big = { pts: Array.from({ length: 20 }, (_, i) => i), deep: { d: { e: { f: 1 } } } };
		const s = summarize(big, 2, 3) as Record<string, unknown>;
		expect(s.pts).toEqual([0, 1, 2, '… 17 more']);
		expect((s.deep as Record<string, unknown>).d).toBe('{e}');
	});
});
