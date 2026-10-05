# 3D Model Import as Surface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user import a GLB / glTF / STL / OBJ file from the Surface editor and use it, cleaned and auto-fit, as the `surface` of the existing Projection and Voronoi pipelines.

**Architecture:** A new `ImportedMeshConfig` surface variant holds only a content-hash `assetId` plus fit/center params. The cleaned mesh lives in a content-addressed asset store (IndexedDB + per-thread in-memory registry) in `src/lib/mesh-import/`. `generateSurface` stays synchronous; the worker and the main thread each `ensureAssetsLoaded(config)` before generating.

**Tech Stack:** SvelteKit (Svelte 5 runes), Three.js 0.182 + addons (`GLTFLoader`, `STLLoader`, `OBJLoader`, `BufferGeometryUtils`, `MeshoptDecoder`), `three-mesh-bvh`, `meshoptimizer` (simplifier), IndexedDB, Jest (ts-jest ESM), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-3d-model-import-design.md`

## Global Constraints

- No changes to projection / Voronoi algorithm code. The only shared-generation edit is a new branch in `generateSurface` (plus a missing-asset-tolerant wrapper).
- Supported formats: `.glb`, self-contained `.gltf` (data-URI buffers), `.stl`, `.obj`. Draco → error "re-export without Draco compression". glTF external buffer URIs → error "export as GLB".
- Geometry only: materials, textures, UVs, normals from the file are ignored.
- Default fit target size: `800`. Default up axis: `+z` for STL, `+y` for everything else. App up axis is `+Z`.
- IndexedDB: database `shades-assets`, version `1`, object store `meshAssets`, keyPath `id`.
- `assetId` = lowercase hex SHA-256 of the canonical mesh bytes.
- `asset-store.ts` is the only module that knows where asset bytes live (keeps future remote persistence a one-module change).
- New runtime dependency: `meshoptimizer` (^0.22.0). New dev dependency: `fake-indexeddb`.
- Commits: only stage files the task names (other sessions work this branch — see CLAUDE.md). Never `git stash`, `git checkout -- <file>`, or `git reset`. End every commit message with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

**Note on persistence (verified during planning, not in spec):** `persistable.ts` has `OVERRIDE_PERSISTENCE = true`, so `superConfigStore` does **not** survive a page reload today — a reload always starts from the default config. The imported surface therefore "comes back" when a **saved config** (Turso) referencing it is loaded, and IndexedDB is what makes the mesh available then. The E2E test simulates that by re-setting the captured config after reload, rather than writing to the real database.

## Review Focus

1. **Two generations in flight while an asset is loading from IndexedDB** — the worker must post results in request order; a later request must not finish first and then be overwritten by the earlier, stale one. (Test in Task 6.)
2. **Exported GLBs storing positions as `InterleavedBufferAttribute`** — cleaning must read them correctly instead of crashing or producing garbage. (Test in Task 1.)
3. **A second surface built from the cached geometry** must still use the BVH-accelerated raycast; `optimizeSurfaceForRaycasting` only assigns `acceleratedRaycast` when it *builds* the tree, so a reused geometry would silently fall back to brute force. (Test in Task 5.)
4. **Saved config whose model isn't on this device** — the worker result must still resolve and the other pipelines render; the main-thread surface rebuild must not throw. (Tests in Tasks 5 and 6.)
5. **Re-picking the original file for a simplified config** must restore the *same* derived asset id (meshopt is deterministic), not reset simplification. (Test in Task 7.)

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/projection-geometry/types.ts` | modify | `UpAxis`, `ImportedMeshNormalize`, `ImportedMeshConfig`, `ImportedSurfaceConfig`; extend `SurfaceGeometryConfig` |
| `src/lib/mesh-import/types.ts` | create | `MeshSourceFormat`, `MeshDiagnostics`, `IndexedMesh`, `CleanMesh`, `MeshAsset` |
| `src/lib/mesh-import/clean-mesh.ts` | create | `cleanMesh`, `computeDiagnostics`, `compactMesh` |
| `src/lib/mesh-import/normalize.ts` | create | `DEFAULT_TARGET_SIZE`, `defaultUpAxis`, `upAxisRotation`, `computeFit`, `normalizeMatrix` |
| `src/lib/mesh-import/asset-store.ts` | create | hashing, IndexedDB, registry, `assetStatus` store, `ensureAssetsLoaded` |
| `src/lib/mesh-import/simplify.ts` | create | `simplifyMesh`, `simplifyAsset` |
| `src/lib/mesh-import/asset-geometry.ts` | create | `MissingMeshAssetError`, cached `getAssetGeometry` |
| `src/lib/projection-geometry/generate-projection.ts` | modify | `ImportedMeshConfig` branch in `generateSurface`; `generateSurfaceIfAvailable` |
| `src/lib/workers/super-globule-worker-core.ts` | modify | `ensureAssets` dep; ordered async generate |
| `src/lib/stores/workerStore.ts` | modify | await assets before posting; tolerant surface rebuild |
| `src/lib/mesh-import/parse-model.ts` | create | `ModelImportError`, `detectFormat`, `parseModel` |
| `src/lib/mesh-import/import-model.ts` | create | `ingestModelFile`, `importModelFile`, `replaceImportedModel`, `applySimplify`, `revertSimplify`, `refit` |
| `src/components/modal/editor/Surface.svelte` | modify | "Import model…" option, hidden file input |
| `src/components/modal/editor/ImportedMeshControls.svelte` | create | model / fit / center / simplify / missing-asset UI |
| `src/components/three-renderer/SurfaceCenterMarker.svelte` | create | viewport marker at the ray center |
| `src/components/three-renderer/Scene.svelte` | modify | mount the marker |
| `scripts/make-fixture-glb.mjs` | create | writes the E2E GLB fixture |
| `tests/fixtures/deformed-icosphere.glb` | create (generated) | E2E fixture |
| `tests/model-import.spec.ts` | create | E2E |
| `jest.config.js` | modify | let ts-jest transform `meshoptimizer` and `fake-indexeddb` |

`validators.ts` has no surface-config validation today (verified), so no validator change is needed.

---

### Task 1: Types and mesh cleaning

**Files:**
- Modify: `src/lib/projection-geometry/types.ts:12-33`
- Create: `src/lib/mesh-import/types.ts`
- Create: `src/lib/mesh-import/clean-mesh.ts`
- Test: `src/lib/mesh-import/__tests__/clean-mesh.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type UpAxis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z'`
  - `type ImportedMeshNormalize = { upAxis: UpAxis; targetSize: number; offset: Point3; scale: number }`
  - `type ImportedMeshConfig = { type: 'ImportedMeshConfig'; assetId: string; fileName: string; normalize: ImportedMeshNormalize; center: Point3; simplify?: { sourceAssetId: string; targetTriangles: number } }`
  - `type ImportedSurfaceConfig = ImportedMeshConfig & { transform: TransformConfig | 'inherit' }`
  - `type MeshSourceFormat`, `MeshDiagnostics`, `IndexedMesh`, `CleanMesh`, `MeshAsset` (see code)
  - `cleanMesh(root: Object3D): CleanMesh`
  - `computeDiagnostics(positions: Float32Array, index: Uint32Array, droppedPrimitives?: number): MeshDiagnostics`
  - `compactMesh(positions: Float32Array, index: Uint32Array): IndexedMesh`

- [ ] **Step 1: Add surface types**

In `src/lib/projection-geometry/types.ts`, after `CapsuleConfig` (ends line 26), add:

```ts
/** Source-file axis that should become the app's up axis (+Z). */
export type UpAxis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

/**
 * Auto-fit applied to an imported mesh before the user transform:
 * rotate source-up to +Z, shift the bbox center to the origin, scale uniformly so
 * the largest bbox dimension equals `targetSize`. `offset` and `scale` are
 * computed (see mesh-import/normalize.ts) and stored so the fit is reproducible.
 */
export type ImportedMeshNormalize = {
	upAxis: UpAxis;
	targetSize: number;
	offset: Point3;
	scale: number;
};

/**
 * A surface loaded from a user's 3D file. The mesh itself is not in the config —
 * `assetId` (content hash) resolves it through mesh-import/asset-store.ts.
 */
export type ImportedMeshConfig = {
	type: 'ImportedMeshConfig';
	assetId: string;
	fileName: string;
	normalize: ImportedMeshNormalize;
	/** Ray-cast center, in fitted space. Defaults to the origin (the fitted bbox center). */
	center: Point3;
	/** Present when `assetId` is a simplified derivative of `sourceAssetId`. */
	simplify?: { sourceAssetId: string; targetTriangles: number };
};
```

Change the union and add the convenience alias right after `SurfaceConfig`:

```ts
export type SurfaceGeometryConfig = SphereConfig | CapsuleConfig | GlobuleConfig | ImportedMeshConfig;

export type SurfaceConfig = SurfaceGeometryConfig & {
	transform: TransformConfig | 'inherit';
};

export type ImportedSurfaceConfig = ImportedMeshConfig & {
	transform: TransformConfig | 'inherit';
};
```

(`TransformConfig` is declared later in the same file; type hoisting makes that fine.)

- [ ] **Step 2: Type-check**

Run: `npm run check 2>&1 | tail -20`
Expected: same error count as before this change. If a new error appears where code reads `surfaceConfig.radius` (or another sphere/capsule-only field) after only excluding `GlobuleConfig`, narrow it with `surfaceConfig.type === 'SphereConfig'` / `'CapsuleConfig'`. `.center` reads are fine — `ImportedMeshConfig` has `center`.

- [ ] **Step 3: Create mesh-import types**

`src/lib/mesh-import/types.ts`:

```ts
export type MeshSourceFormat = 'glb' | 'gltf' | 'stl' | 'obj';

export type MeshDiagnostics = {
	triangles: number;
	vertices: number;
	/** Edges used by exactly one triangle. 0 for a closed mesh. */
	openEdges: number;
	/** Line / Points primitives skipped during cleaning. */
	droppedPrimitives: number;
};

/** Welded, triangle-indexed positions — the canonical mesh representation. */
export type IndexedMesh = {
	positions: Float32Array;
	index: Uint32Array;
};

export type CleanMesh = IndexedMesh & { diagnostics: MeshDiagnostics };

/** A stored mesh. Positions are cleaned and world-baked but NOT normalized. */
export type MeshAsset = CleanMesh & {
	id: string;
	fileName: string;
	sourceFormat: MeshSourceFormat;
	derivedFrom?: { assetId: string; targetTriangles: number };
	createdAt: string;
};
```

- [ ] **Step 4: Write the failing tests**

