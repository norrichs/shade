# Performance Optimization Plan: Pattern Generation Caching

**Status:** Planned (Not Started)
**Created:** 2026-02-01
**Estimated Time:** 4 hours
**Expected Improvement:** 200ms → 80-100ms (50% reduction)

## Problem Statement

Pattern generation in 2D-only mode takes 200ms with complex geometries (100+ facets), causing UI lag when adjusting pattern configurations. The bottleneck is that expensive 3D→2D flattening (~30ms) runs on every pattern config change, even though flattening only depends on geometry (which is frozen in 2D-only mode).

## Solution Overview

**Two-Phase Optimization:**

1. **Cache Flattened Bands** - Separate flattening (geometry-dependent) from pattern mapping (config-dependent)
2. **Remove structuredClone Calls** - Eliminate ~3,000 unnecessary deep clones (~50-100ms overhead)

## Phase 1: Cache Flattened Bands (2 hours)

### Architecture Change

**Current Flow:**

```
superGlobuleStore (3D geometry)
    ↓
superGlobulePatternStore
    ↓ [generates on EVERY pattern config change]
getFlatStripV2() [~30ms] + Pattern Mapping [~170ms]
```

**Optimized Flow:**

```
superGlobuleStore (3D geometry)
    ↓
flattenedBandsStore (NEW - caches flattened 2D bands)
    ↓ [only updates on geometry change]
superGlobulePatternStore
    ↓ [uses cached flat bands]
Pattern Mapping [~100ms - reduced by removing clones]
```

### Implementation Steps

#### Step 1: Add Types (10 min)

**File:** `src/lib/types.ts` (around line 440)

```typescript
export type FlattenedBandsCache = {
	superGlobuleConfigId: Id;
	projectionTubes: FlattenedTube[];
	globuleTubes: FlattenedTube[];
};

export type FlattenedTube = {
	address: GlobuleAddress_Tube;
	bands: Band[]; // Already flattened to 2D
};
```

**Risk:** Very Low - just type definitions

#### Step 2: Create Cache Store (20 min)

**File:** `src/lib/stores/superGlobuleStores.ts` (insert after line 266)

```typescript
/**
 * Caches flattened 2D bands from 3D geometry
 * ONLY depends on superGlobuleStore (geometry), NOT patternConfigStore
 * Provides pre-flattened bands to pattern generation to avoid redundant flattening
 */
export const flattenedBandsStore = derived(
	superGlobuleStore,
	($superGlobuleStore): FlattenedBandsCache => {
		console.time('FLATTEN_BANDS_CACHE');

		const pixelScale = { value: 1, unit: 'cm' as const };

		// Flatten projection tubes
		const projectionTubes: FlattenedTube[] =
			$superGlobuleStore.projections[0]?.tubes.map((tube, tubeIdx) => ({
				address: tube.address,
				bands: tube.bands.map((band) =>
					getFlatStripV2(band, { bandStyle: 'helical-right', pixelScale })
				)
			})) || [];

		// Flatten globule tubes (if any)
		const globuleTubes: FlattenedTube[] =
			$superGlobuleStore.globuleTubes?.map((tube, tubeIdx) => ({
				address: tube.address,
				bands: tube.bands.map((band) =>
					getFlatStripV2(band, { bandStyle: 'helical-right', pixelScale })
				)
			})) || [];

		console.timeEnd('FLATTEN_BANDS_CACHE');

		return {
			superGlobuleConfigId: $superGlobuleStore.superGlobuleConfigId,
			projectionTubes,
			globuleTubes
		};
	}
);
```

**Dependencies:** ONLY `superGlobuleStore` - no pattern config
**Risk:** Medium - new derived store, test in isolation first

#### Step 3: Add New Pattern Functions (30 min)

**File:** `src/lib/cut-pattern/generate-pattern.ts` (around line 111)

Add `generateProjectionPatternFromFlatBands()` - mirrors existing `generateProjectionPattern()` but consumes pre-flattened bands.

