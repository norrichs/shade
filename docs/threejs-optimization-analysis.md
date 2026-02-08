# Three.js Optimization Analysis: BVH and WebGPU

**Status:** Research - Quick Win Identified
**Created:** 2026-02-01
**Context:** JavaScript-based optimizations for 22.4M ray-mesh intersection bottleneck

## Problem Statement

Current implementation takes 15+ seconds for doubly truncated icosahedron at sample rate 10, performing 22.4 million ray-mesh intersection tests without acceleration structure.

## Critical Finding: No BVH Acceleration

**Current implementation:** Three.js Raycaster uses O(n) triangle iteration per ray

```typescript
edgeRaycaster.intersectObject(surface, true); // Tests EVERY triangle
```

**What's missing:** Bounding Volume Hierarchy (BVH) spatial acceleration structure

## Quick Win: three-mesh-bvh Library

### Overview

The `three-mesh-bvh` library provides drop-in BVH acceleration for Three.js raycasting.

**GitHub:** https://github.com/gkjohnson/three-mesh-bvh
**NPM:** `npm install three-mesh-bvh`

### Expected Performance

- **Typical speedup:** 2-10x depending on geometry complexity
- **Estimated for our case:** 15 seconds → 2-4 seconds (5-7x improvement)
- **Memory cost:** ~50% additional memory for BVH tree structure

### Implementation (2-4 hours)

**Step 1: Install**

```bash
npm install three-mesh-bvh
```

**Step 2: Modify `src/lib/projection-geometry/generate-projection.ts`**

```typescript
import { acceleratedRaycast, computeBoundsTree } from 'three-mesh-bvh';

// Add after surface creation (around line 400)
function optimizeSurfaceForRaycasting(object: Object3D): void {
	object.traverse((mesh) => {
		if (mesh.isMesh && mesh.geometry && !mesh.geometry.boundsTree) {
			try {
				mesh.geometry.computeBoundsTree();
				mesh.raycast = acceleratedRaycast;
				console.debug(`BVH computed for ${mesh.geometry.attributes.position.count} vertices`);
			} catch (error) {
				console.warn('Failed to compute BVH for mesh:', error);
			}
		}
	});
}

// Call after surface generation
const transformMatrix = getMatrix4(cfg.transform);
surface.applyMatrix4(transformMatrix);
surface.updateMatrixWorld(true);
optimizeSurfaceForRaycasting(surface); // NEW
```

**Step 3: Test**

```typescript
console.time('PROJECTION_GENERATION');
const projection = generateProjection({ surface, projector, projectionConfig });
console.timeEnd('PROJECTION_GENERATION');
```

### How BVH Works

1. **Build phase:** Recursively subdivide mesh into bounding boxes (one-time cost)
2. **Query phase:** For each ray, traverse BVH tree instead of testing all triangles
3. **Result:** Only test triangles in boxes that the ray intersects

**Complexity improvement:**

- **Before:** O(rays × triangles) = 22.4M rays × 20k triangles = 448B operations
- **After:** O(rays × log(triangles)) = 22.4M rays × log₂(20k) ≈ 325M operations
- **Speedup:** ~1,380x in theory, 2-10x in practice (due to BVH traversal overhead)

### BVH Split Strategies

```typescript
// Default (CENTER) - fast build, good queries
mesh.geometry.computeBoundsTree();

// SAH (Surface Area Heuristic) - slower build, best queries
mesh.geometry.computeBoundsTree({ strategy: SAH });
```

**Recommendation:** Use default CENTER strategy - build time is negligible vs 15s savings.

## Additional Optimization: Simplified Collision Mesh

### Concept

Use low-poly mesh for ray tests, high-poly for rendering.

```typescript
// Create simplified collision mesh
const collisionGeometry = new SphereGeometry(radius, 32, 32); // 2k triangles
const renderGeometry = new SphereGeometry(radius, 100, 100); // 20k triangles

const collisionMesh = new Mesh(collisionGeometry, material);
collisionMesh.visible = false; // Don't render
collisionMesh.geometry.computeBoundsTree();
collisionMesh.raycast = acceleratedRaycast;

// Use collisionMesh for raycasting, renderMesh for display
```

**Expected impact:** Additional 2-3x speedup (multiplicative with BVH)

**Total potential:** 10-15x speedup with BVH + simplified collision

## WebGPU Analysis

### Current Status

- **Three.js support:** Yes, via `WebGPURenderer` (v0.168.0+)
- **Browser support:** Chrome 113+, Edge 113+, Safari 18+ (only ~30% of users)
- **Ray tracing API:** None - would require custom compute shaders

### Compute Shader Approach

Theoretically could implement parallel ray-triangle tests:

```wgsl
@compute @workgroup_size(256)
fn rayTriangleIntersect(...) {
  let ray_id = global_invocation_id.x;
  if (ray_id >= num_rays) { return; }

  // Test this ray against all triangles
  // Still O(n) without acceleration structure
}
```

