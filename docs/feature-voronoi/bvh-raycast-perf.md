# Voronoi raycasting: does it get BVH acceleration?

## Verdict: YES — fully accelerated (no change needed)

The Voronoi path gets the **same BVH acceleration** as the projection path, automatically and for free. The acceleration is not bolted onto the projection raycasters specifically; it is baked into the surface mesh itself by `generateSurface`, and **both** generation methods build their surface through that one function. Every `intersectObject(surface, true)` call in `generate-voronoi.ts` — the `intersect` closure, the separate `normalRaycaster`, and the curve-offset / surface-projection-division casts — dispatches to the accelerated `acceleratedRaycast` method on the surface mesh.

There is one efficiency caveat worth noting (BVH is recomputed per `makeVoronoi` call, not cached), but correctness/acceleration is fine.

---

## Evidence

### 1. Where BVH is set up

`three-mesh-bvh` is imported and the acceleration helper lives in `generate-projection.ts`:

`src/lib/projection-geometry/generate-projection.ts:31`

```ts
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
```

`src/lib/projection-geometry/generate-projection.ts:193-217` — `optimizeSurfaceForRaycasting` traverses an `Object3D`, computes a bounds tree on each mesh's geometry, and replaces that mesh's `raycast` method:

```ts
const optimizeSurfaceForRaycasting = (object: Object3D): void => {
	object.traverse((child) => {
		if (child instanceof Mesh && child.geometry) {
			if (!(child.geometry as any).boundsTree) {
				// guard: skip if already built
				(child.geometry as any).computeBoundsTree = computeBoundsTree.bind(child.geometry);
				(child.geometry as any).disposeBoundsTree = disposeBoundsTree.bind(child.geometry);
				(child.geometry as any).computeBoundsTree(); // build the BVH
				child.raycast = acceleratedRaycast; // per-mesh, NOT prototype-wide
			}
		}
	});
};
```

Two important properties of this implementation:

- Acceleration is assigned **per-mesh** (`child.raycast = acceleratedRaycast`), not globally on `Mesh.prototype`. So a mesh is only accelerated if it has passed through this function.
- The `boundsTree` guard means re-running on an already-accelerated mesh is a no-op.

### 2. The surface mesh used by Voronoi IS accelerated

`optimizeSurfaceForRaycasting` is called **inside** `generateSurface`, at the very end, before returning:

`src/lib/projection-geometry/generate-projection.ts:254-257`

```ts
// Apply BVH acceleration for fast ray tracing
optimizeSurfaceForRaycasting(surface);
return surface;
```

Voronoi obtains its surface from this exact function:

`src/lib/voronoi/generate-voronoi.ts:28-32, 302`

```ts
import { generateSurface, ... } from '$lib/projection-geometry/generate-projection';
...
const surface = generateSurface(resolvedSurfaceConfig);   // returns BVH-accelerated meshes
```

Therefore every mesh in the `surface` object that Voronoi raycasts against has a `boundsTree` and an `acceleratedRaycast` method by the time `makeVoronoi` uses it. No separate patching is required and no `Mesh.prototype` patch exists anywhere (confirmed by repo-wide grep for `Mesh.prototype` / `acceleratedRaycast` / `boundsTree` — the only hits are in `generate-projection.ts`).

### 3. Both Voronoi raycast paths benefit

`intersectObject(surface, true)` traverses the object tree and invokes **each child mesh's own `.raycast`** method. Because that method was swapped to `acceleratedRaycast`, both Voronoi raycasters are accelerated:

- `createSurfaceIntersector`'s `intersect` closure — `src/lib/voronoi/generate-voronoi.ts:50-60`
  ```ts
  const raycaster = new Raycaster(undefined, undefined, undefined, 2000);
  return (direction) => {
  	raycaster.set(center, direction.clone().normalize());
  	const hits = raycaster.intersectObject(surface, true); // -> acceleratedRaycast
  	return hits.length > 0 ? hits[0].point.clone() : null;
  };
  ```
- the separate normal raycaster — `src/lib/voronoi/generate-voronoi.ts:326, 354-355`
  ```ts
  const normalRaycaster = new Raycaster(undefined, undefined, undefined, 2000);
  ...
  normalRaycaster.set(center, dir.clone().normalize());
  const hits = normalRaycaster.intersectObject(surface, true); // -> acceleratedRaycast
  ```

The `Raycaster` instance does not need to know anything about the BVH; acceleration lives on the mesh side, so any number of independently-constructed raycasters all benefit equally.

Note: `extractSurfaceTriangles` (`src/lib/voronoi/extract-surface-triangles.ts`) does **not** raycast. It walks geometry attributes to produce a CPU-side triangle list for area-weighted seed sampling. It is unrelated to the acceleration question (neither helped nor hurt by the BVH).

---

## Cost analysis (raycasts)

