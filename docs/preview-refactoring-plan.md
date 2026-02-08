# Preview System Implementation - Code Reuse Focused

## Core Principle

**Reuse existing algorithms, don't duplicate them.**

Instead of creating parallel "preview" functions, we:

1. Extract minimal data structures from config
2. Pass them to existing functions
3. Refactor existing functions only when necessary to accept both config and generated geometry

---

## Implementation Approach

### Strategy 1: Generate Minimal Geometry from Config

Create a `Polygon` object directly from config, then pass to existing `flattenPolygon()`.

**Key Insight:** `flattenPolygon()` doesn't care WHERE the polygon came from - it just needs:

```typescript
{
	edges: Array<{
		edgePoints: Vector3[];
		curvePoints: Vector3[];
	}>;
}
```

### Strategy 2: Extract Path Generation Logic

Cross-section path generation is currently embedded in full generation. Extract it into a standalone function that works with just curve config.

---

## Detailed Changes

### 1. New File: `src/lib/projection-geometry/preview-utils.ts`

This file contains ONLY the minimal glue code to convert config → minimal geometry structures.

```typescript
import { Vector3 } from 'three';
import type {
	PolygonConfig,
	EdgeConfig,
	EdgeCurveConfig,
	CrossSectionConfig,
	TransformConfig,
	Point3,
	Polygon,
	Edge
} from './types';
import {
	getPoints, // Already exists - line 402
	getMatrix4, // Check if exists
	getVector3 // Check if exists
} from './generate-projection';

/**
 * Generates a Polygon object from config (without full 3D generation).
 *
 * This produces the minimal structure needed by flattenPolygon() by:
 * 1. Sampling edge curves to get curve points
 * 2. Creating straight line edge points between vertices
 * 3. Wrapping in Polygon/Edge structure
 *
 * REUSES: getPoints() from generate-projection.ts
 * CALLS: flattenPolygon() from path-editor.ts (caller's responsibility)
 */
export function generatePolygonFromConfig(
	polygonConfig: PolygonConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig>,
	transformConfig: TransformConfig
): Polygon {
	const transformMatrix = getMatrix4(transformConfig);

	const edges: Edge[] = polygonConfig.edges.map((edgeConfig) => {
		const { vertex0, vertex1, widthCurve } = edgeConfig;
		const { divisions } = widthCurve.sampleMethod;

		// Apply transform to vertices
		const [v0, v1] = getVector3([vertex0, vertex1]) as Vector3[];
		v0.applyMatrix4(transformMatrix);
		v1.applyMatrix4(transformMatrix);

		// Generate edge points (straight line)
		const edgePoints: Vector3[] = [];
		for (let i = 0; i <= divisions; i++) {
			edgePoints.push(v0.clone().lerp(v1, i / divisions));
		}

		// Generate curve points (sample bezier) - REUSES getPoints()
		const definitionPoints = getPoints(widthCurve.curves, widthCurve.sampleMethod);

		// Convert 2D curve points to 3D in triangle (v0, v1, center)
		// For preview, center can be a simple midpoint
		const center = v0.clone().add(v1).multiplyScalar(0.5);
		const curvePoints = definitionPoints.map((point) => {
			// Map 2D point (x, y) to 3D triangle
			// This is simplified - full logic is in mapPointsToTriangle()
			const pointOnLeg0 = v0.clone().lerp(center, point.x);
			const pointOnLeg1 = v1.clone().lerp(center, point.x);
			return pointOnLeg0.lerp(pointOnLeg1, point.y);
		});

		return {
			config: edgeConfig,
			edgePoints,
			curvePoints
		};
	});

	return { edges };
}

/**
 * Generates SVG path string for cross-section preview.
 *
 * REUSES: getPoints() from generate-projection.ts
 * EXTRACTS: Path string generation logic (currently in getCrossSectionPath)
 */
export function generateCrossSectionPath(crossSectionConfig: CrossSectionConfig): string {
	// Sample the curve - REUSES getPoints()
	const points = getPoints(crossSectionConfig.curves, crossSectionConfig.sampleMethod);

	// Apply scaling
	const { width, height } = crossSectionConfig.scaling;
	const xScale = typeof width === 'number' ? width : 50;
	const yScale = typeof height === 'number' ? height : xScale;

	// Convert to SVG path
	if (points.length === 0) return '';

	const scaledPoints = points.map((p) => ({
		x: p.x * xScale,
		y: p.y * yScale
	}));

	// Center based on config
	const centerOffset = crossSectionConfig.center || { x: 0, y: 0 };
	const pathString = scaledPoints.reduce((path, p, i) => {
		const x = p.x - centerOffset.x;
		const y = p.y - centerOffset.y;
		return i === 0 ? `M ${x} ${y}` : `${path} L ${x} ${y}`;
	}, '');

	return `${pathString} Z`;
}
```

**Key Points:**

- ✅ `getPoints()` is reused (not duplicated)
- ✅ Result can be passed to `flattenPolygon()` directly
- ✅ Cross-section uses same bezier sampling
- ⚠️ Simplified triangle mapping (full version in `mapPointsToTriangle()` if needed)

