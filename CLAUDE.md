# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Shades** is a 3D parametric design tool for creating complex geometric structures ("globules") and generating 2D cut patterns for manufacturing. Built with SvelteKit, Three.js, and TypeScript.

This project is used exclusively by the developer.

Kit 3 conventions: import library code as `#lib/path/to/module.js` (package.json `imports`, `.js` extension even for `.ts` sources; Jest maps it in `jest.config.js`). There is no `svelte.config.js` — adapter and preprocess options live in the `sveltekit()` plugin call in `vite.config.ts`. Load workers with a relative `new URL('../workers/x.worker.ts', import.meta.url)`, never `#lib/...` (a `#` URL is a fragment).

Environment variables: `VITE_TURSO_DB_URL` and `VITE_TURSO_DB_AUTH_TOKEN` in `.env`

Main UI is `src/routes/designer2/+page.svelte`.

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

### Geometry Generation

For globules, projections, SuperGlobule, band flattening, and pattern mapping, load the `geometry-pipeline` skill (`.claude/skills/geometry-pipeline/SKILL.md`).

## Tooling

- Run `yarn knip` to catch unused files/exports/deps (config in `knip.json`); never run `knip --fix` unattended — it has mangled identifiers here

## Git Workflow

- Main branch: `main`
- Package manager: yarn (v1, `yarn.lock`)

**Never revert or drop a commit you did not author in this session.** Several
sessions work this branch at once, and a commit that looks out of scope for your
task is usually another session's in-flight work — design docs and plans under
`docs/superpowers/**` especially, which are written by a planning session while
an implementation session works the same branch. If a commit genuinely blocks
you, say so and leave it alone; do not `git revert` it, drop it in a rebase, or
"tidy" it away. The same goes for files: only touch documents your own task
names.

## Debugging

- Use the `shades-control` skill / agent bridge to drive designer2 from chat
- Check browser console for worker errors
- `drizzle:studio` for database inspection
- Monitor `isWorking` and `workerError` stores for worker state
- Three.js objects may not display fully in console - use `.toArray()` methods
