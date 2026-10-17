# 3D Model Import as Surface — Design

Date: 2026-10-05
Origin notes: `docs/specs/3d-import.md`

## Goal

Let the user pick a local 3D model file from the Surface editor ("Import model…"),
load it, clean and adjust it, and hand it to the existing Projection and Voronoi
pipelines as their `surface` — with **no changes to pipeline logic**.

### Success criteria

- Selecting a GLB / self-contained glTF / STL / OBJ file replaces
  `projectionConfigs[0].surfaceConfig` with an imported-mesh surface, and the
  Voronoi pipeline produces bands on it.
- The model is auto-fit (centered, scaled, up-axis corrected) on import and can be
  further adjusted: up axis, target size, ray center, simplification, transform.
- The imported surface survives a page reload on the same browser.
- A saved config whose model isn't present locally degrades gracefully (non-fatal
  pipeline error + re-pick prompt), never crashes.

### Non-goals (this iteration)

- Any change to projection / Voronoi algorithms. Some models (non-star-shaped,
  open, holed) will be unsuitable for Projection or Voronoi `surface` method;
  that is accepted. Diagnostics warn, nothing more.
- Remote asset persistence (Turso blob / object storage). The design must not
  preclude it — see "Future: remote persistence".
- Draco-compressed glTF, textures, UVs, normals, materials.
- Hole filling, remeshing, repair.
- Moving parse/clean into a dedicated worker (add only if imports visibly stall).

## Approach

Config holds a small **asset reference**; the mesh lives in a **content-addressed
asset store** (IndexedDB + per-thread in-memory registry). `generateSurface`
remains synchronous: callers `await ensureAssetsLoaded(config)` first, on both the
main thread and in the geometry worker.

Rejected alternatives:

- _Mesh embedded in config_ — megabytes through every config clone,
  `JSON.parse(JSON.stringify())`, worker message, localStorage (~5 MB cap) and DB row.
- _Worker-owned mesh via postMessage_ — stateful protocol fragile across worker
  restarts; still needs IndexedDB for persistence.

## Data model

Added to `src/lib/projection-geometry/types.ts`:

```ts
export type UpAxis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export type ImportedMeshConfig = {
	type: 'ImportedMeshConfig';
	/** sha-256 (hex) of the asset's canonical bytes (positions + index). */
	assetId: string;
	/** Original file name; shown in UI and in the re-pick prompt. */
	fileName: string;
	normalize: {
		/** Source axis that maps to the app's up axis (Z). */
		upAxis: UpAxis;
		/** Max bounding-box dimension after fit. Default 800. */
		targetSize: number;
		/** Computed bbox-center shift (applied after up-axis rotation). */
		offset: Point3;
		/** Computed uniform scale. */
		scale: number;
	};
	/** Ray-cast center. Defaults to the normalized bbox center (origin). */
	center: Point3;
	/** Present when `assetId` is a simplified derivative. */
	simplify?: { sourceAssetId: string; targetTriangles: number };
};

export type SurfaceGeometryConfig =
	SphereConfig | CapsuleConfig | GlobuleConfig | ImportedMeshConfig;
```

The user transform comes from the existing `SurfaceConfig` intersection
(`transform: TransformConfig | 'inherit'`); imported surfaces are always created
with a concrete `identityTransform()`.

`center` is the key to pipeline compatibility: `getProjectionCenter`
(`generate-projection.ts`) and Voronoi's `getSurfaceCenter` already read
`surfaceConfig.center` for every non-globule type, so the imported surface's ray
center flows through untouched.

### Mesh asset

```ts
export type MeshAsset = {
	id: string;
	fileName: string;
	sourceFormat: 'glb' | 'gltf' | 'stl' | 'obj';
	positions: Float32Array; // cleaned, un-normalized, world-baked
	index: Uint32Array;
	diagnostics: {
		triangles: number;
		vertices: number;
		openEdges: number; // edges used by exactly one triangle
		droppedPrimitives: number; // lines/points skipped
	};
	derivedFrom?: { assetId: string; targetTriangles: number };
	createdAt: string; // ISO
};
```

