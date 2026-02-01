# Saved Implementation Plans

This file tracks all implementation plans for the Shades project.

## How to Use

When you ask Claude to "list my saved plans", this file will be referenced. Each plan below links to a detailed markdown document.

## Active Plans

### 1. Manual Computation Mode
**File:** [manual-computation-mode-plan.md](./manual-computation-mode-plan.md)
**Status:** Planned (Not Started)
**Priority:** Medium
**Created:** 2026-02-01
**Estimated Time:** 2.5 hours
**Expected Impact:** User control over when regeneration happens

**Summary:** Add "manual" computation mode that prevents auto-updates when configs change. Users must explicitly click "Regenerate" button to apply changes. Works alongside existing modes (continuous, 3d-only, 2d-only).

**Key Features:**
- Manual mode toggle (checkbox)
- Regenerate button in NavBar (next to Edit)
- Pending changes indicator
- Respects computation mode (3d-only, 2d-only, etc.)

**Use Cases:**
- Batch multiple config changes before regenerating
- Prevent lag from auto-updates during rapid config adjustments
- Save CPU/battery when experimenting with configs

---

### 2. Quick Win: BVH Ray Tracing Acceleration
**File:** [threejs-optimization-analysis.md](./threejs-optimization-analysis.md)
**Status:** Ready to Implement
**Priority:** Critical (blocks complex geometries)
**Created:** 2026-02-01
**Estimated Time:** 2-4 hours
**Expected Impact:** 5-7x speedup (15 seconds → 2-4 seconds), up to 10-15x with collision mesh optimization

**Summary:** Add `three-mesh-bvh` library for spatial acceleration of ray-mesh intersection tests. Current implementation has no BVH, testing every triangle (O(n) per ray). Drop-in replacement for existing raycasting.

**Key Changes:**
- Install `three-mesh-bvh` package
- Add BVH computation to surface generation (one function)
- Optional: simplified collision mesh for additional 2-3x speedup

**Why This First:**
- Addresses actual bottleneck (22.4M ray tests)
- Quick implementation (2-4 hours vs 4-8 weeks for WASM)
- 100% browser support (pure JavaScript)
- No changes to core logic

---

### 3. Performance Optimization: Pattern Generation Caching
**File:** [performance-optimization-plan.md](./performance-optimization-plan.md)
**Status:** Planned (Lower Priority)
**Priority:** Medium
**Created:** 2026-02-01
**Estimated Time:** 4 hours
**Expected Impact:** 50% reduction in pattern generation time (200ms → 80-100ms)

**Summary:** Cache flattened 2D bands to avoid redundant 3D→2D conversion on every pattern config change. Remove unnecessary `structuredClone()` calls (~3,000 per update).

**Key Changes:**
- Add `flattenedBandsStore` derived store
- Separate geometry-dependent flattening from config-dependent pattern mapping
- Optimize clone operations in pattern generation

**Note:** Pattern generation (200ms) is minor compared to ray tracing bottleneck (15s). Implement BVH first.

---

## Completed Plans

### ✅ 3D Rendering Performance Optimizations
**File:** [threejs-optimization-analysis.md](./threejs-optimization-analysis.md)
**Status:** Completed
**Priority:** Critical
**Completed:** 2026-02-01
**Actual Time:** 3 hours
**Actual Impact:** 10-18x performance improvement for complex geometries

**Summary:** Implemented BVH ray tracing acceleration, material optimization, and camera interaction LOD to eliminate lag when viewing/rotating complex polyhedra.

**Delivered:**
- BVH acceleration: 15+ seconds → 2-4 seconds generation time
- Material swap: 5-8% faster rendering (MeshStandard for non-selected)
- Camera LOD: Smooth 60fps rotation (hide facets during interaction)

**Commit:** 0896b14

---

## On Hold / Future Plans

### 4. WASM Implementation: Projection Generation Rewrite
**File:** [wasm-implementation-analysis.md](./wasm-implementation-analysis.md)
**Status:** Research/Exploration
**Priority:** High (for complex geometries)
**Created:** 2026-02-01
**Expected Impact:** 10-18x speedup (15 seconds → <1 second) for complex polyhedra

**Summary:** Rewrite projection generation ray tracing in Rust compiled to WASM. Eliminates GC pressure from 358k Vector3 allocations and leverages SIMD for vector operations.

**Key Benefits:**
- Stack-allocated vectors (no GC)
- Custom BVH ray tracing
- SIMD batch operations
- <1 second for doubly truncated icosahedron at sample rate 10

**Trade-offs:**
- 4-8 weeks implementation effort
- Increased build complexity (Rust toolchain)
- ~500KB-2MB binary size increase

---

## Plan Template

When creating new plans, use this structure:

```markdown
### [Number]. [Plan Title]
**File:** [plan-filename.md](./plan-filename.md)
**Status:** [Planned | In Progress | Completed | On Hold]
**Priority:** [High | Medium | Low]
**Created:** YYYY-MM-DD
**Estimated Time:** X hours
**Expected Impact:** [Brief description of expected results]

**Summary:** [1-2 sentence overview]

**Key Changes:**
- [Bullet point 1]
- [Bullet point 2]
```

---

## How to Add a New Plan

1. Create detailed plan in `docs/[descriptive-name]-plan.md`
2. Add entry to this index file under "Active Plans"
3. Include status, priority, and expected impact
4. Commit both files to git

## How to Update Plan Status

1. Change status in this index
2. Update status at top of detailed plan file
3. Move to appropriate section (Active/Completed/On Hold)
4. Add completion date if applicable
