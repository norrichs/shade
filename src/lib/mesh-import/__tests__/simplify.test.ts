import { describe, it, expect } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import { IcosahedronGeometry, Mesh } from 'three';
import { cleanMesh } from '../clean-mesh';
import { hashMesh } from '../asset-store';
import { simplifyAsset, simplifyMesh } from '../simplify';
import type { MeshAsset } from '../types';

if (!globalThis.crypto?.subtle) {
	(globalThis as { crypto: unknown }).crypto = webcrypto;
}

const dense = () => cleanMesh(new Mesh(new IcosahedronGeometry(1, 12))); // 3380 triangles

describe('simplifyMesh', () => {
	it('reduces to at most the target triangle count', async () => {
		const source = dense();
		const result = await simplifyMesh(source, 500);
		const triangles = result.index.length / 3;
		expect(triangles).toBeGreaterThan(0);
		expect(triangles).toBeLessThanOrEqual(500);
		// compacted: every vertex is referenced
		expect(result.positions.length / 3).toBeLessThanOrEqual(source.positions.length / 3);
		expect(Math.max(...result.index)).toBe(result.positions.length / 3 - 1);
	});

	it('never increases the triangle count', async () => {
		const source = dense();
		const result = await simplifyMesh(source, 1_000_000);
		expect(result.index.length).toBe(source.index.length);
	});

	it('is deterministic', async () => {
		const a = await simplifyMesh(dense(), 400);
		const b = await simplifyMesh(dense(), 400);
		expect(await hashMesh(a)).toBe(await hashMesh(b));
	});
});

describe('simplifyAsset', () => {
	it('produces a new derived asset', async () => {
		const clean = dense();
		const source: MeshAsset = {
			...clean,
			id: await hashMesh(clean),
			fileName: 'ball.glb',
			sourceFormat: 'glb',
			createdAt: '2026-10-05T00:00:00.000Z'
		};
		const derived = await simplifyAsset(source, 300);
		expect(derived.id).not.toBe(source.id);
		expect(derived.derivedFrom).toEqual({ assetId: source.id, targetTriangles: 300 });
		expect(derived.diagnostics.triangles).toBe(derived.index.length / 3);
		expect(derived.fileName).toBe('ball.glb');
	});

	it('returns the source unchanged when no reduction is needed', async () => {
		const clean = dense();
		const source: MeshAsset = {
			...clean,
			id: await hashMesh(clean),
			fileName: 'ball.glb',
			sourceFormat: 'glb',
			createdAt: '2026-10-05T00:00:00.000Z'
		};
		const result = await simplifyAsset(source, 1_000_000);
		expect(result).toBe(source);
		expect(result.id).toBe(source.id);
		expect(result.derivedFrom).toBeUndefined();
	});
});