**Challenges:**

1. **No built-in BVH on GPU** - would need to implement manually in shader
2. **Data transfer overhead** - CPU → GPU → CPU for 22.4M rays + mesh data
3. **Shader complexity** - ray-triangle math + BVH traversal in WGSL
4. **Browser support** - only 30% of users

### Verdict on WebGPU

**Not recommended for current timeline:**

- Implementation: 3-5 weeks
- Browser support: Limited
- Uncertain performance gain vs CPU BVH
- Fallback still required for compatibility

**Revisit in 2026+** when browser support improves.

## GPU Compute (THREE.GPUComputationRenderer)

### Available Features

Three.js has legacy `GPUComputationRenderer` and newer TSL compute nodes.

### Limitations

- Still O(rays × triangles) without acceleration structure
- Would need manual BVH implementation in shader
- Data transfer overhead for large datasets

### Verdict

**Not worth the complexity** compared to CPU BVH for current triangle counts.

## Performance Comparison Table

| Approach                  | Speedup | Effort    | Browser Support | Status           |
| ------------------------- | ------- | --------- | --------------- | ---------------- |
| **three-mesh-bvh**        | 5-7x    | 2-4 hours | 100% (pure JS)  | ✅ **DO NOW**    |
| Simplified collision mesh | +2-3x   | 1-2 hours | 100%            | ✅ After BVH     |
| WebGPU ray tracing        | Unknown | 3-5 weeks | 30%             | ❌ Not practical |
| GPU compute shaders       | 1-2x?   | 2-3 weeks | Varies          | ❌ Overkill      |
| WASM (Rust)               | 10-18x  | 4-8 weeks | 100%            | 🟡 Long-term     |

## Recommended Implementation Sequence

### Phase 1: BVH Acceleration (Today - 2 hours)

1. Install `three-mesh-bvh`
2. Add BVH computation to surface generation
3. Test with doubly truncated icosahedron
4. **Expected result:** 15s → 2-4s

### Phase 2: Validate and Profile (1 hour)

1. Add performance timing logs
2. Verify memory usage is acceptable
3. Test across different polyhedra configurations
4. **Decision point:** If still too slow, proceed to Phase 3

### Phase 3: Simplified Collision Mesh (1-2 hours)

1. Create low-poly collision geometry
2. Use for raycasting only
3. Keep high-poly for rendering
4. **Expected result:** 2-4s → 1-1.5s (10-15x total improvement)

### Phase 4: Long-term (If still needed)

- Consider WASM implementation for ultimate performance
- WebGPU when browser support improves

## Integration Points

**Files to modify:**

1. `src/lib/projection-geometry/generate-projection.ts` (main change)
   - Add BVH computation after surface generation
   - Lines ~400-410 (after `generateSurface()`)

2. `package.json`
   - Add `three-mesh-bvh` dependency

**No changes required to:**

- Worker orchestration
- Store logic
- UI components
- Existing raycasting calls (drop-in replacement)

## Risk Assessment

### BVH Implementation

**Risks:** Very Low

- Well-tested library (1.7k+ GitHub stars)
- Drop-in replacement for existing Three.js raycasting
- No breaking changes to API
- Fallback is current behavior

**Validation:**

- Test with all existing polyhedra configurations
- Verify memory usage stays under browser limits
- Check for visual differences (should be none)

## Expected Results

**Before Optimization:**

- Doubly truncated icosahedron (SR 10): 15+ seconds, crashes
- Simple polyhedra (SR 5): 1-2 seconds
- Memory: 358k Vector3 allocations

**After BVH:**

- Doubly truncated icosahedron (SR 10): 2-4 seconds, stable
- Simple polyhedra (SR 5): 0.2-0.4 seconds
- Memory: +50% for BVH (acceptable trade-off)

**After BVH + Simplified Collision:**

- Doubly truncated icosahedron (SR 10): 1-1.5 seconds, stable
- Simple polyhedra (SR 5): <0.2 seconds
- Memory: Similar to BVH only

## Key Takeaways

1. **Current implementation has no spatial acceleration** - testing every triangle
2. **BVH provides 5-7x speedup** with minimal code changes (2-4 hours)
3. **WebGPU is not production-ready** for this use case
4. **GPU compute is unnecessary** - CPU BVH is faster and simpler
5. **Combined optimizations can achieve 10-15x** total speedup

## Next Steps

1. ✅ **Implement BVH** (highest priority, quick win)
2. ✅ Profile and validate performance improvement
3. 🟡 Add simplified collision mesh if still needed
4. 🟡 Compare with WASM approach for long-term decision

## References

- [three-mesh-bvh GitHub](https://github.com/gkjohnson/three-mesh-bvh)
- [Three.js Raycaster Docs](https://threejs.org/docs/#api/en/core/Raycaster)
- [WebGPU Browser Support](https://caniuse.com/webgpu)
- Agent ID: ac4a1d1 (detailed Three.js optimization exploration)