Defaults: `edgeDivisions: 6`, `surfaceProjectionDivisions: 0` (`src/lib/shades-config.ts:707,709`).

Per Voronoi edge, the inner loop runs over `edgeDivisions + 1` sampled directions (`src/lib/voronoi/generate-voronoi.ts:109` builds `divisions + 1` directions; loop at `:347`). For each sampled direction that hits the surface, the code performs:

| Cast                              | Location | Purpose                    |
| --------------------------------- | -------- | -------------------------- |
| `intersect(dir)`                  | `:348`   | edge point on surface      |
| `normalRaycaster.intersectObject` | `:355`   | surface normal at point    |
| `intersect(curveDirA)`            | `:373`   | curve offset toward cell A |
| `intersect(curveDirB)`            | `:377`   | curve offset toward cell B |

= **4 raycasts per sampled point** (the task estimated ~3; the actual count is 4 because both the curve-A and curve-B offsets cast, plus the point and the normal).

So per edge ≈ `(edgeDivisions + 1) × 4` = `7 × 4 = 28` raycasts at defaults.

Additional per-edge casts:

- Surface-projection divisions: `2 × spDivisions` casts per sampled point (`:445, :453`). Zero at default `surfaceProjectionDivisions = 0`. With `spDivisions = N` it adds `(edgeDivisions + 1) × 2N` casts per edge.
- `fillAll`: one extra cast **per cell** (not per edge) for the cell apex (`:508`), gated behind `config.fillAll`.

**Total ≈ (number of Voronoi edges) × (edgeDivisions + 1) × (4 + 2·spDivisions) + (fillAll ? numCells : 0).**

For a typical sphere Voronoi with, say, ~150 edges at defaults: ~150 × 28 ≈ **4,200 raycasts** per generation, all going through the BVH. Without BVH each of these would be O(triangles) against the full surface mesh (a subdivided sphere/capsule/globule can be thousands of triangles), so the acceleration is meaningful and is in fact being applied.

---

## BVH lifecycle: once-per-call, not global

The BVH is **not** built once globally. It is (re)built every time `generateSurface` is called, which is once per `makeVoronoi` invocation (`generate-voronoi.ts:302`) — i.e. once per geometry regeneration in the worker.

- The `boundsTree` guard at `generate-projection.ts:200` only prevents recomputation **within the same mesh instance**. Since each `makeVoronoi` call creates a brand-new `surface`/mesh via `generateSurface`, the guard never short-circuits across calls — every regeneration pays for one fresh `computeBoundsTree()`.
- This is a fixed per-generation cost (building the BVH for the surface mesh), generally far cheaper than the thousands of accelerated raycasts it enables, so it is not a concern. It only becomes wasteful if the same surface config is regenerated repeatedly without geometry changes — but the current architecture rebuilds the surface each time regardless, so caching the mesh (and its BVH) would be the lever, not changing the acceleration code.

---

## Recommendation

**No code change is required for correctness or for acceleration** — Voronoi already inherits BVH acceleration through `generateSurface`.

Optional efficiency improvements (not necessary, low priority):

1. **Reuse one raycaster.** `generate-voronoi.ts` constructs two long-max-distance raycasters (`createSurfaceIntersector`'s internal one at `:54` and `normalRaycaster` at `:326`). They could share a single instance; this saves only allocation, not per-cast cost. Negligible.

2. **Cache the surface mesh + BVH across regenerations.** If profiling shows `computeBoundsTree()` is hot (e.g. for a heavy globule surface regenerated frequently with an unchanged surface config), memoize the `generateSurface` result keyed by `resolvedSurfaceConfig`. The change would go in `generate-projection.ts:223 generateSurface` (or a wrapper), reusing the prior `Object3D` when the config is unchanged so the existing `boundsTree` guard at `:200` short-circuits. This is the only place redundant BVH work could be removed, and it benefits both projection and voronoi.

Neither is needed to get the acceleration the task asked about.

---

## Uncertainties

- **Whether `acceleratedRaycast` actually consults `boundsTree` for these geometries at runtime.** This is standard `three-mesh-bvh` behavior (it does), and the wiring here matches the library's documented manual-setup pattern. I did not execute the worker to observe BVH traversal counts, but the static wiring is unambiguous: bounds tree built (`:205`) + mesh `.raycast` swapped (`:208`) + raycasts dispatch through that mesh via `intersectObject(surface, true)`.
- **End-cap meshes for globule surfaces** (`generate-projection.ts:242-247`) are added to `surface` before `optimizeSurfaceForRaycasting` runs, so they are accelerated too. I confirmed they're added inside `generateSurface` prior to the `:255` optimize call, so they're covered — but I did not verify their geometries always expose a `position` attribute (the optimize helper guards on `child.geometry` only, while `acceleratedRaycast` needs valid geometry; a malformed cap mesh would `console.warn` at `:213` and silently fall back to default raycast for that mesh).
