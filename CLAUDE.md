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
- Current work: `feature/make-geometry-async` (implementing worker pattern)
- Recent focus: async geometry, pattern invariability, color improvements

## Debugging

- Use `/sandbox-*` routes for isolated testing
- Check browser console for worker errors
- `drizzle:studio` for database inspection
- Monitor `isWorking` and `workerError` stores for worker state
- Three.js objects may not display fully in console - use `.toArray()` methods