---

### 2. Refactor `path-editor.ts` (if needed)

Currently `flattenPolygon()` is already pure - it just takes a `Polygon` and returns `FlattenedPolygon`. No changes needed here!

**Analysis:**

```typescript
export const flattenPolygon = (polygon: Polygon): FlattenedPolygon => {
	// Works with ANY Polygon, doesn't care if it came from worker or config
};
```

✅ No refactoring needed - already reusable!

---

### 3. Refactor `generate-projection.ts` (extract utilities)

Check if these helper functions are already exported:

- `getMatrix4()` - for transform application
- `getVector3()` - for vertex conversion
- `mapPointsToTriangle()` - for curve point mapping

If not exported, add exports:

```typescript
// Around line 301-332 area
export const getMatrix4 = (transformConfig: TransformConfig): Matrix4 => {
  // ... existing implementation
};

export const getVector3 = (points: Point3[]): Vector3[] => {
  // ... existing implementation
};

// mapPointsToTriangle is already at line 364, check if exported
export const mapPointsToTriangle = /* ... existing ... */
```

**Action:** Find these functions and ensure they're exported.

---

### 4. Update `EdgeCurve.svelte`

Replace dependency on `$superGlobuleStore` with config-based generation:

```typescript
// Add imports
import { flattenPolygon, getPolygonPaths } from './path-editor';
import { generatePolygonFromConfig } from '$lib/projection-geometry/preview-utils';
import { preparePolygonConfig } from '$lib/projection-geometry/generate-projection';

// BEFORE (lines 69-72):
$: flattenedPolygon = flattenPolygon(
	$superGlobuleStore.projections[0].polyhedron.polygons[polygonIndex]
);
$: polygonPaths = getPolygonPaths(flattenedPolygon);

// AFTER:
$: previewPolygon = (() => {
	const projectionConfig = $superConfigStore.projectionConfigs[0];
	if (!projectionConfig) return null;

	const rawPolygonConfig = projectionConfig.projectorConfig.polyhedron.polygons[polygonIndex];
	if (!rawPolygonConfig) return null;

	// Prepare config (backfill vertices, edge curves, cross-sections)
	const preparedPolygonConfig = preparePolygonConfig(
		rawPolygonConfig,
		projectionConfig.projectorConfig.polyhedron.vertices,
		projectionConfig.projectorConfig.polyhedron.edgeCurves,
		projectionConfig.projectorConfig.polyhedron.crossSectionCurves
	);

	// Generate minimal Polygon from config
	const polygon = generatePolygonFromConfig(preparedPolygonConfig, projectionConfig.meta.transform);

	// REUSE existing flattenPolygon()
	return flattenPolygon(polygon);
})();

$: polygonPaths = previewPolygon ? getPolygonPaths(previewPolygon) : [];
```

**Code Reuse:**

- ✅ `preparePolygonConfig()` - existing function
- ✅ `flattenPolygon()` - existing function
- ✅ `getPolygonPaths()` - existing function
- ✅ Only NEW code: config → Polygon conversion

---

### 5. Update `CrossSection.svelte`

Replace dependency on `getCrossSectionPath($superGlobuleStore.projections)`:

```typescript
// Add import
import { generateCrossSectionPath } from '$lib/projection-geometry/preview-utils';

// BEFORE (lines 65-69):
$: crossSectionPath = getCrossSectionPath(
	{ globule: 0, tube: 0 },
	$superGlobuleStore.projections,
	sectionIndex
);

// AFTER:
$: crossSectionPath = (() => {
	const projectionConfig = $superConfigStore.projectionConfigs[0];
	if (!projectionConfig) return '';

	// Note: crossSectionIndex from component iteration (line 73)
	const crossSectionConfig =
		projectionConfig.projectorConfig.polyhedron.crossSectionCurves[crossSectionIndex];
	if (!crossSectionConfig) return '';

	// REUSE: getPoints() is called inside generateCrossSectionPath
	return generateCrossSectionPath(crossSectionConfig);
})();
```

**Code Reuse:**

- ✅ `getPoints()` - called internally
- ✅ Only NEW code: path string generation (extracted from `getCrossSectionPath`)

---

### 6. Optional Refactoring: Extract `getCrossSectionPath` Logic

Currently `getCrossSectionPath()` extracts a cross-section from generated tubes. The path generation logic could be extracted:

```typescript
// In generate-projection.ts

// BEFORE (lines 1259-1298):
export const getCrossSectionPath = (
  address: GlobuleAddress_Tube,
  projections: SuperGlobule['projections'],
  sectionIndex?: number
): string => {
  const sections = getSections(address, projections);
  const tube = projections[address.globule].tubes[address.tube];
  // ... extract section vectors ...
  const pathVectors = /* ... compute path vectors ... */;

  // PATH GENERATION LOGIC (lines 1292-1296)
  const path =
    pathVectors.reduce((path, v) => {
      return path + `L ${v.x} ${v.y}`;
    }, `M 0 0`) + `Z`;

  return path;
};

// AFTER - Extract the path string generation:
function vectorsToPathString(vectors: Vector3[]): string {
  if (vectors.length === 0) return '';

  const path = vectors.reduce((path, v, i) => {
    return i === 0 ? `M ${v.x} ${v.y}` : path + ` L ${v.x} ${v.y}`;
  }, '');

  return `${path} Z`;
}

export const getCrossSectionPath = (
  address: GlobuleAddress_Tube,
  projections: SuperGlobule['projections'],
  sectionIndex?: number
): string => {
  const sections = getSections(address, projections);
  const tube = projections[address.globule].tubes[address.tube];
  // ... extract section vectors ...
  const pathVectors = /* ... compute path vectors ... */;

  return vectorsToPathString(pathVectors); // REUSE
};
```

