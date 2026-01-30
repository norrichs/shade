# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Shades** is a 3D parametric design tool for creating complex geometric structures ("globules") and generating 2D cut patterns for manufacturing. Built with SvelteKit, Three.js, and TypeScript.

**Stack:** SvelteKit + Three.js (via Threlte) + TypeScript + Turso (SQLite) + Drizzle ORM, deployed on Vercel.

## Development Commands

### Core Workflow
```bash
npm run dev              # Start dev server
npm run check            # TypeScript + Svelte type checking
npm run format           # Auto-format with Prettier
npm run lint             # ESLint
npm run build            # Production build
npm run preview          # Preview production build
```

### Testing
```bash
npm run test:unit                # Jest unit tests
npm run test:unit:watch          # Jest watch mode
npm run test:unit:coverage       # Coverage report
npm test                         # Playwright E2E tests
```

### Database
```bash
npm run drizzle:generate         # Generate migration from schema
npm run drizzle:migrate          # Apply migrations
npm run drizzle:studio           # Open Drizzle Studio GUI
```

Environment variables: `VITE_TURSO_DB_URL` and `VITE_TURSO_DB_AUTH_TOKEN` in `.env`

## Architecture

### Manufacturing Purpose

**Shades generates SVG files for manufacturing** - cutting paper, wood, or welding metal. The core output is production-ready 2D patterns derived from 3D parametric geometry.

#### Output Types

1. **Cut Patterns** - For cutting paper
   - Use full bands (strips of connected facets)
   - Apply pattern definitions to quadrilaterals (pairs of adjacent triangular facets)
   - Support repeating decorative patterns (hex, grid, pinwheel, carnation, shield, tristar, box)
   - Pattern algorithms map/deform unit patterns to fit specific quad shapes

2. **Panel Patterns** - For etching wood or metal fabrication
   - Each panel is a single triangular facet
   - No pattern definitions applied
   - Just raw flattened geometry from 3D → 2D conversion

Both output types derive from the same 2D flattened geometry but diverge in post-processing.

### Core Pattern: Worker-Based Async Computation

The most critical architectural pattern is **async geometry generation via Web Worker**:

```
User modifies config
    ↓
Store updates trigger generateSuperGlobuleAsync() [src/lib/stores/workerStore.ts]
    ↓
Message sent to Web Worker [src/lib/workers/super-globule.worker.ts]
    ↓
Worker calls generate-superglobule.ts (CPU-intensive computation)
    ↓
Result serialized and sent back
    ↓
workerStore.ts rehydrates Three.js objects (Vector3, Triangle)
    ↓
Stores update → UI re-renders
```

**Critical details:**
- Three.js class instances (Vector3, Triangle) don't serialize through postMessage
- `workerStore.ts` has extensive rehydration logic to rebuild these objects
- Track computation state via `isWorking` and `workerError` stores
- Each request has unique `requestId` for matching responses

### Geometry Generation Deep Dive

The complete pipeline: `3D Geometry Generation → Flattened Bands → Pattern Application → SVG Output`

#### Core Data Structures

- **Facets**: Triangles (the atomic geometric unit)
- **Bands**: Strips/groups of connected facets
  - Both generation methods (Globules and Projections) converge on the Bands type
  - Bands are the fundamental structure for flattening and pattern mapping

#### Two Generation Methods

**1. Globules** - Still actively useful for certain outputs

Globules create 3D volumes via parametric sweep (like a pottery wheel profile with independent control).

**Components:**
- **Levels**: 2D cross-sections (points arranged radially around a center)
  - Generated from bezier curves with radial geometry
  - Defines the profile shape

- **Silhouettes**: 2D bezier curves controlling 3D extrusion
  - Y-axis → Z-axis position (vertical height in 3D space)
  - X-axis → Scale multiplier for the level
  - Can apply offsets (translation) and rotations

**Process:**
1. Sample points along the silhouette curve
2. For each sample point:
   - Y value determines Z position in 3D
   - X value provides scale factor for the level
   - Apply transformations (scale, offset, rotation)
3. Place transformed level at each Z height
4. Connect levels vertically to form 3D volume
5. Result: Parametric sweep with independent scale/offset/rotation control per level

**Characteristics:**
- Limited shape variety but mathematically precise
- Perfect for cylindrical/rotational forms
- Efficient computation

**2. Projections** - More flexible, wider shape variety

Projections "drape" polyhedron edge structures onto arbitrary 3D surfaces.

**Components:**
- **Polyhedra**: Organized 3D vectors forming polygons
  - Generated from configs in `src/lib/projection-geometry/generate-polyhedra.ts` (37KB)
  - Define "edge curves" using bezier curves
  - Provide structural topology (pattern of connections)