`src/lib/mesh-import/__tests__/clean-mesh.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import {
	Box3,
	BoxGeometry,
	BufferAttribute,
	BufferGeometry,
	Group,
	InterleavedBuffer,
	InterleavedBufferAttribute,
	Line,
	Mesh,
	Object3D,
	Vector3
} from 'three';
import { cleanMesh, compactMesh, computeDiagnostics } from '../clean-mesh';

const bboxOf = (positions: Float32Array) => {
	const box = new Box3();
	for (let i = 0; i < positions.length; i += 3) {
		box.expandByPoint(new Vector3(positions[i], positions[i + 1], positions[i + 2]));
	}
	return box;
};

/** BoxGeometry minus its last face (2 triangles) — an open box. */
const openBox = (): BufferGeometry => {
	const g = new BoxGeometry(2, 2, 2);
	const index = g.getIndex()!;
	g.setIndex(new BufferAttribute(Uint32Array.from(index.array).slice(0, index.count - 6), 1));
	return g;
};

describe('cleanMesh', () => {
	it('welds a box with split face vertices into a closed 8-vertex mesh', () => {
		const result = cleanMesh(new Mesh(new BoxGeometry(2, 2, 2)));
		expect(result.diagnostics).toEqual({
			triangles: 12,
			vertices: 8,
			openEdges: 0,
			droppedPrimitives: 0
		});
		expect(result.index.length).toBe(36);
		expect(result.positions.length).toBe(24);
	});

	it('counts the boundary of an open box as open edges', () => {
		const result = cleanMesh(new Mesh(openBox()));
		expect(result.diagnostics.triangles).toBe(10);
		expect(result.diagnostics.openEdges).toBe(4);
	});

	it('bakes nested node transforms into positions', () => {
		const group = new Group();
		group.position.set(10, 0, 0);
		const mesh = new Mesh(new BoxGeometry(2, 2, 2));
		mesh.scale.set(2, 2, 2);
		group.add(mesh);
		const box = bboxOf(cleanMesh(group).positions);
		expect(box.min.toArray()).toEqual([8, -2, -2]);
		expect(box.max.toArray()).toEqual([12, 2, 2]);
	});

	it('merges several meshes into one', () => {
		const root = new Object3D();
		const a = new Mesh(new BoxGeometry(1, 1, 1));
		const b = new Mesh(new BoxGeometry(1, 1, 1));
		b.position.set(5, 0, 0);
		root.add(a, b);
		expect(cleanMesh(root).diagnostics.triangles).toBe(24);
	});

	it('drops Line primitives and counts them', () => {
		const root = new Object3D();
		root.add(new Mesh(new BoxGeometry(1, 1, 1)));
		root.add(new Line(new BufferGeometry().setFromPoints([new Vector3(), new Vector3(1, 0, 0)])));
		const result = cleanMesh(root);
		expect(result.diagnostics.droppedPrimitives).toBe(1);
		expect(result.diagnostics.triangles).toBe(12);
	});

	it('reads interleaved position attributes (common in exported GLBs)', () => {
		// stride 6: position xyz + a dummy normal xyz per vertex
		const data = new InterleavedBuffer(
			new Float32Array([0, 0, 0, 9, 9, 9, 1, 0, 0, 9, 9, 9, 0, 1, 0, 9, 9, 9]),
			6
		);
		const g = new BufferGeometry();
		g.setAttribute('position', new InterleavedBufferAttribute(data, 3, 0));
		const result = cleanMesh(new Mesh(g));
		expect(Array.from(result.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
		expect(result.diagnostics.openEdges).toBe(3);
	});

	it('removes degenerate triangles', () => {
		const g = new BufferGeometry();
		g.setAttribute(
			'position',
			new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0]), 3)
		);
		// second triangle is collinear (zero area)
		g.setIndex([0, 1, 2, 0, 1, 3]);
		const result = cleanMesh(new Mesh(g));
		expect(result.diagnostics.triangles).toBe(1);
		expect(result.diagnostics.vertices).toBe(3);
	});

	it('throws when there are no triangles', () => {
		expect(() => cleanMesh(new Object3D())).toThrow('no triangle meshes');
	});
});

describe('compactMesh', () => {
	it('drops unreferenced vertices and remaps the index', () => {
		const positions = new Float32Array([0, 0, 0, 9, 9, 9, 1, 0, 0, 0, 1, 0]);
		const result = compactMesh(positions, Uint32Array.from([0, 2, 3]));
		expect(Array.from(result.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
		expect(Array.from(result.index)).toEqual([0, 1, 2]);
	});
});

describe('computeDiagnostics', () => {
	it('reports a single triangle as three open edges', () => {
		const d = computeDiagnostics(new Float32Array(9), Uint32Array.from([0, 1, 2]), 2);
		expect(d).toEqual({ triangles: 1, vertices: 3, openEdges: 3, droppedPrimitives: 2 });
	});
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/mesh-import/__tests__/clean-mesh.test.ts`
Expected: FAIL — `Cannot find module '../clean-mesh'`.

- [ ] **Step 6: Implement `clean-mesh.ts`**

`src/lib/mesh-import/clean-mesh.ts`:

```ts
import { Box3, BufferAttribute, BufferGeometry, Line, Mesh, Object3D, Points, Vector3 } from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CleanMesh, IndexedMesh, MeshDiagnostics } from './types';

/** Weld tolerance as a fraction of the bounding-box diagonal. */
const WELD_TOLERANCE_FACTOR = 1e-6;
/** Triangles with area below this fraction of diagonal² are degenerate. */
const DEGENERATE_AREA_FACTOR = 1e-12;

/**
 * Copies a mesh's positions (and index, or an implicit 0..n-1 one) into a fresh,
 * world-space, position-only geometry. Positions are read through getX/Y/Z so
 * InterleavedBufferAttribute (common in exported GLBs) works too.
 */
const toWorldGeometry = (mesh: Mesh): BufferGeometry | null => {
	const source = mesh.geometry as BufferGeometry;
	const position = source.getAttribute('position');
	if (!position || position.count === 0) return null;

	const positions = new Float32Array(position.count * 3);
	for (let i = 0; i < position.count; i++) {
		positions[i * 3] = position.getX(i);
		positions[i * 3 + 1] = position.getY(i);
		positions[i * 3 + 2] = position.getZ(i);
	}
	const sourceIndex = source.getIndex();
	const indices = sourceIndex
		? Uint32Array.from({ length: sourceIndex.count }, (_, i) => sourceIndex.getX(i))
		: Uint32Array.from({ length: position.count }, (_, i) => i);

	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new BufferAttribute(positions, 3));
	geometry.setIndex(new BufferAttribute(indices, 1));
	geometry.applyMatrix4(mesh.matrixWorld);
	return geometry;
};

/** Drops vertices no triangle references and remaps the index to match. */
export function compactMesh(positions: Float32Array, index: Uint32Array): IndexedMesh {
	const remap = new Int32Array(positions.length / 3).fill(-1);
	const kept: number[] = [];
	const outIndex = new Uint32Array(index.length);
	for (let i = 0; i < index.length; i++) {
		const v = index[i];
		if (remap[v] === -1) {
			remap[v] = kept.length;
			kept.push(v);
		}
		outIndex[i] = remap[v];
	}
	const outPositions = new Float32Array(kept.length * 3);
	kept.forEach((v, i) => {
		outPositions[i * 3] = positions[v * 3];
		outPositions[i * 3 + 1] = positions[v * 3 + 1];
		outPositions[i * 3 + 2] = positions[v * 3 + 2];
	});
	return { positions: outPositions, index: outIndex };
}

export function computeDiagnostics(
	positions: Float32Array,
	index: Uint32Array,
	droppedPrimitives = 0
): MeshDiagnostics {
	const vertexCount = positions.length / 3;
	const edgeUse = new Map<number, number>();
	const addEdge = (a: number, b: number) => {
		const key = a < b ? a * vertexCount + b : b * vertexCount + a;
		edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
	};
	for (let i = 0; i < index.length; i += 3) {
		addEdge(index[i], index[i + 1]);
		addEdge(index[i + 1], index[i + 2]);
		addEdge(index[i + 2], index[i]);
	}
	let openEdges = 0;
	for (const uses of edgeUse.values()) if (uses === 1) openEdges++;
	return { triangles: index.length / 3, vertices: vertexCount, openEdges, droppedPrimitives };
}

/**
 * Flattens a loaded model into one welded, world-space triangle mesh:
 * bakes node transforms, skips Line/Points, keeps positions only, welds
 * coincident vertices, removes degenerate triangles.
 */
export function cleanMesh(root: Object3D): CleanMesh {
	root.updateMatrixWorld(true);

	const parts: BufferGeometry[] = [];
	let droppedPrimitives = 0;
	root.traverse((child) => {
		if (child instanceof Line || child instanceof Points) {
			droppedPrimitives++;
			return;
		}
		if (!(child instanceof Mesh) || !child.geometry) return;
		const part = toWorldGeometry(child);
		if (part) parts.push(part);
	});
	if (parts.length === 0) throw new Error('Model contains no triangle meshes');

	const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
	if (!merged) throw new Error('Model contains no triangle meshes');

	merged.computeBoundingBox();
	const diagonal = (merged.boundingBox ?? new Box3()).getSize(new Vector3()).length();
	if (!(diagonal > 0)) throw new Error('Model contains no triangle meshes');

	const welded = mergeVertices(merged, diagonal * WELD_TOLERANCE_FACTOR);
	const weldedPositions = welded.getAttribute('position');
	const weldedIndex = welded.getIndex()!;

	const positions = new Float32Array(weldedPositions.count * 3);
	for (let i = 0; i < weldedPositions.count; i++) {
		positions[i * 3] = weldedPositions.getX(i);
		positions[i * 3 + 1] = weldedPositions.getY(i);
		positions[i * 3 + 2] = weldedPositions.getZ(i);
	}

	const minArea = DEGENERATE_AREA_FACTOR * diagonal * diagonal;
	const a = new Vector3();
	const b = new Vector3();
	const c = new Vector3();
	const kept: number[] = [];
	for (let i = 0; i + 2 < weldedIndex.count; i += 3) {
		const ia = weldedIndex.getX(i);
		const ib = weldedIndex.getX(i + 1);
		const ic = weldedIndex.getX(i + 2);
		if (ia === ib || ib === ic || ia === ic) continue;
		a.fromArray(positions, ia * 3);
		b.fromArray(positions, ib * 3);
		c.fromArray(positions, ic * 3);
		const area = b.sub(a).cross(c.sub(a)).length() / 2;
		if (area < minArea) continue;
		kept.push(ia, ib, ic);
	}
	if (kept.length === 0) throw new Error('Model contains no triangle meshes');

	const compacted = compactMesh(positions, Uint32Array.from(kept));
	return {
		...compacted,
		diagnostics: computeDiagnostics(compacted.positions, compacted.index, droppedPrimitives)
	};
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/mesh-import/__tests__/clean-mesh.test.ts`
Expected: PASS (10 tests). If the import of `three/examples/jsm/utils/BufferGeometryUtils.js` fails to resolve in Jest, the `three` entry in `transformIgnorePatterns` already covers it — check the path spelling, don't change the jest config.

- [ ] **Step 8: Commit**

```bash
git add src/lib/projection-geometry/types.ts src/lib/mesh-import/types.ts src/lib/mesh-import/clean-mesh.ts src/lib/mesh-import/__tests__/clean-mesh.test.ts
git commit -m "feat(mesh-import): ImportedMeshConfig type and mesh cleaning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Normalization (auto-fit)

**Files:**
- Create: `src/lib/mesh-import/normalize.ts`
- Test: `src/lib/mesh-import/__tests__/normalize.test.ts`

**Interfaces:**
- Consumes: `UpAxis`, `ImportedMeshNormalize` (Task 1), `MeshSourceFormat` (Task 1).
- Produces:
  - `DEFAULT_TARGET_SIZE = 800`
  - `defaultUpAxis(format: MeshSourceFormat): UpAxis`
  - `upAxisRotation(upAxis: UpAxis): Matrix4`
  - `computeFit(positions: Float32Array, upAxis: UpAxis, targetSize: number): { offset: Point3; scale: number }`
  - `normalizeMatrix(normalize: ImportedMeshNormalize): Matrix4`

- [ ] **Step 1: Write the failing tests**

`src/lib/mesh-import/__tests__/normalize.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { Box3, Vector3 } from 'three';
import type { UpAxis } from '$lib/projection-geometry/types';
import {
	DEFAULT_TARGET_SIZE,
	computeFit,
	defaultUpAxis,
	normalizeMatrix,
	upAxisRotation
} from '../normalize';

const AXES: Record<UpAxis, Vector3> = {
	'+x': new Vector3(1, 0, 0),
	'-x': new Vector3(-1, 0, 0),
	'+y': new Vector3(0, 1, 0),
	'-y': new Vector3(0, -1, 0),
	'+z': new Vector3(0, 0, 1),
	'-z': new Vector3(0, 0, -1)
};

/** Corners of a 1×1×4 box elongated along `axis`, centered at (10, 20, 30). */
const elongatedBox = (axis: Vector3): Float32Array => {
	const half = new Vector3(0.5, 0.5, 0.5).add(
		new Vector3(Math.abs(axis.x), Math.abs(axis.y), Math.abs(axis.z)).multiplyScalar(1.5)
	);
	const out: number[] = [];
	for (const sx of [-1, 1])
		for (const sy of [-1, 1])
			for (const sz of [-1, 1]) out.push(10 + sx * half.x, 20 + sy * half.y, 30 + sz * half.z);
	return new Float32Array(out);
};

const fittedBox = (positions: Float32Array, upAxis: UpAxis, targetSize: number) => {
	const fit = computeFit(positions, upAxis, targetSize);
	const m = normalizeMatrix({ upAxis, targetSize, ...fit });
	const box = new Box3();
	for (let i = 0; i < positions.length; i += 3) {
		box.expandByPoint(new Vector3().fromArray(positions, i).applyMatrix4(m));
	}
	return box;
};

describe('upAxisRotation', () => {
	it.each(Object.keys(AXES) as UpAxis[])('maps %s onto +Z', (upAxis) => {
		const mapped = AXES[upAxis].clone().applyMatrix4(upAxisRotation(upAxis));
		expect(mapped.x).toBeCloseTo(0);
		expect(mapped.y).toBeCloseTo(0);
		expect(mapped.z).toBeCloseTo(1);
	});
});

describe('computeFit + normalizeMatrix', () => {
	it.each(Object.keys(AXES) as UpAxis[])(
		'centers at the origin and puts the long %s side on Z at target size',
		(upAxis) => {
			const box = fittedBox(elongatedBox(AXES[upAxis]), upAxis, 800);
			const size = box.getSize(new Vector3());
			const center = box.getCenter(new Vector3());
			expect(size.z).toBeCloseTo(800, 3);
			expect(size.x).toBeCloseTo(200, 3);
			expect(size.y).toBeCloseTo(200, 3);
			expect(center.length()).toBeCloseTo(0, 3);
		}
	);

	it('throws for a zero-size model', () => {
		expect(() => computeFit(new Float32Array([1, 1, 1, 1, 1, 1]), '+z', 800)).toThrow(
			'zero size'
		);
	});
});