**Then `generateCrossSectionPath()` can also reuse `vectorsToPathString()`.**

This is optional but recommended for consistency.

---

## Code Reuse Summary

| Function                 | Status              | Reused From                |
| ------------------------ | ------------------- | -------------------------- |
| `flattenPolygon()`       | ✅ Direct reuse     | path-editor.ts:78          |
| `getPolygonPaths()`      | ✅ Direct reuse     | path-editor.ts:128         |
| `getPoints()`            | ✅ Direct reuse     | generate-projection.ts:402 |
| `preparePolygonConfig()` | ✅ Direct reuse     | generate-projection.ts:72  |
| `getMatrix4()`           | ⚠️ Check export     | generate-projection.ts     |
| `getVector3()`           | ⚠️ Check export     | generate-projection.ts     |
| `mapPointsToTriangle()`  | ✅ Already exported | generate-projection.ts:364 |

**New Code Needed:**

1. `generatePolygonFromConfig()` - ~40 lines (minimal glue code)
2. `generateCrossSectionPath()` - ~30 lines (path string generation)
3. Component reactive statements - ~20 lines each

**Total New Code: ~110 lines**
**Code Duplication: 0 lines** ✅

---

## Testing Strategy

### Validation Tests

1. **Polygon Preview Accuracy:**

   ```typescript
   // Test that config-based polygon matches generated polygon
   const configPolygon = generatePolygonFromConfig(polygonConfig, transform);
   const generatedPolygon = /* from $superGlobuleStore after worker completes */;

   // Compare edge points and curve points
   expect(configPolygon.edges[0].edgePoints).toApproximatelyEqual(
     generatedPolygon.edges[0].edgePoints
   );
   ```

2. **Flattening Equivalence:**

   ```typescript
   // Test that flattenPolygon produces same output regardless of input source
   const flattenedFromConfig = flattenPolygon(configPolygon);
   const flattenedFromGenerated = flattenPolygon(generatedPolygon);

   expect(flattenedFromConfig).toApproximatelyEqual(flattenedFromGenerated);
   ```

3. **Cross-Section Path:**

   ```typescript
   // Test that preview path is valid SVG
   const path = generateCrossSectionPath(crossSectionConfig);
   expect(path).toMatch(/^M .+ L .+ Z$/);

   // Test that scaling is applied correctly
   const scaledConfig = { ...crossSectionConfig, scaling: { width: 100, height: 200 } };
   const scaledPath = generateCrossSectionPath(scaledConfig);
   // Verify path coordinates reflect scaling
   ```

---

## Implementation Checklist

- [ ] Check which helper functions in `generate-projection.ts` need to be exported
  - [ ] `getMatrix4()`
  - [ ] `getVector3()`
  - [ ] Confirm `mapPointsToTriangle()` is exported

- [ ] Create `preview-utils.ts`:
  - [ ] `generatePolygonFromConfig()`
  - [ ] `generateCrossSectionPath()`
  - [ ] Import and reuse existing functions

- [ ] Update `EdgeCurve.svelte`:
  - [ ] Replace `$superGlobuleStore` dependency
  - [ ] Add reactive statement using `generatePolygonFromConfig()`
  - [ ] Call `flattenPolygon()` on result
  - [ ] Test immediate preview updates

- [ ] Update `CrossSection.svelte`:
  - [ ] Replace `getCrossSectionPath()` call
  - [ ] Add reactive statement using `generateCrossSectionPath()`
  - [ ] Test immediate preview updates

- [ ] Write unit tests:
  - [ ] Polygon generation accuracy
  - [ ] Flattening equivalence
  - [ ] Cross-section path validity

- [ ] Integration testing:
  - [ ] Verify previews update instantly in manual mode
  - [ ] Verify previews match eventual 3D results
  - [ ] Test edge cases (missing configs, invalid indices)

- [ ] Documentation:
  - [ ] Add code comments explaining reuse strategy
  - [ ] Update CLAUDE.md with preview system explanation

---

## Expected Outcome

**Before:** Editing curves → config update → worker regeneration (2-4 seconds) → preview updates

**After:** Editing curves → config update → instant preview (1-5ms) → eventual worker regeneration (when user clicks Regenerate)

**Code Quality:**

- ✅ Zero duplication of flattening algorithm
- ✅ Zero duplication of bezier sampling
- ✅ Minimal new code (~110 lines)
- ✅ All new code is glue/conversion, not algorithm duplication