- **Surface**: Any Three.js mesh
  - Currently supported: sphere, capsule, globule
  - Vision: support arbitrary 3D shapes
  - Provides overall form/shape

- **Cross Sections**: Bezier curve configs defining tube profiles
  - Applied at intersection points
  - Create "tubes" composed of bands

**Process:**
1. Start from a central point
2. Sample points from polyhedra edge curves (beziers)
3. Cast rays from center through sampled points
4. Rays transformed by polyhedra structure
5. Find intersections with surface mesh (ray tracing)
6. At each intersection point, apply cross-section shapes perpendicular to ray
7. Cross-sections create interconnected "tubes" (band structures)
8. Result: Network of tubes following polyhedron topology, conforming to surface shape

**Key Insight:**
- Polyhedra provides **structure/topology** (how elements connect)
- Surface provides **overall form** (what shape the structure conforms to)
- You're draping the polyhedron's edge network onto the surface

**Integration:** Projections can use globules as the surface mesh for ray tracing.

**3. SuperGlobule** - Container type

- Can hold both globules and projections
- Original vision: combine multiple elements for complex composite shapes
- Not fully realized yet
- Legacy code exists for combining multiple globules via transformations (not actively maintained)

#### Flattening Process

Converts 3D bands to 2D while preserving intrinsic geometry (isometric transformation).

**Algorithm:**
1. For each 3D triangle in band:
   - Measure side lengths and vertex angles from 3D coordinates