Assets store the **cleaned but un-normalized** mesh. Normalization is parameters
only, so re-fit / up-axis changes never rewrite an asset. Simplification produces
a new asset.

## Modules — `src/lib/mesh-import/`

| File                | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parse-model.ts`    | `File` → three `Object3D` by extension. GLB/glTF via `GLTFLoader` + `MeshoptDecoder`; STL via `STLLoader`; OBJ via `OBJLoader`. Draco → error "re-export without Draco compression". glTF with external buffer URIs → error "export as GLB". Unknown extension → error.                                                                                                                                          |
| `clean-mesh.ts`     | `Object3D` → `{ positions, index, diagnostics }`. Bake node world matrices; skip `Line`/`Points` (count as `droppedPrimitives`); keep only `position`; `mergeGeometries` into one; `mergeVertices` with tolerance relative to bbox diagonal (1e-6 × diagonal); drop degenerate (zero-area / repeated-index) triangles; count open edges. Pure. Throws if zero triangles remain.                                  |
| `normalize.ts`      | `computeFit(positions, upAxis, targetSize)` → `{ offset, scale }`; `normalizeMatrix(normalize)` → `Matrix4` = scale · translate(offset) · upAxisRotation. Default up axis: `+y` for glb/gltf/obj, `+z` for stl. Pure.                                                                                                                                                                                            |
| `simplify.ts`       | `simplifyAsset(source, targetTriangles)` → new `MeshAsset` via `meshoptimizer`'s `MeshoptSimplifier` (await `.ready`). Never returns more triangles than source.                                                                                                                                                                                                                                                 |
| `asset-store.ts`    | `hashMesh(positions, index)` (`crypto.subtle.digest('SHA-256')`); IndexedDB `putAsset` / `getAsset` (db `shades-assets`, store `meshAssets`, keyPath `id`); in-memory registry; `resolveAsset(id)` (registry → IndexedDB); `getLoadedAsset(id)` (sync, registry only); `ensureAssetsLoaded(config)` (collects `assetId`s from `projectionConfigs[].surfaceConfig`, resolves missing, silently tolerates misses). |
| `asset-geometry.ts` | `getAssetGeometry(assetId)` → cached `BufferGeometry` per thread (built from registry asset, BVH computed once). Throws `MissingMeshAssetError` when the asset isn't loaded.                                                                                                                                                                                                                                     |
| `import-model.ts`   | Orchestrates the UI action: parse → clean → hash → put → computeFit → returns an `ImportedMeshConfig` (with `identityTransform()`).                                                                                                                                                                                                                                                                              |

Works in both the main thread and the worker; IndexedDB and `crypto.subtle` are
available in Web Workers. Only `parse-model.ts` / `import-model.ts` are main-thread-only.

New dependencies: `meshoptimizer` (runtime), `fake-indexeddb` (dev, Jest).

## Generation integration

`generateSurface` (`generate-projection.ts`) gains:

```ts
} else if (cfg.type === 'ImportedMeshConfig') {
	const mesh = new Mesh(getAssetGeometry(cfg.assetId));
	mesh.applyMatrix4(normalizeMatrix(cfg.normalize));
	surface.add(mesh);
}
```

Existing transform application and `optimizeSurfaceForRaycasting` follow
unchanged. Implementation must verify `optimizeSurfaceForRaycasting` skips
geometries that already have a `boundsTree`, and that no path disposes the cached
shared geometry (guard or exclude it).

Asset availability before the synchronous call:

- **Main thread** — `generateSuperGlobuleAsync` (`workerStore.ts`) awaits
  `ensureAssetsLoaded(config)` before posting, so the post-result surface rebuilds
  (`workerStore.ts` ~294, ~309) find the asset.
- **Worker** — `super-globule.worker.ts` message handler awaits
  `ensureAssetsLoaded(config)` before `generateSuperGlobule`. Nothing new crosses
  `postMessage`.

`generate-superglobule.ts`'s `resolvedProjectionConfigs` passes non-globule
surface configs through unchanged — no edit needed. `validators.ts` gains an
`ImportedMeshConfig` shape check if surface configs are validated there.

### Missing asset

`getAssetGeometry` throws `MissingMeshAssetError(assetId, fileName)`. Inside the
projection / Voronoi pipelines `runPipeline` already converts throws into
non-fatal `pipelineErrors` (toast; other pipelines still render). On the main
thread the post-result surface rebuild must catch it too and leave `surface`
unset rather than rejecting the whole result.

The Surface editor shows a banner: "Model _<fileName>_ isn't on this device" +
**Re-pick file**. On re-pick:

- hash matches `assetId` (or `simplify.sourceAssetId`) → store, regenerate; if the
  config is simplified, re-run simplify with the stored `targetTriangles`.
- hash differs → accept as new asset, keep transform / center / upAxis /
  targetSize, recompute `offset`/`scale`, clear `simplify`, show notice
  "different file than originally used".

## UI

`Surface.svelte`:

- Dropdown gains **Import model…** (value `import`). Selecting it opens a hidden
  `<input type="file" accept=".glb,.gltf,.stl,.obj">`. Cancel or failure restores
  the previous selection; failures toast the parser's message.
- When the surface is `ImportedMeshConfig`, render `ImportedMeshControls.svelte`
  (new) plus the existing `TransformControls`.

`ImportedMeshControls.svelte`:

- **Model** — file name; **Replace…** (re-pick keeping adjustments, same rules as
  hash-differs above); diagnostics: triangles, vertices, open edges (warning style
  when > 0: "Projection needs a closed mesh visible from the center"), dropped
  primitives.
- **Fit** — up-axis select, target size, **Re-fit** (recomputes offset/scale).
- **Ray center** — `PointInput` + **Reset to model center** (origin after fit).
- **Simplify** — target triangle count (defaults to current), **Apply**,
  **Revert to original** (restores `sourceAssetId`, clears `simplify`). Busy state
  while running. Apply always simplifies from the source asset, never compounds.
- Missing-asset banner.

Viewport: a small marker at the ray center whenever the surface is
`ImportedMeshConfig` — derived from `superConfigStore`, not panel state (sidebar
panels unmount on close).

## Testing

Jest unit tests (`src/lib/mesh-import/__tests__/`):

- `clean-mesh` — nested nodes with transforms bake correctly; UV-seam duplicates
  weld; `Line` primitives dropped and counted; open edges = 0 on closed box, > 0 on
  open box; empty result throws.
- `normalize` — each up axis maps to +Z; fitted bbox max dimension = targetSize;
  bbox center at origin.
- `simplify` — triangle count ≤ target (within meshoptimizer tolerance) and never
  above source.
- `asset-store` — hash stable for identical data, differs for different data;
  put/get round-trip via `fake-indexeddb`; `ensureAssetsLoaded` tolerates misses.
- `generateSurface` — imported cube: ray from center hits at expected normalized,
  transformed distance; missing asset throws `MissingMeshAssetError`.

Playwright E2E (`tests/`):

- Fixture `tests/fixtures/deformed-icosphere.glb`, generated once by a committed
  script using `GLTFExporter`.
- Upload via `setInputFiles` from the Surface editor, switch Geometry to Voronoi,
  assert bands render; reload, assert it still renders (IndexedDB round-trip).

## Future: remote persistence

Config already references content-addressed assets. Remote storage adds a second
backend behind `resolveAsset(id)` (registry → IndexedDB → remote) and an upload on
save. `ImportedMeshConfig` and the generation path do not change. Keep
`asset-store.ts` the only module that knows where bytes live.