**File:** `src/lib/cut-pattern/generate-tiled-pattern.ts` (after line 67)

Add `generateTubeCutPatternFromFlatBands()` - skips flattening step since bands are already flat.

**Key difference:** Skip `getFlatStripV2()` call, go straight to `getQuadrilaterals()`.

**Risk:** Low - new functions don't affect existing code paths

#### Step 4: Connect Cache to Pattern Store (15 min)

**File:** `src/lib/stores/superGlobuleStores.ts` (lines 270-271)

**Change dependencies:**

```typescript
// OLD:
[
	superGlobuleStore,
	superConfigStore,
	patternConfigStore,
	overrideStore,
	computationMode,
	pausePatternUpdates
][
	// NEW:
	(flattenedBandsStore,
	superConfigStore,
	patternConfigStore,
	overrideStore,
	computationMode,
	pausePatternUpdates)
];
```

**Change function call:**

```typescript
// OLD:
generateProjectionPattern(projection.tubes, $superConfigStore.id, $patternConfigStore);

// NEW:
generateProjectionPatternFromFlatBands(
	$flattenedBandsCache.projectionTubes,
	$superConfigStore.id,
	$patternConfigStore
);
```

**Risk:** High - affects entire pattern pipeline, test thoroughly

## Phase 2: Remove structuredClone (2 hours)

### Analysis of Clone Usage

**Safe to Remove (read-only access):**

- `generate-tiled-pattern.ts:219` - Quad cloning for pattern mapping
- `tiled-hex-pattern.ts:147, 150, 166, 186` - Pattern transformation calls
- `tiled-tristar-pattern.ts:170, 182, 242-244` - Pattern adjustment calls

**Need Shallow Clone:**

- `tiled-shield-tesselation-pattern.ts:330, 343, 354` - Band/path mutation
- Pattern files where `adjustAfterTiling` mutates arrays

### Implementation Steps

#### Step 5: Safe Removals (30 min)

**File:** `src/lib/cut-pattern/generate-tiled-pattern.ts` (line 219)

```typescript
// CURRENT:
const quad = structuredClone(quadBand[facetIndex % quadBand.length]);

// CHANGE TO:
const quad = quadBand[facetIndex % quadBand.length];
```

**Reasoning:** `transformPatternByQuad()` doesn't mutate input, creates new PathSegments

**Files:** `tiled-hex-pattern.ts`, `tiled-tristar-pattern.ts`, `tiled-carnation-pattern.ts`

Similar pattern - remove clones before `translatePS()` and `rotatePS()` calls since these functions create new arrays internally.

**Risk:** Low - verified functions create new objects

#### Step 6: Targeted Shallow Cloning (45 min)

**File:** `tiled-shield-tesselation-pattern.ts` (line 330)

```typescript
// CURRENT:
const newBands = structuredClone(bands);

// CHANGE TO (only clone what's mutated):
const newBands = bands.map((band) => ({
	...band,
	facets: band.facets.map((facet) => ({
		...facet,
		path: [...facet.path] // Only clone the path array being mutated
	}))
}));
```

**Risk:** Medium - need to verify mutations don't affect original

## Testing Strategy

### Performance Tests

1. **Measure baseline:** Record current pattern generation times
   - Simple geometry (20 facets): ~50ms
   - Medium geometry (50 facets): ~120ms
   - Complex geometry (100+ facets): ~200ms

2. **After Phase 1:** Verify caching works
   - Cache generation on geometry change: ~30-40ms (acceptable)
   - Pattern generation with cache: target 100-120ms
   - Verify cache only updates on geometry change (not pattern config)

3. **After Phase 2:** Verify clone removal
   - Pattern generation: target 80-100ms
   - Check no performance regression

### Functional Tests

1. **Pattern rendering:** All 7 pattern types render correctly
   - hex, grid, box, carnation, pinwheel, shield, tristar

2. **Pattern continuity:** Adjacent patterns align properly
   - Within same band
   - Between bands in same tube
   - Between tubes (for projections)