2. Reconstruct in 2D preserving measurements:
   - Start with initial vector (or reuse previous triangle's last side for continuity)
   - Apply first side length
   - Rotate by vertex angle
   - Apply second side length
   - Result: 3 2D points forming flattened triangle

3. Chain triangles together:
   - Last side of triangle N becomes starting side of triangle N+1
   - Maintains continuity throughout band

4. Continue until entire band is flattened

5. Final transform: orient bands with long axis aligned to Y-dimension

**Characteristics:**
- Isometric (preserves lengths and angles)
- Like "unrolling" a paper strip
- Maintains geometric continuity between adjacent triangles
- No stretching or distortion

#### Pattern System (Cut Patterns Only)

Applies repeating decorative patterns to flattened geometry.

**Core Types:**
- **Unit Pattern**: Series of points defining a repeating design element
- **PathSegment**: Maps directly to SVG path `d` attribute syntax
  - M = move, L = line, C = cubic bezier, etc.

**Mapping Process:**

1. **Decompose bands into quadrilaterals:**
   - Triangle 1: points A, B, C
   - Triangle 2: points B, C, D (shares edge B-C with Triangle 1)
   - Quadrilateral: 4 unique points (A, B, C, D) from pair of adjacent triangles
   - Each quad = fundamental unit for pattern mapping

2. **Map unit pattern to each quadrilateral:**
   - Algorithm transforms/deforms unit pattern to fit specific quad shape
   - Different pattern types available:
     - hex, grid, box (geometric tiles)
     - carnation, pinwheel, shield, tristar (decorative)
   - Each in `src/lib/patterns/tiled-[name]-pattern.ts`

3. **Integration adjustments:**
   - Some patterns apply adjustments for better visual continuity with adjacent patterns
   - Adjacent patterns can be in:
     - Same band
     - Different bands
     - Different tubes (for projections)

4. **Facet metadata for continuity:**
   - Each facet stores "partners" information
   - Partners = adjacent/neighboring facets
   - Used to ensure pattern continuity across boundaries
   - Enables seamless transitions between mapped patterns

**Note:** Different patterns developed at different times with varying sophistication. See individual pattern files for implementation details.

**Pattern Registry:** All patterns registered in `src/lib/patterns/pattern-definitions.ts`

### Key Directories

**`src/lib/`** - Core business logic (4700+ lines)
- `generate-superglobule.ts` - Main generation orchestrator
- `generate-shape.ts`, `generate-level.ts`, `generate-projection.ts` - Geometry pipeline
- `projection-geometry/` - Polyhedra and projection math (~280 lines)
  - `generate-polyhedra.ts` - 37KB file with polyhedron generation
- `patterns/` - Pattern generation algorithms
  - Multiple tiled patterns: hex, grid, box, carnation, pinwheel, shield, tristar
  - `pattern-definitions.ts` - Pattern registry
  - `utils.ts` - 17KB of shared pattern utilities
- `cut-pattern/` - 2D pattern generation from 3D geometry
- `stores/` - Svelte store definitions
  - `workerStore.ts` - Web worker orchestration (study this for async patterns)
  - `stores.ts` - Main config stores
  - `superGlobuleStores.ts` - SuperGlobule state
  - `selectionStores.ts` - Selection/interaction state
- `types.ts` - **31KB file** with all type definitions (comprehensive domain model)
- `shades-config.ts` - Default configurations (15KB)
- `validators.ts` - Configuration validation
- `server/schema/` - Drizzle ORM database schema

**`src/components/`** - Svelte UI components
- `three-renderer/` - 3D visualization (Three.js/Threlte)
  - `ThreeRenderer.svelte` - Main 3D viewport
  - `GlobuleGeometryComponent.svelte` - Renders geometry
  - `materials.ts`, `colors.ts` - Material/color definitions
- `cut-pattern/` - 2D pattern rendering & SVG export
  - `PatternViewer.svelte` - Main pattern view
  - `CutPatternSvg.svelte` - SVG generation
- `path-edit/` - Bezier curve editors
  - Uses `bezier-js` library for curve math
- `controls/` - Configuration UI panels
- `modal/` - Dialogs and sidebars

**`src/routes/`** - SvelteKit pages and API
- `/designer2/+page.svelte` - **Main design interface** (orchestrates all components)
- `/api/globuleConfig/` - Globule CRUD endpoints
- `/api/superGlobuleConfig/` - SuperGlobule CRUD endpoints
- `/sandbox-*/` - Isolated feature testing pages

**`src/lib/workers/`** - Web Worker implementations
- `super-globule.worker.ts` - Geometry computation worker

## Type System

All types defined in `src/lib/types.ts` (31KB):
- Configuration hierarchy: `SuperGlobuleConfig` → `GlobuleConfig` → `ProjectionConfig` → Pattern configs
- Use type guards from `src/lib/matchers.ts` for runtime checks
- Validators in `src/lib/validators.ts`

## State Management

Reactive Svelte stores with complex derivation chains:
- Config stores automatically trigger recomputation
- Use `persistable.ts` wrapper for localStorage persistence
- `derived()` stores are extensively used - understand dependencies before modifying
- All stores in `src/lib/stores/`

## Common Tasks

### Adding a New Pattern
1. Create `src/lib/patterns/tiled-[name]-pattern.ts`
2. Implement generation logic (reference existing patterns)
3. Add to `pattern-definitions.ts` registry
4. Add UI controls in `src/components/controls/` if needed
5. Update `src/lib/types.ts` if new config options required

### Modifying Geometry Generation
1. Changes go in **worker** (`src/lib/workers/super-globule.worker.ts`)
2. Ensure Three.js objects remain serialization-compatible
3. Update rehydration logic in `workerStore.ts` if adding new Three.js types
4. Never block UI thread with heavy computation

### Adding Configuration Options
1. Update `src/lib/types.ts`
2. Add defaults in `src/lib/shades-config.ts`
3. Add validators in `src/lib/validators.ts` if needed
4. Create/update UI controls in `src/components/controls/`
5. For database persistence: update schema, run `drizzle:generate` and `drizzle:migrate`

### Working with the Worker
- Always use `generateSuperGlobuleAsync()` from `workerStore.ts`
- Check `isWorking` store before triggering new computation
- Handle errors via `workerError` store
- Three.js objects MUST be rehydrated after deserialization
- Request/response pattern uses unique `requestId` for tracking

## Database

- Turso (SQLite) with Drizzle ORM
- Schema in `src/lib/server/schema/`:
  - `globuleConfig` - Individual globule configs
  - `superGlobuleConfig` - Top-level configs
- Schema changes require `drizzle:generate` then `drizzle:migrate`
- Use `drizzle:studio` for visual inspection

## Testing

- **Unit tests:** Colocated in `**/__tests__/**/*.test.ts`, use Jest
- **E2E tests:** In `/tests/`, use Playwright against production build
- Run single test: `npm run test:unit -- path/to/test.test.ts`

## Performance

- **Always use worker for geometry computation** - never block UI
- Three.js rehydration has overhead - minimize worker round-trips
- Derived stores memoize automatically - leverage for expensive computations
- Pattern generation and SVG export can be slow with complex geometries

## Git Workflow

- Main branch: `main`
- Current branch: `feature/update-globule-surface`
- Recent focus: async geometry (worker implementation), pattern invariability, color improvements, geometry calculations

## Debugging

- Use `/sandbox-*` routes for isolated testing
- Check browser console for worker errors
- `drizzle:studio` for database inspection
- Monitor `isWorking` and `workerError` stores for worker state
- Three.js objects may not display fully in console - use `.toArray()` methods
