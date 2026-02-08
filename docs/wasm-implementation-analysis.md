# WASM Implementation Analysis: Projection Generation

**Status:** Research/Exploration
**Created:** 2026-02-01
**Context:** Performance investigation for doubly truncated icosahedron (15+ second generation, browser crashes)

## Problem Statement

Current JavaScript implementation of projection generation takes 15+ seconds and crashes the browser with complex polyhedra (e.g., doubly truncated icosahedron at sample rate 10). The bottleneck is ray-mesh intersection tests (22.4 million operations) and excessive Vector3 object allocations (358k objects causing GC pressure).

## Performance Bottleneck Analysis

### Computational Complexity

**For doubly truncated icosahedron at sample rate 10:**

```
80 polygons × 7 edges × 10 samples × 2 rays × 2,000 triangles per ray
= 22,400,000 ray-triangle intersection tests
```

**Operation breakdown:**

- Ray tracing: 448 million CPU cycles (~80% of time)
- Vector transformations: 1.68 billion operations (~15% of time)
- Band generation + facet matching: 300 million cycles (~5% of time)

**Memory pressure:**

- 358,400 Vector3 object allocations per generation
- Each Vector3: ~48 bytes (3 floats + property overhead)
- Total: ~17.2 MB per generation
- Causes GC pauses every 5-7 seconds (100-300ms each)
- Eventually exceeds heap limit (~1.5 GB) → crash

### Why It Takes 15+ Seconds (vs estimated 30-50ms)

1. **V8 JIT compilation overhead**
2. **Multiple full GC pauses** (100-300ms each)
3. **Worker thread context switching**
4. **No yield points** = browser freeze
5. **Raycaster.intersectObject() internal overhead** beyond raw ray-triangle math

## WASM Solution Overview

### Target Performance: 10-18x Speedup

**Current:** 8-15 seconds
**Target:** <1 second

### Optimization Targets

#### Priority 1: Ray-Mesh Intersection (80% of time)

**Current bottleneck:**

```typescript
edgeRaycaster.intersectObject(surface, true); // 22.4M calls
```

**Rust/WASM opportunity:**

- Custom BVH-accelerated ray tracing with SIMD
- Stack-allocated ray/vector structs
- Potential speedup: **5-10x** (448M cycles → 45-90M cycles)

#### Priority 2: Vector3 Transformations (15% of time)

**Current bottleneck:**

```typescript
int.edge.clone().addScaledVector(...).addScaledVector(...)  // 358k allocations
```

**Rust/WASM opportunity:**

- Stack-allocated vectors (no GC)
- SIMD batch processing for vector operations
- Potential speedup: **3-5x**

#### Priority 3: Facet Matching (5% of time)

**Current bottleneck:**

```typescript
getEdgeMatchedTriangles(f0.triangle, f1.triangle); // O(n²) comparisons
```

**Rust/WASM opportunity:**

- Parallel triangle comparison
- Hash-based facet lookup instead of linear iteration
- Potential speedup: **2-3x**

## Architecture Considerations

### Data Flow

```
JavaScript (UI/State)
    ↓ (serialize config + surface mesh)
WASM Module (Rust)
    ↓ Ray tracing + vector math
    ↓ (serialize result)
JavaScript (rehydrate Three.js objects)
    ↓ Rendering pipeline
```

### Key Challenges

1. **Serialization overhead:** Surface mesh (2,000-20,000 triangles) must be sent to WASM
2. **Three.js integration:** WASM output must be rehydrated into Three.js objects
3. **Memory management:** Must carefully manage WASM linear memory
4. **Threading:** Web Workers + WASM threads for parallelism
5. **Build complexity:** Rust toolchain + wasm-pack integration

### Advantages

- **10-18x performance improvement** for complex geometries
- **Eliminates GC pressure** from Vector3 allocations
- **Better memory efficiency** with stack allocation
- **Potential for SIMD** vectorization
- **No server infrastructure** required (runs in browser)

### Disadvantages

- **Significant implementation effort** (~4-8 weeks for full implementation)
- **Increased build complexity** (Rust toolchain, wasm-pack)
- **Serialization overhead** for large meshes
- **Debugging complexity** (harder than JavaScript)
- **Binary size increase** (~500KB-2MB for WASM module)

## Expected Results

**Before WASM:**

- Doubly truncated icosahedron (SR 10): 15+ seconds, browser crash
- Simple geometries (SR 5): 1-2 seconds
- Memory: 358k Vector3 allocations per generation

**After WASM:**

- Doubly truncated icosahedron (SR 10): <1 second, stable
- Simple geometries (SR 5): <0.1 second
- Memory: Minimal JS allocations (WASM handles vectors)

## Implementation Roadmap (High-Level)

### Phase 1: Proof of Concept (1-2 weeks)

- Basic ray-triangle intersection in Rust
- WASM compilation and JS integration
- Performance benchmark vs JavaScript

### Phase 2: Core Ray Tracing (2-3 weeks)

- BVH acceleration structure
- Full projection generation algorithm
- Parallel ray casting

### Phase 3: Integration (1-2 weeks)

- Worker integration
- Three.js object rehydration
- Error handling and fallbacks

### Phase 4: Optimization (1 week)

- SIMD vectorization
- Memory layout optimization
- Threading tuning

## Alternative Approaches Considered

### Backend Service (Go/Rust)

- **Pros:** Could use multiple CPU cores, more powerful machines
- **Cons:** Network latency, server infrastructure, deployment complexity
- **Verdict:** Less practical than WASM for this use case

### JavaScript Optimizations Only

- **Pros:** No new toolchain, easier to maintain
- **Cons:** Limited by V8 performance, GC pressure unavoidable
- **Verdict:** Can provide 2-3x improvement, but not enough for complex geometries

### WebGPU Compute Shaders

- **Pros:** Massive parallelism, GPU acceleration
- **Cons:** Browser support limited, complex shader programming, data transfer overhead
- **Verdict:** Worth exploring as complement to WASM (see separate analysis)

## Critical Files for Reference

- `src/lib/projection-geometry/generate-projection.ts` (1,258 lines) - Main bottleneck
- `src/lib/projection-geometry/models/doubly-truncated-icosohedron.ts` (797 lines) - Complex polyhedra
- `src/lib/workers/super-globule.worker.ts` - Current worker integration point
- `src/lib/stores/workerStore.ts` - Worker orchestration and Three.js rehydration

## Key Findings Summary

| Finding                                            | Impact                 | Severity |
| -------------------------------------------------- | ---------------------- | -------- |
| 22.4M ray intersection tests for complex polyhedra | 15+ second delay       | Critical |
| 358k Vector3 allocations causing GC storms         | Memory exhaustion      | Critical |
| O(n²) facet matching in matchTubeEnds              | Quadratic scaling      | High     |
| No spatial caching between ray tests               | Redundant calculations | High     |
| Synchronous execution blocking worker              | No parallelism         | Medium   |
| Sample rate scaling: SR 10 = ~8x time vs SR 5      | Exponential growth     | High     |

## Next Steps

1. **Investigate Three.js/WebGPU optimizations** - May provide quick wins without WASM
2. **Create detailed WASM implementation plan** - If pursuing this approach
3. **Proof of concept** - Small Rust module for ray tracing benchmark
4. **Compare all approaches** - WASM vs WebGPU vs JavaScript optimization vs Backend

## Notes

- Analysis based on doubly truncated icosahedron with sample rate 10
- Agent ID: a420694 (detailed exploration of bottleneck)
- Related work: Mode-based compartmentalization (feature/compartmentalize branch)
- User reported actual 15+ second generation times, invalidating initial 30-50ms estimate