3. **Pattern adjustment:** `adjustAfterTiling` functions work
   - Shield tessellation
   - Hex pattern
   - Tristar pattern

4. **Edge cases:**
   - Panel patterns (not cut patterns)
   - Empty projections
   - Single facet bands

### Regression Tests

1. Existing sandbox routes still work
2. Selection and interaction still work
3. Pattern configuration changes apply correctly
4. Mode switching (3d-only, 2d-only, continuous) works

## Rollback Plan

### If Patterns Render Incorrectly

1. Restore original store dependencies (revert lines 270-271 in superGlobuleStores.ts)
2. Remove flattenedBandsStore usage
3. Keep new functions but mark as unused
4. Investigate which pattern type failed
5. Restore structuredClone for that specific pattern type

### If Performance Doesn't Improve

1. Check if cache is being used (add logging)
2. Verify getFlatStripV2 is only called once per geometry change
3. Profile to identify remaining bottlenecks
4. Consider incremental caching (per-tube vs all-tubes)

### If Memory Issues Occur

1. Monitor cache size with performance.memory API
2. Add cache eviction strategy
3. Consider weak references for cached data
4. Profile with Chrome DevTools Memory profiler

## Expected Results

**Before Optimization:**

- Total: ~200ms
- Flattening: ~30ms × N pattern config changes (wasted)
- Pattern Mapping: ~170ms
- structuredClone overhead: ~50-100ms

**After Optimization:**

- Total: ~80-100ms (50% reduction)
- Flattening: ~30ms (only on geometry change, cached)
- Pattern Mapping: ~70-90ms (reduced by removing clones)
- structuredClone overhead: ~0-10ms (only where needed)

**Key Wins:**

1. 50% reduction in pattern generation time
2. Eliminated redundant flattening on pattern config changes
3. Reduced memory allocation from unnecessary deep clones
4. Better separation of concerns (geometry vs pattern config)

## Critical Files

1. `src/lib/stores/superGlobuleStores.ts` (lines 240-360)
   - **Risk:** High - core store architecture
   - **Changes:** ~50 lines added, ~10 lines modified

2. `src/lib/cut-pattern/generate-pattern.ts` (lines 111-180)
   - **Risk:** Medium - new code path
   - **Changes:** ~80 lines added

3. `src/lib/cut-pattern/generate-tiled-pattern.ts` (lines 35-67, 219)
   - **Risk:** Low-Medium
   - **Changes:** 1 line removed, ~40 lines added

4. `src/lib/patterns/tiled-hex-pattern.ts` (lines 124-267)
   - **Risk:** Medium
   - **Changes:** 5-10 lines modified

5. `src/lib/types.ts` (around line 440)
   - **Risk:** Very Low
   - **Changes:** ~10 lines added

## Implementation Sequence

**Total Time: 4 hours**

1. ✅ Add types (10 min) - Low risk
2. ✅ Create cache store (20 min) - Test in isolation
3. ✅ Add new pattern functions (30 min) - Test before connecting
4. ⚠️ Connect cache to pattern store (15 min) - Test thoroughly
5. ✅ Remove clones - safe removals (30 min) - Verify per file
6. ⚠️ Remove clones - targeted replacements (45 min) - Test continuity
7. ✅ Add performance instrumentation (15 min) - Track improvements
8. ⚠️ Comprehensive testing (60 min) - All patterns + edge cases
9. ✅ Documentation (20 min) - Low risk

## Questions & Considerations

1. **Memory trade-off:** Cache adds ~40MB memory but saves 100ms per pattern change - acceptable?
2. **Testing scope:** Test all 7 pattern types or prioritize most-used?
3. **Incremental rollout:** Test with one pattern type first?
4. **Cache invalidation:** Current approach invalidates on any geometry change - sufficient?

## Notes

- Plan created: 2026-02-01
- Agent ID: a0413e3 (for reference)
- Related work: Mode-based compartmentalization (feature/compartmentalize branch)