describe('defaults', () => {
	it('uses +z for STL and +y otherwise', () => {
		expect(defaultUpAxis('stl')).toBe('+z');
		expect(defaultUpAxis('glb')).toBe('+y');
		expect(defaultUpAxis('gltf')).toBe('+y');
		expect(defaultUpAxis('obj')).toBe('+y');
		expect(DEFAULT_TARGET_SIZE).toBe(800);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/mesh-import/__tests__/normalize.test.ts`
Expected: FAIL — `Cannot find module '../normalize'`.

- [ ] **Step 3: Implement `normalize.ts`**

`src/lib/mesh-import/normalize.ts`:

```ts
import { Box3, Matrix4, Vector3 } from 'three';
import type { Point3 } from '$lib/types';
import type { ImportedMeshNormalize, UpAxis } from '$lib/projection-geometry/types';
import type { MeshSourceFormat } from './types';

/** Largest bbox dimension after fit — matches the default sphere's 400 radius. */
export const DEFAULT_TARGET_SIZE = 800;

/** glTF and OBJ are conventionally Y-up; STL usually comes from Z-up CAD tools. */
export const defaultUpAxis = (format: MeshSourceFormat): UpAxis =>
	format === 'stl' ? '+z' : '+y';

/** Rotation taking the source `upAxis` onto the app's up axis, +Z. */
export const upAxisRotation = (upAxis: UpAxis): Matrix4 => {
	const m = new Matrix4();
	switch (upAxis) {
		case '+z':
			return m;
		case '-z':
			return m.makeRotationX(Math.PI);
		case '+y':
			return m.makeRotationX(Math.PI / 2);
		case '-y':
			return m.makeRotationX(-Math.PI / 2);
		case '+x':
			return m.makeRotationY(-Math.PI / 2);
		case '-x':
			return m.makeRotationY(Math.PI / 2);
	}
};

/**
 * Offset (bbox-center shift, in rotated space) and uniform scale that put the
 * rotated model's bbox center at the origin with its largest side = targetSize.
 */
export const computeFit = (
	positions: Float32Array,
	upAxis: UpAxis,
	targetSize: number
): { offset: Point3; scale: number } => {
	const rotation = upAxisRotation(upAxis);
	const box = new Box3();
	const v = new Vector3();
	for (let i = 0; i < positions.length; i += 3) {
		box.expandByPoint(v.fromArray(positions, i).applyMatrix4(rotation));
	}
	const size = box.getSize(new Vector3());
	const maxDim = Math.max(size.x, size.y, size.z);
	if (!(maxDim > 0) || !(targetSize > 0)) throw new Error('Cannot fit a model with zero size');
	const center = box.getCenter(new Vector3());
	return { offset: { x: -center.x, y: -center.y, z: -center.z }, scale: targetSize / maxDim };
};

/** scale · translate(offset) · upAxisRotation — applied to the raw asset positions. */
export const normalizeMatrix = ({ upAxis, offset, scale }: ImportedMeshNormalize): Matrix4 =>
	new Matrix4()
		.makeScale(scale, scale, scale)
		.multiply(new Matrix4().makeTranslation(offset.x, offset.y, offset.z))
		.multiply(upAxisRotation(upAxis));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/mesh-import/__tests__/normalize.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mesh-import/normalize.ts src/lib/mesh-import/__tests__/normalize.test.ts
git commit -m "feat(mesh-import): auto-fit normalization with up-axis correction

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Asset store (hash, IndexedDB, registry)

**Files:**
- Modify: `package.json` (dev dependency), `jest.config.js:21-23`
- Create: `src/lib/mesh-import/asset-store.ts`
- Test: `src/lib/mesh-import/__tests__/asset-store.test.ts`

**Interfaces:**
- Consumes: `IndexedMesh`, `MeshAsset` (Task 1); `SuperGlobuleConfig` from `$lib/types`.
- Produces:
  - `hashMesh(mesh: IndexedMesh): Promise<string>`
  - `type AssetStatus = 'loaded' | 'missing'`; `assetStatus: Writable<Record<string, AssetStatus>>`
  - `registerAsset(asset: MeshAsset): void` (sync, registry only)
  - `getLoadedAsset(id: string): MeshAsset | undefined` (sync)
  - `putAsset(asset: MeshAsset): Promise<void>` (registry + IndexedDB)
  - `resolveAsset(id: string): Promise<MeshAsset | undefined>` (registry → IndexedDB; marks `missing`)
  - `collectAssetIds(config: SuperGlobuleConfig): string[]`
  - `ensureAssetsLoaded(config: SuperGlobuleConfig): Promise<void> | undefined` — returns `undefined` (synchronously) when everything is already loaded
  - `resetAssetStoreForTests(): void`

- [ ] **Step 1: Install fake-indexeddb and let ts-jest transform it**

Run: `npm install --save-dev fake-indexeddb`

In `jest.config.js`, extend `transformIgnorePatterns` (it currently lists `svelte|three|d3-.*|…|uuid`) to include `fake-indexeddb` and `meshoptimizer` (the latter is needed in Task 4):

```js
	transformIgnorePatterns: [
		'node_modules/(?!(svelte|three|d3-.*|delaunator|robust-predicates|internmap|esm-env|uuid|fake-indexeddb|meshoptimizer)/)'
	],
```

- [ ] **Step 2: Write the failing tests**

`src/lib/mesh-import/__tests__/asset-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { get } from 'svelte/store';
import type { SuperGlobuleConfig } from '$lib/types';
import type { MeshAsset } from '../types';
import {
	assetStatus,
	collectAssetIds,
	ensureAssetsLoaded,
	getLoadedAsset,
	hashMesh,
	putAsset,
	registerAsset,
	resetAssetStoreForTests,
	resolveAsset
} from '../asset-store';

if (!globalThis.crypto?.subtle) {
	(globalThis as { crypto: unknown }).crypto = webcrypto;
}

const triangle = (z = 0): MeshAsset => ({
	id: '',
	fileName: 'tri.stl',
	sourceFormat: 'stl',
	positions: new Float32Array([0, 0, z, 1, 0, z, 0, 1, z]),
	index: Uint32Array.from([0, 1, 2]),
	diagnostics: { triangles: 1, vertices: 3, openEdges: 3, droppedPrimitives: 0 },
	createdAt: '2026-10-05T00:00:00.000Z'
});

const withId = async (asset: MeshAsset): Promise<MeshAsset> => ({
	...asset,
	id: await hashMesh(asset)
});

const configWith = (...assetIds: string[]): SuperGlobuleConfig =>
	({
		projectionConfigs: [
			...assetIds.map((assetId) => ({ surfaceConfig: { type: 'ImportedMeshConfig', assetId } })),
			{ surfaceConfig: { type: 'SphereConfig' } }
		]
	}) as unknown as SuperGlobuleConfig;

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	resetAssetStoreForTests();
});

describe('hashMesh', () => {
	it('is stable for identical data and differs for different data', async () => {
		const a = await hashMesh(triangle());
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(await hashMesh(triangle())).toBe(a);
		expect(await hashMesh(triangle(1))).not.toBe(a);
	});
});

describe('asset store', () => {
	it('round-trips an asset through IndexedDB', async () => {
		const asset = await withId(triangle());
		await putAsset(asset);
		resetAssetStoreForTests(); // drop the in-memory registry, keep the IDB factory
		expect(getLoadedAsset(asset.id)).toBeUndefined();

		const loaded = await resolveAsset(asset.id);
		expect(loaded?.positions).toBeInstanceOf(Float32Array);
		expect(Array.from(loaded!.index)).toEqual([0, 1, 2]);
		expect(getLoadedAsset(asset.id)).toBe(loaded);
		expect(get(assetStatus)[asset.id]).toBe('loaded');
	});

	it('marks unknown ids missing without throwing', async () => {
		expect(await resolveAsset('nope')).toBeUndefined();
		expect(get(assetStatus).nope).toBe('missing');
	});

	it('collects only imported-mesh asset ids', () => {
		expect(collectAssetIds(configWith('a', 'b'))).toEqual(['a', 'b']);
		expect(collectAssetIds({} as SuperGlobuleConfig)).toEqual([]);
	});

	it('ensureAssetsLoaded is synchronous (undefined) when everything is loaded', async () => {
		const asset = await withId(triangle());
		registerAsset(asset);
		expect(ensureAssetsLoaded(configWith(asset.id))).toBeUndefined();
		expect(ensureAssetsLoaded(configWith())).toBeUndefined();
	});

	it('ensureAssetsLoaded loads from IndexedDB and tolerates misses', async () => {
		const asset = await withId(triangle());
		await putAsset(asset);
		resetAssetStoreForTests();
		const pending = ensureAssetsLoaded(configWith(asset.id, 'missing-id'));
		expect(pending).toBeInstanceOf(Promise);
		await expect(pending).resolves.toBeUndefined();
		expect(getLoadedAsset(asset.id)).toBeDefined();
		expect(get(assetStatus)['missing-id']).toBe('missing');
	});
});
```

Note: `resetAssetStoreForTests` must clear the registry **and** the cached `IDBDatabase` promise, but `beforeEach` installs a fresh `IDBFactory` — the round-trip test calls reset mid-test and keeps the same factory, so data survives.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/mesh-import/__tests__/asset-store.test.ts`
Expected: FAIL — `Cannot find module '../asset-store'`.

- [ ] **Step 4: Implement `asset-store.ts`**

`src/lib/mesh-import/asset-store.ts`:

```ts
/**
 * Content-addressed store for imported meshes. Configs only carry an `assetId`;
 * this module is the ONLY place that knows where the bytes live (in-memory
 * registry → IndexedDB today; a remote backend can slot in behind resolveAsset
 * later without changing configs or generation).
 *
 * Runs on both the main thread and in the geometry worker — each thread has its
 * own registry, both read the same IndexedDB.
 */
import { writable } from 'svelte/store';
import type { SuperGlobuleConfig } from '$lib/types';
import type { IndexedMesh, MeshAsset } from './types';

const DB_NAME = 'shades-assets';
const DB_VERSION = 1;
const STORE = 'meshAssets';

export type AssetStatus = 'loaded' | 'missing';
export const assetStatus = writable<Record<string, AssetStatus>>({});

const registry = new Map<string, MeshAsset>();

const setStatus = (id: string, status: AssetStatus) =>
	assetStatus.update((s) => (s[id] === status ? s : { ...s, [id]: status }));

/** Lowercase hex SHA-256 over [positionByteLength, indexByteLength, positions, index]. */
export async function hashMesh({ positions, index }: IndexedMesh): Promise<string> {
	const header = new Uint32Array([positions.byteLength, index.byteLength]);
	const bytes = new Uint8Array(header.byteLength + positions.byteLength + index.byteLength);
	bytes.set(new Uint8Array(header.buffer), 0);
	bytes.set(
		new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength),
		header.byteLength
	);
	bytes.set(
		new Uint8Array(index.buffer, index.byteOffset, index.byteLength),
		header.byteLength + positions.byteLength
	);
	const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> | null => {
	if (typeof indexedDB === 'undefined') return null;
	if (!dbPromise) {
		dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);
			request.onupgradeneeded = () => {
				request.result.createObjectStore(STORE, { keyPath: 'id' });
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		}).catch((error) => {
			dbPromise = null;
			throw error;
		});
	}
	return dbPromise;
};

const withStore = async <T>(
	mode: IDBTransactionMode,
	op: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | undefined> => {
	const pending = openDb();
	if (!pending) return undefined;
	const db = await pending;
	return new Promise<T>((resolve, reject) => {
		const request = op(db.transaction(STORE, mode).objectStore(STORE));
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
};

/** Put an asset in this thread's registry only. */
export function registerAsset(asset: MeshAsset): void {
	registry.set(asset.id, asset);
	setStatus(asset.id, 'loaded');
}

export const getLoadedAsset = (id: string): MeshAsset | undefined => registry.get(id);

export async function putAsset(asset: MeshAsset): Promise<void> {
	registerAsset(asset);
	await withStore('readwrite', (store) => store.put(asset));
}

export async function resolveAsset(id: string): Promise<MeshAsset | undefined> {
	const hit = registry.get(id);
	if (hit) return hit;
	const stored = await withStore<MeshAsset | undefined>('readonly', (store) => store.get(id)).catch(
		() => undefined
	);
	if (stored) {
		registerAsset(stored);
		return stored;
	}
	setStatus(id, 'missing');
	return undefined;
}

type MaybeImportedSurface = { type?: string; assetId?: string } | undefined;

export const collectAssetIds = (config: SuperGlobuleConfig): string[] =>
	(config?.projectionConfigs ?? [])
		.map((p) => p?.surfaceConfig as MaybeImportedSurface)
		.filter((s): s is { type: string; assetId: string } => s?.type === 'ImportedMeshConfig')
		.map((s) => s.assetId);

/**
 * Loads every asset `config` references into this thread's registry. Returns
 * undefined — synchronously — when nothing is missing, so callers keep their
 * synchronous fast path. Never rejects: a missing asset is reported through
 * `assetStatus` and surfaces later as MissingMeshAssetError in generation.
 */
export function ensureAssetsLoaded(config: SuperGlobuleConfig): Promise<void> | undefined {
	const missing = collectAssetIds(config).filter((id) => !registry.has(id));
	if (missing.length === 0) return undefined;
	return Promise.all(missing.map((id) => resolveAsset(id))).then(() => undefined);
}

export function resetAssetStoreForTests(): void {
	registry.clear();
	assetStatus.set({});
	dbPromise = null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/mesh-import/__tests__/asset-store.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json jest.config.js src/lib/mesh-import/asset-store.ts src/lib/mesh-import/__tests__/asset-store.test.ts
git commit -m "feat(mesh-import): content-addressed asset store over IndexedDB

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Simplification

**Files:**
- Modify: `package.json` (runtime dependency)
- Create: `src/lib/mesh-import/simplify.ts`
- Test: `src/lib/mesh-import/__tests__/simplify.test.ts`

**Interfaces:**
- Consumes: `compactMesh`, `computeDiagnostics`, `cleanMesh` (Task 1); `hashMesh` (Task 3); `IndexedMesh`, `MeshAsset`.
- Produces:
  - `simplifyMesh(mesh: IndexedMesh, targetTriangles: number): Promise<IndexedMesh>`
  - `simplifyAsset(source: MeshAsset, targetTriangles: number): Promise<MeshAsset>` — result has a new `id` and `derivedFrom: { assetId: source.id, targetTriangles }`

- [ ] **Step 1: Add the dependency**

Run: `npm install meshoptimizer@^0.22.0`
(It is already present transitively via `@types/three`; this makes it a direct dependency.)

- [ ] **Step 2: Write the failing tests**

`src/lib/mesh-import/__tests__/simplify.test.ts`:

```ts
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
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/mesh-import/__tests__/simplify.test.ts`
Expected: FAIL — `Cannot find module '../simplify'`.

- [ ] **Step 4: Implement `simplify.ts`**

`src/lib/mesh-import/simplify.ts`:

```ts
import { MeshoptSimplifier } from 'meshoptimizer/meshopt_simplifier.module.js';
import { compactMesh, computeDiagnostics } from './clean-mesh';
import { hashMesh } from './asset-store';
import type { IndexedMesh, MeshAsset } from './types';

/**
 * target_error is relative to the mesh extent; 1 lets the simplifier go as far
 * as needed to reach the triangle target (the user chose the count explicitly).
 */
const TARGET_ERROR = 1;

export async function simplifyMesh(
	mesh: IndexedMesh,
	targetTriangles: number
): Promise<IndexedMesh> {
	const current = mesh.index.length / 3;
	const target = Math.max(1, Math.floor(targetTriangles));
	if (target >= current) return { positions: mesh.positions.slice(), index: mesh.index.slice() };

	await MeshoptSimplifier.ready;
	const [simplified] = MeshoptSimplifier.simplify(
		mesh.index,
		mesh.positions,
		3,
		target * 3,
		TARGET_ERROR
	);
	if (simplified.length === 0) {
		throw new Error('Simplification removed every triangle — raise the target');
	}
	return compactMesh(mesh.positions, simplified);
}

export async function simplifyAsset(source: MeshAsset, targetTriangles: number): Promise<MeshAsset> {
	const mesh = await simplifyMesh(source, targetTriangles);
	return {
		...mesh,
		id: await hashMesh(mesh),
		fileName: source.fileName,
		sourceFormat: source.sourceFormat,
		diagnostics: computeDiagnostics(
			mesh.positions,
			mesh.index,
			source.diagnostics.droppedPrimitives
		),
		derivedFrom: { assetId: source.id, targetTriangles },
		createdAt: new Date().toISOString()
	};
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/mesh-import/__tests__/simplify.test.ts`
Expected: PASS (4 tests). If Jest can't resolve `meshoptimizer/meshopt_simplifier.module.js`, confirm Step 1 of Task 3 added `meshoptimizer` to `transformIgnorePatterns`. If TypeScript complains about the subpath, the package ships `meshopt_simplifier.module.d.ts` next to it — use exactly that path.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/mesh-import/simplify.ts src/lib/mesh-import/__tests__/simplify.test.ts
git commit -m "feat(mesh-import): meshoptimizer-based simplification into derived assets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Surface generation from an imported asset

**Files:**
- Create: `src/lib/mesh-import/asset-geometry.ts`
- Modify: `src/lib/projection-geometry/generate-projection.ts:233-268` (`generateSurface`)
- Test: `src/lib/projection-geometry/__tests__/generate-surface-imported.test.ts`

**Interfaces:**
- Consumes: `getLoadedAsset`, `registerAsset`, `resetAssetStoreForTests` (Task 3); `normalizeMatrix` (Task 2); `cleanMesh` (Task 1); `ImportedSurfaceConfig` (Task 1); `materials` (already imported in `generate-projection.ts:62`).
- Produces:
  - `class MissingMeshAssetError extends Error { assetId: string; fileName: string }`
  - `getAssetGeometry(assetId: string, fileName: string): BufferGeometry` (cached per thread, never disposed)
  - `resetAssetGeometryCacheForTests(): void`
  - `generateSurface(cfg)` handles `ImportedMeshConfig`
  - `generateSurfaceIfAvailable(cfg: SurfaceConfig): Object3D | undefined` — `undefined` on `MissingMeshAssetError`, rethrows anything else

- [ ] **Step 1: Write the failing tests**

`src/lib/projection-geometry/__tests__/generate-surface-imported.test.ts`:

```ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { BoxGeometry, Mesh, Raycaster, Vector3, type Object3D } from 'three';
import { acceleratedRaycast } from 'three-mesh-bvh';
import { generateSurface, generateSurfaceIfAvailable } from '../generate-projection';
import type { ImportedSurfaceConfig, SurfaceConfig } from '../types';
import { cleanMesh } from '$lib/mesh-import/clean-mesh';
import { registerAsset, resetAssetStoreForTests } from '$lib/mesh-import/asset-store';
import {
	MissingMeshAssetError,
	resetAssetGeometryCacheForTests
} from '$lib/mesh-import/asset-geometry';

const cubeConfig = (over: Partial<ImportedSurfaceConfig> = {}): SurfaceConfig =>
	({
		type: 'ImportedMeshConfig',
		assetId: 'cube',
		fileName: 'cube.glb',
		// 2×2×2 cube at the origin, fit to 800 → scale 400, half-size 400
		normalize: { upAxis: '+z', targetSize: 800, offset: { x: 0, y: 0, z: 0 }, scale: 400 },
		center: { x: 0, y: 0, z: 0 },
		transform: {
			translate: { x: 0, y: 0, z: 0 },
			scale: { x: 1, y: 1, z: 1 },
			rotate: { x: 0, y: 0, z: 0 }
		},
		...over
	}) as SurfaceConfig;

const hitX = (surface: Object3D): number => {
	const raycaster = new Raycaster(new Vector3(0, 0, 0), new Vector3(1, 0, 0), 0, 5000);
	const hits = raycaster.intersectObject(surface, true);
	expect(hits.length).toBeGreaterThan(0);
	return hits[0].point.x;
};

const meshOf = (surface: Object3D): Mesh => {
	let found: Mesh | undefined;
	surface.traverse((c) => {
		if (c instanceof Mesh) found = c;
	});
	return found!;
};

beforeEach(() => {
	resetAssetStoreForTests();
	resetAssetGeometryCacheForTests();
	registerAsset({
		...cleanMesh(new Mesh(new BoxGeometry(2, 2, 2))),
		id: 'cube',
		fileName: 'cube.glb',
		sourceFormat: 'glb',
		createdAt: '2026-10-05T00:00:00.000Z'
	});
});

describe('generateSurface — ImportedMeshConfig', () => {
	it('applies the normalize fit', () => {
		expect(hitX(generateSurface(cubeConfig()))).toBeCloseTo(400, 3);
	});

	it('applies the user transform after the fit', () => {
		const surface = generateSurface(
			cubeConfig({
				transform: {
					translate: { x: 100, y: 0, z: 0 },
					scale: { x: 1, y: 1, z: 1 },
					rotate: { x: 0, y: 0, z: 0 }
				}
			})
		);
		expect(hitX(surface)).toBeCloseTo(500, 3);
	});

	it('reuses cached geometry and keeps the accelerated raycast on every surface', () => {
		const first = meshOf(generateSurface(cubeConfig()));
		const second = meshOf(generateSurface(cubeConfig()));
		expect(second.geometry).toBe(first.geometry);
		expect(second.raycast).toBe(acceleratedRaycast);
	});

	it('throws MissingMeshAssetError when the asset is not loaded', () => {
		expect(() => generateSurface(cubeConfig({ assetId: 'gone' }))).toThrow(MissingMeshAssetError);
	});
});

describe('generateSurfaceIfAvailable', () => {
	it('returns undefined for a missing asset', () => {
		expect(generateSurfaceIfAvailable(cubeConfig({ assetId: 'gone' }))).toBeUndefined();
	});

	it('returns the surface when available', () => {
		expect(generateSurfaceIfAvailable(cubeConfig())).toBeDefined();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/generate-surface-imported.test.ts`
Expected: FAIL — `Cannot find module '$lib/mesh-import/asset-geometry'`.

- [ ] **Step 3: Implement `asset-geometry.ts`**

`src/lib/mesh-import/asset-geometry.ts`:

```ts
import { BufferAttribute, BufferGeometry } from 'three';
import { getLoadedAsset } from './asset-store';

export class MissingMeshAssetError extends Error {
	constructor(
		readonly assetId: string,
		readonly fileName: string
	) {
		super(`Model "${fileName}" isn't loaded on this device`);
		this.name = 'MissingMeshAssetError';
	}
}

const cache = new Map<string, BufferGeometry>();

/**
 * One BufferGeometry per asset per thread, shared by every surface built from
 * it, so dense meshes don't rebuild geometry + BVH on each generation.
 * dispose() is disabled: the renderer or audit code disposing a surface must
 * not destroy geometry other surfaces still use.
 */
export function getAssetGeometry(assetId: string, fileName: string): BufferGeometry {
	const hit = cache.get(assetId);
	if (hit) return hit;
	const asset = getLoadedAsset(assetId);
	if (!asset) throw new MissingMeshAssetError(assetId, fileName);

	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new BufferAttribute(asset.positions, 3));
	geometry.setIndex(new BufferAttribute(asset.index, 1));
	geometry.computeVertexNormals();
	geometry.computeBoundingBox();
	geometry.computeBoundingSphere();
	geometry.dispose = () => {};
	cache.set(assetId, geometry);
	return geometry;
}

export function resetAssetGeometryCacheForTests(): void {
	cache.clear();
}
```

- [ ] **Step 4: Add the `generateSurface` branch and the tolerant wrapper**

In `src/lib/projection-geometry/generate-projection.ts`, add imports near the other `$lib` imports:

```ts
import { getAssetGeometry, MissingMeshAssetError } from '$lib/mesh-import/asset-geometry';
import { normalizeMatrix } from '$lib/mesh-import/normalize';
```

In `generateSurface`, after the `GlobuleConfig` branch's closing `}` and before `const transformMatrix = getMatrix4(cfg.transform);`, add:

```ts
	} else if (cfg.type === 'ImportedMeshConfig') {
		// materials.default is DoubleSide like the other surfaces: rays are cast
		// from INSIDE the mesh, so a FrontSide material would never register a hit.
		const mesh = new Mesh(getAssetGeometry(cfg.assetId, cfg.fileName), materials.default);
		mesh.applyMatrix4(normalizeMatrix(cfg.normalize));
		// The geometry (and its boundsTree) is cached and shared, so
		// optimizeSurfaceForRaycasting skips it after the first build and would
		// never assign the accelerated raycast to this new Mesh.
		mesh.raycast = acceleratedRaycast;
		surface.add(mesh);
```

(The existing chain is `if (Sphere) {…} else if (Capsule) {…} else if (Globule) {…}` — the new `else if` continues it; keep braces balanced.)

After `generateSurface`, add:

```ts
/**
 * generateSurface for main-thread rebuilds: an imported model that isn't on
 * this device yields no surface instead of failing the whole result.
 */
export const generateSurfaceIfAvailable = (cfg: SurfaceConfig): Object3D | undefined => {
	try {
		return generateSurface(cfg);
	} catch (error) {
		if (error instanceof MissingMeshAssetError) return undefined;
		throw error;
	}
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/generate-surface-imported.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Run the full unit suite and type check**

Run: `npm run test:unit 2>&1 | tail -15 && npm run check 2>&1 | tail -5`
Expected: no new failures; no new type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/mesh-import/asset-geometry.ts src/lib/projection-geometry/generate-projection.ts src/lib/projection-geometry/__tests__/generate-surface-imported.test.ts
git commit -m "feat(projection): build surfaces from imported mesh assets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Worker and main-thread asset loading

**Files:**
- Modify: `src/lib/workers/super-globule-worker-core.ts` (`WorkerCoreDeps`, `createWorkerCore`, generate branch at ~126-143)
- Modify: `src/lib/stores/workerStore.ts:288-308` (surface rebuild) and `:340-370` (`generateSuperGlobuleAsync`)
- Test: `src/lib/workers/__tests__/super-globule-worker-core.test.ts` (add cases)

**Interfaces:**
- Consumes: `ensureAssetsLoaded` (Task 3); `generateSurfaceIfAvailable` (Task 5).
- Produces: `WorkerCoreDeps.ensureAssets: (config: SuperGlobuleConfig) => Promise<void> | undefined`. Generate requests are processed strictly in arrival order; with all assets loaded they still post synchronously (existing tests unchanged).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/workers/__tests__/super-globule-worker-core.test.ts`:

```ts
describe('worker core — asset loading', () => {
	const generateMsg = (requestId: number) =>
		({ type: 'generate', payload: { id: `c${requestId}` }, gates: {}, requestId }) as never;

	const makeAsyncCore = (ensureAssets: (config: { id: string }) => Promise<void> | undefined) => {
		const generateSuperGlobule = jest.fn<(...args: unknown[]) => unknown>(() => geometry);
		const posted: WorkerResponse[] = [];
		const core = createWorkerCore({
			generateSuperGlobule: generateSuperGlobule as never,
			stripNonSerializable: (g) => g,
			ensureAssets: ensureAssets as never,
			now: () => 0,
			log: () => {}
		});
		return { core, posted, post: (r: WorkerResponse) => posted.push(r), generateSuperGlobule };
	};

	it('waits for assets before generating', async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const { core, posted, post, generateSuperGlobule } = makeAsyncCore(() => gate);
		core.handle(generateMsg(1), post);
		expect(generateSuperGlobule).not.toHaveBeenCalled();
		release();
		await gate;
		await new Promise((r) => setTimeout(r, 0));
		expect(posted.map((p) => p.requestId)).toEqual([1]);
	});

	it('posts results in request order even if a later request needs no loading', async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const { core, posted, post } = makeAsyncCore((config) =>
			config.id === 'c1' ? gate : undefined
		);
		core.handle(generateMsg(1), post); // waits on the gate
		core.handle(generateMsg(2), post); // assets ready, but must queue behind 1
		expect(posted).toEqual([]);
		release();
		await new Promise((r) => setTimeout(r, 0));
		expect(posted.map((p) => p.requestId)).toEqual([1, 2]);
		expect(core.heldGeometryRequestId()).toBe(2);
	});

	it('still generates when asset loading rejects', async () => {
		const { core, posted, post } = makeAsyncCore(() => Promise.reject(new Error('idb down')));
		core.handle(generateMsg(1), post);
		await new Promise((r) => setTimeout(r, 0));
		expect(posted.map((p) => p.type)).toEqual(['result']);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/workers/__tests__/super-globule-worker-core.test.ts`
Expected: the three new tests FAIL (generate runs immediately / `ensureAssets` is ignored); existing tests PASS.

- [ ] **Step 3: Implement ordered async generate in the worker core**

In `src/lib/workers/super-globule-worker-core.ts`:

Add the import:

```ts
import { ensureAssetsLoaded } from '$lib/mesh-import/asset-store';
```

Add to `WorkerCoreDeps`:

```ts
	/**
	 * Load imported-mesh assets the config references into this thread's
	 * registry. Returns undefined when nothing needs loading (sync fast path).
	 */
	ensureAssets: (config: SuperGlobuleConfig) => Promise<void> | undefined;
```

Add to the defaults in `createWorkerCore`:

```ts
		ensureAssets: ensureAssetsLoaded,
```

Replace the body of the `if (message.type === 'generate') { … }` branch with a call into two helpers, and define the helpers just above `const handle = …`:

```ts
	const runGenerate = (message: GenerateMessage, post: (response: WorkerResponse) => void) => {
		const { payload, gates, requestId } = message;
		try {
			deps.log('[Worker] Starting generateSuperGlobule');
			const start = deps.now();
			const superGlobule = deps.generateSuperGlobule(payload, gates);
			deps.log(`[Worker] generateSuperGlobule completed in ${deps.now() - start}ms`);
			held = { requestId, superGlobule };
			post({ type: 'result', payload: deps.stripNonSerializable(superGlobule), requestId });
		} catch (error) {
			post({
				type: 'error',
				error: error instanceof Error ? error.message : 'Unknown error',
				requestId
			});
		}
	};

	/**
	 * Generate requests run strictly in arrival order. Once any request has to
	 * wait for assets, later ones queue behind it — otherwise a later request
	 * could post first and then be overwritten by the earlier, stale result.
	 * A failed asset load still generates: the missing asset surfaces as a
	 * per-pipeline error.
	 */
	let generateQueue: Promise<void> | null = null;
	const track = (job: Promise<void>) => {
		generateQueue = job;
		void job.then(() => {
			if (generateQueue === job) generateQueue = null;
		});
	};
	const handleGenerate = (message: GenerateMessage, post: (response: WorkerResponse) => void) => {
		if (!generateQueue) {
			const ready = deps.ensureAssets(message.payload);
			if (!ready) {
				runGenerate(message, post);
				return;
			}
			track(ready.catch(() => {}).then(() => runGenerate(message, post)));
			return;
		}
		track(
			generateQueue
				.then(() => deps.ensureAssets(message.payload))
				.catch(() => {})
				.then(() => runGenerate(message, post))
		);
	};
```

And the branch inside `handle` becomes:

```ts
		if (message.type === 'generate') {
			handleGenerate(message, post);
			return;
		}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/workers/__tests__/super-globule-worker-core.test.ts`
Expected: PASS (all, old and new).

- [ ] **Step 5: Load assets on the main thread before posting**

In `src/lib/stores/workerStore.ts`:

Add imports:

```ts
import { ensureAssetsLoaded } from '$lib/mesh-import/asset-store';
```

and add `generateSurfaceIfAvailable` to the existing import from `$lib/projection-geometry/generate-projection` (where `generateSurface` is imported today; drop `generateSurface` from that import if it becomes unused).

In `generateSuperGlobuleAsync`, replace the `try { const w = getWorker(); … w.postMessage(JSON.parse(JSON.stringify(message))); } catch …` block with:

```ts
		// Deep clone now (strips Svelte 5 $state proxies, which can't be posted)
		// so later config edits can't leak into this request while assets load.
		const plainMessage = JSON.parse(JSON.stringify(message));
		const send = () => {
			try {
				getWorker().postMessage(plainMessage);
			} catch (error) {
				pendingResolvers.delete(requestId);
				isWorking.set(pendingResolvers.size > 0);
				workerError.set(error instanceof Error ? error.message : 'Failed to start worker');
				reject(error);
			}
		};
		// The post-result surface rebuild below runs on this thread, so the
		// imported mesh must be in this thread's registry too.
		const assetsReady = ensureAssetsLoaded(config);
		if (assetsReady) void assetsReady.then(send);
		else send();
```

(`ensureAssetsLoaded` never rejects, so `.then(send)` is enough. Note `isWorking.set(pendingResolvers.size > 0)` — with async sends another request may still be pending; the original code set `false` unconditionally.)

In the result handler, replace both surface rebuilds:

```ts
						rehydrated.projections[i].surface = generateSurfaceIfAvailable(
							prepared.surfaceConfig
						) as Object3D;
```

```ts
					rehydrated.voronoiResult.surface = generateSurfaceIfAvailable(
						resolvedSurfaceConfig
					) as Object3D;
```

(Both consumers — `ProjectionGeometryComponent.svelte:265` and `collate-geometry.ts:37` — already tolerate a missing surface; the worker posts these fields as `null` today. Import `Object3D` as a type from `three` if it isn't already imported.)

- [ ] **Step 6: Run the full unit suite and type check**

Run: `npm run test:unit 2>&1 | tail -15 && npm run check 2>&1 | tail -5`
Expected: no new failures; no new type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/workers/super-globule-worker-core.ts src/lib/workers/__tests__/super-globule-worker-core.test.ts src/lib/stores/workerStore.ts
git commit -m "feat(worker): load imported mesh assets before generating, in request order

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Parsing files and the import operations

**Files:**
- Create: `src/lib/mesh-import/parse-model.ts`
- Create: `src/lib/mesh-import/import-model.ts`
- Test: `src/lib/mesh-import/__tests__/parse-model.test.ts`
- Test: `src/lib/mesh-import/__tests__/import-model.test.ts`

**Interfaces:**
- Consumes: `cleanMesh` (1); `computeFit`, `defaultUpAxis`, `DEFAULT_TARGET_SIZE` (2); `hashMesh`, `putAsset`, `resolveAsset` (3); `simplifyAsset` (4); `identityTransform` from `src/components/modal/editor/transform-config.ts`; `ImportedSurfaceConfig`, `UpAxis`.
- Produces:
  - `class ModelImportError extends Error`
  - `detectFormat(fileName: string): MeshSourceFormat` (throws `ModelImportError`)
  - `parseModel(file: File): Promise<{ root: Object3D; format: MeshSourceFormat }>`
  - `ingestModelFile(file: File): Promise<MeshAsset>` — parse → clean → hash → store
  - `importModelFile(file: File): Promise<ImportedSurfaceConfig>`
  - `replaceImportedModel(prev: ImportedSurfaceConfig, file: File): Promise<{ config: ImportedSurfaceConfig; sameFile: boolean }>`
  - `applySimplify(cfg: ImportedSurfaceConfig, targetTriangles: number): Promise<ImportedSurfaceConfig>`
  - `revertSimplify(cfg: ImportedSurfaceConfig): ImportedSurfaceConfig`
  - `refit(cfg: ImportedSurfaceConfig, upAxis: UpAxis, targetSize: number): Promise<ImportedSurfaceConfig>`

- [ ] **Step 1: Write the failing parse tests**

`src/lib/mesh-import/__tests__/parse-model.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { Mesh } from 'three';
import { detectFormat, ModelImportError, parseModel } from '../parse-model';
import { cleanMesh } from '../clean-mesh';

const asciiStlTetra = `solid t
facet normal 0 0 0
 outer loop
  vertex 0 0 0
  vertex 1 0 0
  vertex 0 1 0
 endloop
endfacet
facet normal 0 0 0
 outer loop
  vertex 0 0 0
  vertex 0 0 1
  vertex 1 0 0
 endloop
endfacet
facet normal 0 0 0
 outer loop
  vertex 0 0 0
  vertex 0 1 0
  vertex 0 0 1
 endloop
endfacet
facet normal 0 0 0
 outer loop
  vertex 1 0 0
  vertex 0 0 1
  vertex 0 1 0
 endloop
endfacet
endsolid t`;

const objQuad = `v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
f 1 2 3 4`;

describe('detectFormat', () => {
	it.each([
		['a.GLB', 'glb'],
		['a.gltf', 'gltf'],
		['dir.v2/a.stl', 'stl'],
		['a.obj', 'obj']
	])('%s → %s', (name, format) => {
		expect(detectFormat(name)).toBe(format);
	});

	it('rejects unknown extensions', () => {
		expect(() => detectFormat('a.fbx')).toThrow(ModelImportError);
	});
});

describe('parseModel', () => {
	it('parses ASCII STL into a closed tetrahedron', async () => {
		const { root, format } = await parseModel(new File([asciiStlTetra], 'tetra.stl'));
		expect(format).toBe('stl');
		expect(cleanMesh(root).diagnostics).toMatchObject({ triangles: 4, vertices: 4, openEdges: 0 });
	});

	it('parses OBJ and triangulates quads', async () => {
		const { root } = await parseModel(new File([objQuad], 'quad.obj'));
		let meshes = 0;
		root.traverse((c) => {
			if (c instanceof Mesh) meshes++;
		});
		expect(meshes).toBe(1);
		expect(cleanMesh(root).diagnostics.triangles).toBe(2);
	});

	it('rejects glTF that references external buffers', async () => {
		const gltf = JSON.stringify({
			asset: { version: '2.0' },
			buffers: [{ uri: 'scene.bin', byteLength: 12 }]
		});
		await expect(parseModel(new File([gltf], 'scene.gltf'))).rejects.toThrow('export as GLB');
	});

	it('rejects Draco-compressed glTF', async () => {
		const gltf = JSON.stringify({
			asset: { version: '2.0' },
			extensionsUsed: ['KHR_draco_mesh_compression'],
			extensionsRequired: ['KHR_draco_mesh_compression']
		});
		await expect(parseModel(new File([gltf], 'scene.gltf'))).rejects.toThrow(
			're-export without Draco compression'
		);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/mesh-import/__tests__/parse-model.test.ts`
Expected: FAIL — `Cannot find module '../parse-model'`.

- [ ] **Step 3: Implement `parse-model.ts`**

`src/lib/mesh-import/parse-model.ts`:

```ts
import { Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { MeshSourceFormat } from './types';

/** User-facing import failure; `message` is shown in a toast as-is. */
export class ModelImportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ModelImportError';
	}
}

const DRACO = 'KHR_draco_mesh_compression';
const DRACO_MESSAGE = 'This model uses Draco compression — re-export without Draco compression';

export const detectFormat = (fileName: string): MeshSourceFormat => {
	const ext = fileName.split('.').pop()?.toLowerCase();
	if (ext === 'glb' || ext === 'gltf' || ext === 'stl' || ext === 'obj') return ext;
	throw new ModelImportError(`Unsupported file type ".${ext}" — use GLB, glTF, STL or OBJ`);
};

type GltfJson = { buffers?: { uri?: string }[]; extensionsUsed?: string[] };

/** Checks we can answer better than GLTFLoader's own errors. */
const checkGltfJson = (json: GltfJson) => {
	if (json.extensionsUsed?.includes(DRACO)) throw new ModelImportError(DRACO_MESSAGE);
	const external = json.buffers?.some((b) => b.uri !== undefined && !b.uri.startsWith('data:'));
	if (external) {
		throw new ModelImportError(
			'This .gltf references external files — export as GLB (single file) instead'
		);
	}
};

/** Reads the JSON chunk of a GLB (header 12 bytes, then chunk length + type). */
const glbJson = (buffer: ArrayBuffer): GltfJson => {
	const view = new DataView(buffer);
	if (buffer.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) {
		throw new ModelImportError('Not a valid GLB file');
	}
	const length = view.getUint32(12, true);
	return JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
};

const parseGltf = async (buffer: ArrayBuffer, format: 'glb' | 'gltf'): Promise<Object3D> => {
	checkGltfJson(
		format === 'glb' ? glbJson(buffer) : JSON.parse(new TextDecoder().decode(buffer))
	);
	const loader = new GLTFLoader();
	loader.setMeshoptDecoder(MeshoptDecoder);
	try {
		return (await loader.parseAsync(buffer, '')).scene;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/draco/i.test(message)) throw new ModelImportError(DRACO_MESSAGE);
		throw new ModelImportError(`Could not read model: ${message}`);
	}
};

export async function parseModel(file: File): Promise<{ root: Object3D; format: MeshSourceFormat }> {
	const format = detectFormat(file.name);
	const buffer = await file.arrayBuffer();
	switch (format) {
		case 'glb':
		case 'gltf':
			return { root: await parseGltf(buffer, format), format };
		case 'stl':
			return { root: new Mesh(new STLLoader().parse(buffer)), format };
		case 'obj':
			return { root: new OBJLoader().parse(new TextDecoder().decode(buffer)), format };
	}
}
```

Note: OBJ parses to `Mesh` children; OBJ files with only `l` lines produce `LineSegments`, which `cleanMesh` drops and counts.

- [ ] **Step 4: Run parse tests to verify they pass**

Run: `npm run test:unit -- src/lib/mesh-import/__tests__/parse-model.test.ts`
Expected: PASS (9 tests). If `GLTFLoader` fails to import under Jest for an environment reason (e.g. a missing browser global at module load), stub that global at the top of the test file rather than changing the implementation — and say so in the commit message.

- [ ] **Step 5: Write the failing import-operation tests**

`src/lib/mesh-import/__tests__/import-model.test.ts`:

```ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { IcosahedronGeometry, Mesh, Vector3 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getLoadedAsset, resetAssetStoreForTests } from '../asset-store';
import {
	applySimplify,
	importModelFile,
	refit,
	replaceImportedModel,
	revertSimplify
} from '../import-model';

if (!globalThis.crypto?.subtle) {
	(globalThis as { crypto: unknown }).crypto = webcrypto;
}

/** ASCII STL of an icosphere of the given radius, centered at `at`. */
const sphereStl = (radius: number, at = new Vector3(), detail = 6): string => {
	const g = mergeVertices(new IcosahedronGeometry(radius, detail));
	const pos = g.getAttribute('position');
	const index = g.getIndex()!;
	const v = (i: number) =>
		`vertex ${pos.getX(i) + at.x} ${pos.getY(i) + at.y} ${pos.getZ(i) + at.z}`;
	const facets: string[] = [];
	for (let i = 0; i < index.count; i += 3) {
		facets.push(
			`facet normal 0 0 0\nouter loop\n${v(index.getX(i))}\n${v(index.getX(i + 1))}\n${v(index.getX(i + 2))}\nendloop\nendfacet`
		);
	}
	return `solid s\n${facets.join('\n')}\nendsolid s`;
};

const stlFile = (name: string, text: string) => new File([text], name);

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	resetAssetStoreForTests();
});

describe('importModelFile', () => {
	it('stores the asset and returns an auto-fit surface config', async () => {
		const cfg = await importModelFile(stlFile('ball.stl', sphereStl(1, new Vector3(5, 0, 0))));
		expect(cfg.type).toBe('ImportedMeshConfig');
		expect(cfg.fileName).toBe('ball.stl');
		expect(cfg.normalize.upAxis).toBe('+z');
		expect(cfg.normalize.targetSize).toBe(800);
		expect(cfg.normalize.scale).toBeCloseTo(400, 0);
		expect(cfg.normalize.offset.x).toBeCloseTo(-5, 3);
		expect(cfg.center).toEqual({ x: 0, y: 0, z: 0 });
		expect(cfg.transform).toEqual({
			translate: { x: 0, y: 0, z: 0 },
			scale: { x: 1, y: 1, z: 1 },
			rotate: { x: 0, y: 0, z: 0 }
		});
		expect(getLoadedAsset(cfg.assetId)?.diagnostics.openEdges).toBe(0);
	});
});

describe('simplify / revert', () => {
	it('simplifies from the source asset and reverts to it', async () => {
		const cfg = await importModelFile(stlFile('ball.stl', sphereStl(1)));
		const simplified = await applySimplify(cfg, 200);
		expect(simplified.assetId).not.toBe(cfg.assetId);
		expect(simplified.simplify).toEqual({ sourceAssetId: cfg.assetId, targetTriangles: 200 });
		expect(getLoadedAsset(simplified.assetId)!.diagnostics.triangles).toBeLessThanOrEqual(200);

		// applying again starts from the source, not the already-simplified mesh
		const again = await applySimplify(simplified, 300);
		expect(again.simplify).toEqual({ sourceAssetId: cfg.assetId, targetTriangles: 300 });

		const reverted = revertSimplify(again);
		expect(reverted.assetId).toBe(cfg.assetId);
		expect(reverted.simplify).toBeUndefined();
	});
});

describe('replaceImportedModel', () => {
	it('re-picking the same file keeps the config', async () => {
		const text = sphereStl(1);
		const cfg = { ...(await importModelFile(stlFile('ball.stl', text))), center: { x: 1, y: 2, z: 3 } };
		resetAssetStoreForTests(); // simulate "not on this device"
		globalThis.indexedDB = new IDBFactory();
		const { config, sameFile } = await replaceImportedModel(cfg, stlFile('ball.stl', text));
		expect(sameFile).toBe(true);
		expect(config).toEqual(cfg);
		expect(getLoadedAsset(cfg.assetId)).toBeDefined();
	});

	it('re-picking the original of a simplified config restores the same derived asset', async () => {
		const text = sphereStl(1);
		const simplified = await applySimplify(await importModelFile(stlFile('ball.stl', text)), 200);
		resetAssetStoreForTests();
		globalThis.indexedDB = new IDBFactory();
		const { config, sameFile } = await replaceImportedModel(simplified, stlFile('ball.stl', text));
		expect(sameFile).toBe(true);
		expect(config.assetId).toBe(simplified.assetId);
		expect(getLoadedAsset(simplified.assetId)).toBeDefined();
	});

	it('a different file keeps adjustments, refits and clears simplification', async () => {
		const simplified = await applySimplify(
			{
				...(await importModelFile(stlFile('ball.stl', sphereStl(1)))),
				center: { x: 1, y: 2, z: 3 }
			},
			200
		);
		const { config, sameFile } = await replaceImportedModel(
			simplified,
			stlFile('big.stl', sphereStl(10))
		);
		expect(sameFile).toBe(false);
		expect(config.fileName).toBe('big.stl');
		expect(config.center).toEqual({ x: 1, y: 2, z: 3 });
		expect(config.normalize.scale).toBeCloseTo(40, 0);
		expect(config.simplify).toBeUndefined();
	});
});

describe('refit', () => {
	it('recomputes offset and scale for a new up axis and size', async () => {
		const cfg = await importModelFile(stlFile('ball.stl', sphereStl(1)));
		const next = await refit(cfg, '+y', 400);
		expect(next.normalize.upAxis).toBe('+y');
		expect(next.normalize.targetSize).toBe(400);
		expect(next.normalize.scale).toBeCloseTo(200, 0);
	});
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/mesh-import/__tests__/import-model.test.ts`
Expected: FAIL — `Cannot find module '../import-model'`.

- [ ] **Step 7: Implement `import-model.ts`**

`src/lib/mesh-import/import-model.ts`:

```ts
/**
 * User-facing import operations. Each returns a new ImportedSurfaceConfig for
 * the caller to write into superConfigStore; none touch stores themselves.
 * Main-thread only (parses files).
 */
import type { ImportedSurfaceConfig, UpAxis } from '$lib/projection-geometry/types';
import { identityTransform } from '../../components/modal/editor/transform-config';
import { cleanMesh } from './clean-mesh';
import { computeFit, DEFAULT_TARGET_SIZE, defaultUpAxis } from './normalize';
import { hashMesh, putAsset, resolveAsset } from './asset-store';
import { simplifyAsset } from './simplify';
import { parseModel } from './parse-model';
import type { MeshAsset } from './types';

/** parse → clean → hash → store. */
export async function ingestModelFile(file: File): Promise<MeshAsset> {
	const { root, format } = await parseModel(file);
	const clean = cleanMesh(root);
	const asset: MeshAsset = {
		...clean,
		id: await hashMesh(clean),
		fileName: file.name,
		sourceFormat: format,
		createdAt: new Date().toISOString()
	};
	await putAsset(asset);
	return asset;
}

export async function importModelFile(file: File): Promise<ImportedSurfaceConfig> {
	const asset = await ingestModelFile(file);
	const upAxis = defaultUpAxis(asset.sourceFormat);
	return {
		type: 'ImportedMeshConfig',
		assetId: asset.id,
		fileName: asset.fileName,
		normalize: {
			upAxis,
			targetSize: DEFAULT_TARGET_SIZE,
			...computeFit(asset.positions, upAxis, DEFAULT_TARGET_SIZE)
		},
		center: { x: 0, y: 0, z: 0 },
		transform: identityTransform()
	};
}

const withoutSimplify = (cfg: ImportedSurfaceConfig): ImportedSurfaceConfig => {
	const { simplify: _drop, ...rest } = cfg;
	return rest;
};

/**
 * Re-pick (missing asset) or replace the model. Same content as the original
 * → config unchanged (a simplified config gets its derived asset rebuilt;
 * meshopt is deterministic, so the id matches). Different content → keep
 * transform / center / up axis / target size, refit, drop simplification.
 */
export async function replaceImportedModel(
	prev: ImportedSurfaceConfig,
	file: File
): Promise<{ config: ImportedSurfaceConfig; sameFile: boolean }> {
	const asset = await ingestModelFile(file);
	const originalId = prev.simplify?.sourceAssetId ?? prev.assetId;

	if (asset.id === originalId) {
		if (prev.simplify) {
			const derived = await simplifyAsset(asset, prev.simplify.targetTriangles);
			await putAsset(derived);
			return { config: { ...prev, assetId: derived.id }, sameFile: true };
		}
		return { config: { ...prev }, sameFile: true };
	}

	const { upAxis, targetSize } = prev.normalize;
	return {
		config: {
			...withoutSimplify(prev),
			assetId: asset.id,
			fileName: asset.fileName,
			normalize: { upAxis, targetSize, ...computeFit(asset.positions, upAxis, targetSize) }
		},
		sameFile: false
	};
}

const requireAsset = async (id: string, fileName: string): Promise<MeshAsset> => {
	const asset = await resolveAsset(id);
	if (!asset) throw new Error(`Model "${fileName}" isn't loaded on this device`);
	return asset;
};

/** Always simplifies the ORIGINAL asset, so repeated applies never compound. */
export async function applySimplify(
	cfg: ImportedSurfaceConfig,
	targetTriangles: number
): Promise<ImportedSurfaceConfig> {
	const sourceAssetId = cfg.simplify?.sourceAssetId ?? cfg.assetId;
	const source = await requireAsset(sourceAssetId, cfg.fileName);
	const derived = await simplifyAsset(source, targetTriangles);
	await putAsset(derived);
	return { ...cfg, assetId: derived.id, simplify: { sourceAssetId, targetTriangles } };
}

export function revertSimplify(cfg: ImportedSurfaceConfig): ImportedSurfaceConfig {
	if (!cfg.simplify) return cfg;
	return { ...withoutSimplify(cfg), assetId: cfg.simplify.sourceAssetId };
}

export async function refit(
	cfg: ImportedSurfaceConfig,
	upAxis: UpAxis,
	targetSize: number
): Promise<ImportedSurfaceConfig> {
	const asset = await requireAsset(cfg.assetId, cfg.fileName);
	return {
		...cfg,
		normalize: { upAxis, targetSize, ...computeFit(asset.positions, upAxis, targetSize) }
	};
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/mesh-import/__tests__/import-model.test.ts`
Expected: PASS (6 tests). If the relative import of `transform-config` fails under Jest's module mapper, it is a plain `.ts` file — check the path (`src/lib/mesh-import` → `../../components/modal/editor/transform-config`).

- [ ] **Step 9: Commit**

```bash
git add src/lib/mesh-import/parse-model.ts src/lib/mesh-import/import-model.ts src/lib/mesh-import/__tests__/parse-model.test.ts src/lib/mesh-import/__tests__/import-model.test.ts
git commit -m "feat(mesh-import): parse GLB/glTF/STL/OBJ and import/replace/simplify/refit operations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Surface editor UI

**Files:**
- Modify: `src/components/modal/editor/Surface.svelte`
- Create: `src/components/modal/editor/ImportedMeshControls.svelte`

**Interfaces:**
- Consumes: `importModelFile`, `replaceImportedModel`, `applySimplify`, `revertSimplify`, `refit` (7); `resolveAsset`, `assetStatus` (3); `toastStore` from `$lib/stores/toastStore`; `superConfigStore` from `$lib/stores`; existing `LabeledControl`, `NumberInput`, `PointInput`, `TransformControls`.
- Produces: the hidden file input has `data-testid="model-file-input"` (used by Task 10's E2E); the replace / re-pick input has `data-testid="model-replace-input"`.

UI code has no Jest coverage here (components aren't unit-tested in this repo); Task 10's E2E covers the import path end to end.

- [ ] **Step 1: Add the import option to `Surface.svelte`**

In the `<script>` block add imports:

```ts
	import { importModelFile } from '$lib/mesh-import/import-model';
	import { toastStore } from '$lib/stores/toastStore';
	import ImportedMeshControls from './ImportedMeshControls.svelte';
	import type { ImportedSurfaceConfig } from '$lib/projection-geometry/types';
```

Add state and the file handler:

```ts
	let fileInput: HTMLInputElement | undefined = $state();
	let importing = $state(false);

	const handleFilePicked = async (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = ''; // allow picking the same file again later
		if (!file) return;
		importing = true;
		try {
			const surface = await importModelFile(file);
			const config = get(superConfigStore);
			config.projectionConfigs[0].surfaceConfig = surface;
			superConfigStore.set(config);
			toastStore.add({ type: 'success', message: `Imported ${file.name}`, duration: 3000 });
		} catch (error) {
			toastStore.add({
				type: 'error',
				message: error instanceof Error ? error.message : 'Import failed',
				dismissible: true
			});
		} finally {
			importing = false;
		}
	};
```

At the top of `handleChangeSurfaceType`, before the `switch`, add:

```ts
		if (selectedType === 'import') {
			// Keep showing the current type until a file actually loads; a cancelled
			// picker then leaves everything as it was.
			(event.target as HTMLSelectElement).value = surfaceTypeValue;
			fileInput?.click();
			return;
		}
		// The current imported model's own option: nothing to change.
		if (selectedType === 'importedmesh') return;
```

(`surfaceTypeValue` for an imported surface is `'importedmesh'`, from the existing `type.replace('Config', '').toLowerCase()` derivation.)

Replace the `<select>` with:

```svelte
				<select value={surfaceTypeValue} onchange={handleChangeSurfaceType} disabled={importing}>
					<option value="sphere">Sphere</option>
					<option value="capsule">Capsule</option>
					<option value="globule">Globule</option>
					{#if surfaceConfig.type === 'ImportedMeshConfig'}
						<option value="importedmesh">Imported: {surfaceConfig.fileName}</option>
					{/if}
					<option value="import">Import model…</option>
				</select>
				<input
					bind:this={fileInput}
					data-testid="model-file-input"
					type="file"
					accept=".glb,.gltf,.stl,.obj"
					hidden
					onchange={handleFilePicked}
				/>
				{#if importing}<span>Importing…</span>{/if}
```

After the `TransformControls` block, add:

```svelte
			{#if surfaceConfig.type === 'ImportedMeshConfig'}
				<ImportedMeshControls surface={surfaceConfig as ImportedSurfaceConfig} />
			{/if}
```

(Place it before the Sphere block so the model controls sit directly under the transform.)

- [ ] **Step 2: Create `ImportedMeshControls.svelte`**

`src/components/modal/editor/ImportedMeshControls.svelte`:

```svelte
<script lang="ts">
	import { get } from 'svelte/store';
	import { superConfigStore } from '$lib/stores';
	import { toastStore } from '$lib/stores/toastStore';
	import { assetStatus, resolveAsset } from '$lib/mesh-import/asset-store';
	import {
		applySimplify,
		refit,
		replaceImportedModel,
		revertSimplify
	} from '$lib/mesh-import/import-model';
	import type { MeshAsset } from '$lib/mesh-import/types';
	import type { ImportedSurfaceConfig, UpAxis } from '$lib/projection-geometry/types';
	import LabeledControl from './LabeledControl.svelte';
	import Container from './Container.svelte';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import PointInput from '../../controls/super-control/PointInput.svelte';

	let { surface }: { surface: ImportedSurfaceConfig } = $props();

	const UP_AXES: UpAxis[] = ['+y', '+z', '-y', '-z', '+x', '-x'];

	let asset: MeshAsset | undefined = $state();
	let busy = $state(false);
	let replaceInput: HTMLInputElement | undefined = $state();
	let upAxis: UpAxis = $state(surface.normalize.upAxis);
	let targetSize = $state(surface.normalize.targetSize);
	let targetTriangles = $state(0);

	let missing = $derived($assetStatus[surface.assetId] === 'missing');

	// Load diagnostics whenever the asset changes (import, simplify, revert, re-pick).
	$effect(() => {
		const id = surface.assetId;
		void resolveAsset(id).then((loaded) => {
			if (surface.assetId !== id) return;
			asset = loaded;
			if (loaded) targetTriangles = loaded.diagnostics.triangles;
		});
	});

	$effect(() => {
		upAxis = surface.normalize.upAxis;
		targetSize = surface.normalize.targetSize;
	});

	/**
	 * Write `next` back, keeping the transform currently in the store
	 * (TransformControls binds straight to it, so `surface.transform` may be stale).
	 */
	const commit = (next: ImportedSurfaceConfig) => {
		const config = get(superConfigStore);
		const current = config.projectionConfigs[0].surfaceConfig;
		config.projectionConfigs[0].surfaceConfig = { ...next, transform: current.transform };
		superConfigStore.set(config);
	};

	const run = async (label: string, op: () => Promise<void>) => {
		busy = true;
		try {
			await op();
		} catch (error) {
			toastStore.add({
				type: 'error',
				message: `${label}: ${error instanceof Error ? error.message : String(error)}`,
				dismissible: true
			});
		} finally {
			busy = false;
		}
	};

	const handleReplace = async (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		await run('Replace model', async () => {
			const { config, sameFile } = await replaceImportedModel(surface, file);
			commit(config);
			if (!sameFile && missing) {
				toastStore.add({
					type: 'warning',
					message: `${file.name} is a different file than originally used — refit applied`,
					duration: 5000
				});
			}
		});
	};
</script>

<section class="imported-mesh">
	{#if missing}
		<div class="missing" role="alert">
			Model <strong>{surface.fileName}</strong> isn't on this device.
			<button disabled={busy} onclick={() => replaceInput?.click()}>Re-pick file</button>
		</div>
	{/if}

	<Container direction="column">
		<LabeledControl label="Model">
			<span>{surface.fileName}</span>
			<button disabled={busy} onclick={() => replaceInput?.click()}>Replace…</button>
			<input
				bind:this={replaceInput}
				data-testid="model-replace-input"
				type="file"
				accept=".glb,.gltf,.stl,.obj"
				hidden
				onchange={handleReplace}
			/>
		</LabeledControl>

		{#if asset}
			<LabeledControl label="Mesh">
				<span>
					{asset.diagnostics.triangles} tris · {asset.diagnostics.vertices} verts
					{#if asset.diagnostics.droppedPrimitives > 0}
						· {asset.diagnostics.droppedPrimitives} non-mesh parts skipped
					{/if}
				</span>
			</LabeledControl>
			{#if asset.diagnostics.openEdges > 0}
				<p class="warning">
					{asset.diagnostics.openEdges} open edges — Projection needs a closed mesh visible from
					the center
				</p>
			{/if}
		{/if}

		<LabeledControl label="Up axis">
			<select bind:value={upAxis} disabled={busy}>
				{#each UP_AXES as axis (axis)}
					<option value={axis}>{axis}</option>
				{/each}
			</select>
		</LabeledControl>
		<LabeledControl label="Target size">
			<NumberInput value={targetSize} onChange={(v) => (targetSize = v)} step={10} />
		</LabeledControl>
		<button
			disabled={busy || missing}
			onclick={() => run('Re-fit', async () => commit(await refit(surface, upAxis, targetSize)))}
		>
			Re-fit
		</button>

		<LabeledControl label="Ray center">
			<PointInput bind:value={$superConfigStore.projectionConfigs[0].surfaceConfig.center} />
		</LabeledControl>
		<button
			disabled={busy}
			onclick={() => commit({ ...surface, center: { x: 0, y: 0, z: 0 } })}
		>
			Reset to model center
		</button>

		<LabeledControl label="Simplify to">
			<NumberInput value={targetTriangles} onChange={(v) => (targetTriangles = v)} step={100} />
		</LabeledControl>
		<Container direction="row">
			<button
				disabled={busy || missing}
				onclick={() =>
					run('Simplify', async () => commit(await applySimplify(surface, targetTriangles)))}
			>
				{busy ? 'Working…' : 'Apply'}
			</button>
			{#if surface.simplify}
				<button disabled={busy} onclick={() => commit(revertSimplify(surface))}>
					Revert to original
				</button>
			{/if}
		</Container>
	</Container>
</section>

<style>
	.missing {
		padding: 0.5rem;
		border: 1px solid var(--color-warning, #c80);
		margin-bottom: 0.5rem;
	}
	.warning {
		color: var(--color-warning, #c80);
		font-size: 0.85em;
		margin: 0;
	}
</style>
```

Check before running: open `Container.svelte` and confirm it accepts `direction="row"`; if it only supports `column`, replace the inner `<Container direction="row">` with a plain `<div>`. Open `NumberInput.svelte` and confirm the prop names `value`, `onChange`, `step` (they are used this way in `Surface.svelte` today). The `PointInput` binding mirrors the sphere's existing `bind:value={…surfaceConfig.center}`; if svelte-check rejects it because the union member lacks `center`, it won't — every non-globule member has `center`, but `GlobuleConfig` doesn't, so cast exactly as `Surface.svelte` already does for the sphere (copy its expression).

- [ ] **Step 3: Type check and lint**

Run: `npm run check 2>&1 | tail -10 && npx eslint src/components/modal/editor/Surface.svelte src/components/modal/editor/ImportedMeshControls.svelte`
Expected: no new errors.

- [ ] **Step 4: Manual smoke test**

Restart the dev server (the worker bundle changed in Task 6 — Vite won't rebuild it for a running server): `npm run dev`. Open `/designer2`, open the **Su**rface rail panel, choose **Import model…**, pick any small GLB/STL. Expect: success toast, the select shows "Imported: <name>", diagnostics appear. Switch Pattern → Geometry to **Voronoi**; bands render. Cancel the picker once: the select still shows the previous type.

- [ ] **Step 5: Commit**

```bash
git add src/components/modal/editor/Surface.svelte src/components/modal/editor/ImportedMeshControls.svelte
git commit -m "feat(surface-editor): Import model option with fit, center, simplify controls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ray-center marker in the viewport

**Files:**
- Create: `src/components/three-renderer/SurfaceCenterMarker.svelte`
- Modify: `src/components/three-renderer/Scene.svelte:49` (import) and `:326` (mount)

**Interfaces:**
- Consumes: `superConfigStore` from `$lib/stores`.
- Produces: nothing used by other tasks.

- [ ] **Step 1: Create the marker**

`src/components/three-renderer/SurfaceCenterMarker.svelte`:

```svelte
<script lang="ts">
	/**
	 * Marks where rays are cast from for an imported surface. Driven by the
	 * config, not panel state — sidebar panels unmount when closed.
	 * Static geometry/material only: Three.js objects in $state trip Svelte's
	 * effect-depth limit (see GlobuleMesh notes).
	 */
	import { T } from '@threlte/core';
	import { superConfigStore } from '$lib/stores';

	let center = $derived.by(() => {
		const surface = $superConfigStore.projectionConfigs[0]?.surfaceConfig;
		return surface?.type === 'ImportedMeshConfig' ? surface.center : null;
	});
</script>

{#if center}
	<T.Mesh position={[center.x, center.y, center.z]} renderOrder={999}>
		<T.SphereGeometry args={[6, 16, 12]} />
		<T.MeshBasicMaterial color="#ff2fa0" depthTest={false} transparent opacity={0.9} />
	</T.Mesh>
{/if}
```

- [ ] **Step 2: Mount it in `Scene.svelte`**

Next to the `ProjectionGeometryComponent` import (line ~49):

```ts
	import SurfaceCenterMarker from './SurfaceCenterMarker.svelte';
```

Right after `<ProjectionGeometryComponent onClick={handleProjectionClick} />` (line ~326):

```svelte
<SurfaceCenterMarker />
```

- [ ] **Step 3: Type check and visual check**

Run: `npm run check 2>&1 | tail -5`
Expected: no new errors.
With the dev server from Task 8: after importing a model, a pink dot shows at the origin; editing **Ray center** moves it; **Reset to model center** returns it.

- [ ] **Step 4: Commit**

```bash
git add src/components/three-renderer/SurfaceCenterMarker.svelte src/components/three-renderer/Scene.svelte
git commit -m "feat(viewport): show the ray center of an imported surface

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: E2E fixture and test

**Files:**
- Create: `scripts/make-fixture-glb.mjs`
- Create: `tests/fixtures/deformed-icosphere.glb` (generated)
- Create: `tests/model-import.spec.ts`

**Interfaces:**
- Consumes: `data-testid="model-file-input"` (Task 8); `superConfigStore`, `superGlobuleStore` exported from `/src/lib/stores/index.ts`.
- Produces: nothing.

- [ ] **Step 1: Write the fixture generator**

`scripts/make-fixture-glb.mjs`:

```js
// Writes tests/fixtures/deformed-icosphere.glb — a closed, star-shaped, Y-up
// blob (~1 unit radius, like a metre-scale export) for the model-import E2E.
// Hand-assembled GLB: GLTFExporter needs FileReader, which Node lacks.
import { mkdirSync, writeFileSync } from 'node:fs';
import { IcosahedronGeometry, Vector3 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const geometry = mergeVertices(new IcosahedronGeometry(1, 15)); // 20·16² = 5120 triangles
const position = geometry.getAttribute('position');
const v = new Vector3();
for (let i = 0; i < position.count; i++) {
	v.fromBufferAttribute(position, i);
	v.multiplyScalar(1 + 0.15 * Math.sin(3 * v.x) * Math.cos(2 * v.z));
	v.y *= 1.4;
	position.setXYZ(i, v.x, v.y, v.z);
}
const positions = Float32Array.from(position.array);
const indices = Uint32Array.from(geometry.getIndex().array);

const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < positions.length; i += 3) {
	for (let k = 0; k < 3; k++) {
		min[k] = Math.min(min[k], positions[i + k]);
		max[k] = Math.max(max[k], positions[i + k]);
	}
}

const pad4 = (n) => (n + 3) & ~3;
const posBytes = positions.byteLength;
const idxBytes = indices.byteLength;
const binLength = pad4(posBytes + idxBytes);

const json = {
	asset: { version: '2.0', generator: 'shades make-fixture-glb' },
	scene: 0,
	scenes: [{ nodes: [0] }],
	nodes: [{ mesh: 0 }],
	meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
	buffers: [{ byteLength: binLength }],
	bufferViews: [
		{ buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
		{ buffer: 0, byteOffset: posBytes, byteLength: idxBytes, target: 34963 }
	],
	accessors: [
		{ bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max },
		{ bufferView: 1, componentType: 5125, count: indices.length, type: 'SCALAR' }
	]
};

let jsonText = JSON.stringify(json);
while (jsonText.length % 4 !== 0) jsonText += ' ';
const jsonChunk = Buffer.from(jsonText, 'utf8');

const bin = Buffer.alloc(binLength);
Buffer.from(positions.buffer).copy(bin, 0);
Buffer.from(indices.buffer).copy(bin, posBytes);

const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
const out = Buffer.alloc(total);
let o = 0;
out.writeUInt32LE(0x46546c67, o); o += 4; // 'glTF'
out.writeUInt32LE(2, o); o += 4;
out.writeUInt32LE(total, o); o += 4;
out.writeUInt32LE(jsonChunk.length, o); o += 4;
out.writeUInt32LE(0x4e4f534a, o); o += 4; // 'JSON'
jsonChunk.copy(out, o); o += jsonChunk.length;
out.writeUInt32LE(bin.length, o); o += 4;
out.writeUInt32LE(0x004e4942, o); o += 4; // 'BIN\0'
bin.copy(out, o);

mkdirSync('tests/fixtures', { recursive: true });
writeFileSync('tests/fixtures/deformed-icosphere.glb', out);
console.log(`wrote tests/fixtures/deformed-icosphere.glb (${total} bytes, ${indices.length / 3} triangles)`);
```

- [ ] **Step 2: Generate the fixture**

Run: `node scripts/make-fixture-glb.mjs`
Expected: `wrote tests/fixtures/deformed-icosphere.glb (… bytes, 5120 triangles)`.

- [ ] **Step 3: Write the E2E test**

`tests/model-import.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Model import end to end: pick a GLB in the Surface editor, confirm the
 * Voronoi pipeline produces bands on it, then simulate loading a saved config
 * after a reload (superConfigStore itself is not persisted across reloads —
 * see persistable.ts OVERRIDE_PERSISTENCE) and confirm the mesh comes back
 * from IndexedDB.
 */

const FIXTURE = fileURLToPath(new URL('./fixtures/deformed-icosphere.glb', import.meta.url));
const STORES = '/src/lib/stores/index.ts';

type StoreLike<T> = { subscribe: (run: (v: T) => void) => () => void; set: (v: T) => void };

const readSurface = (page: Page) =>
	page.evaluate(async (specifier: string) => {
		const { superConfigStore } = (await import(/* @vite-ignore */ specifier)) as {
			superConfigStore: StoreLike<{ projectionConfigs: { surfaceConfig: unknown }[] }>;
		};
		let value: unknown;
		superConfigStore.subscribe((c) => (value = c.projectionConfigs[0].surfaceConfig))();
		return value as { type: string; assetId: string; fileName: string };
	}, STORES);

const voronoiState = (page: Page) =>
	page.evaluate(async (specifier: string) => {
		const { superGlobuleStore } = (await import(/* @vite-ignore */ specifier)) as {
			superGlobuleStore: StoreLike<{
				voronoiResult?: { tubes: unknown[] };
				pipelineErrors?: { message: string }[];
			}>;
		};
		let value: { tubes: number; errors: string[] } = { tubes: 0, errors: [] };
		superGlobuleStore.subscribe((g) => {
			value = {
				tubes: g?.voronoiResult?.tubes.length ?? 0,
				errors: (g?.pipelineErrors ?? []).map((e) => e.message)
			};
		})();
		return value;
	}, STORES);

const openDesigner = async (page: Page) => {
	await page.goto('/designer2');
	await expect(page.getByRole('button', { name: 'Prepare Download' })).toBeVisible({
		timeout: 60_000
	});
};

const selectVoronoiGeometry = async (page: Page) => {
	const rail = page.locator('button', { hasText: /atternl/i }).first();
	await rail.click();
	await page.locator('label:has-text("Geometry") select').first().selectOption('voronoi');
	await expect(page.locator('g[id^="band-"]').first()).toBeVisible({ timeout: 60_000 });
	await rail.click({ force: true });
};

const openSurfacePanel = async (page: Page) => {
	// Rail buttons render an accelerator letter in a separate span; match the rest.
	await page.locator('button', { hasText: /urface/i }).first().click();
	await expect(page.locator('[data-testid="model-file-input"]')).toBeAttached();
};

test.describe('model import', () => {
	test.setTimeout(240_000);

	test('imports a GLB as the Voronoi surface and restores it from IndexedDB', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(e.message));

		await openDesigner(page);
		await selectVoronoiGeometry(page);
		await openSurfacePanel(page);

		await page.setInputFiles('[data-testid="model-file-input"]', FIXTURE);
		await expect
			.poll(async () => (await readSurface(page)).type, { timeout: 30_000 })
			.toBe('ImportedMeshConfig');
		const imported = await readSurface(page);
		expect(imported.fileName).toBe('deformed-icosphere.glb');

		await expect
			.poll(async () => (await voronoiState(page)).tubes, { timeout: 60_000 })
			.toBeGreaterThan(0);
		expect((await voronoiState(page)).errors).toEqual([]);

		// Capture the config as a saved config would hold it, reload, and load it back.
		const saved = await page.evaluate(async (specifier: string) => {
			const { superConfigStore } = (await import(/* @vite-ignore */ specifier)) as {
				superConfigStore: StoreLike<unknown>;
			};
			let value: unknown;
			superConfigStore.subscribe((c) => (value = c))();
			return JSON.parse(JSON.stringify(value));
		}, STORES);

		await page.reload();
		await openDesigner(page);
		await selectVoronoiGeometry(page);
		await page.evaluate(
			async ([specifier, config]) => {
				const { superConfigStore } = (await import(/* @vite-ignore */ specifier as string)) as {
					superConfigStore: StoreLike<unknown>;
				};
				superConfigStore.set(config);
			},
			[STORES, saved] as const
		);

		await expect
			.poll(async () => (await readSurface(page)).assetId, { timeout: 30_000 })
			.toBe(imported.assetId);
		await expect
			.poll(async () => (await voronoiState(page)).errors, { timeout: 60_000 })
			.toEqual([]);
		expect((await voronoiState(page)).tubes).toBeGreaterThan(0);

		expect(errors).toEqual([]);
	});
});
```

Before running, confirm `superGlobuleStore` is exported from `src/lib/stores/index.ts` (it is used as `$superGlobuleStore` in `ProjectionGeometryComponent.svelte` imported from `$lib/stores`). The voronoi tubes count check uses `voronoiResult.tubes`; if that field is named differently in `SuperGlobule['voronoiResult']` (`src/lib/types.ts:1239`), use the real name.

- [ ] **Step 4: Run the E2E test**

Make sure nothing is listening on port 9775 (the Playwright config refuses to reuse a server, to avoid stale worker bundles), then:

Run: `npx playwright test tests/model-import.spec.ts`
Expected: 1 passed.

- [ ] **Step 5: Run the full unit suite once more**

Run: `npm run test:unit 2>&1 | tail -8`
Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/make-fixture-glb.mjs tests/fixtures/deformed-icosphere.glb tests/model-import.spec.ts
git commit -m "test(e2e): import a GLB as the Voronoi surface and restore it from IndexedDB

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Known limitations (deliberately out of scope)

- With only Voronoi shown, the imported mesh itself isn't drawn in the 3D view — only its bands and the ray-center marker. (Same as other surfaces: the surface is drawn only under View → Show Projection.)
- Parse/clean run on the main thread; a very dense scan may briefly freeze the UI during import.
