# Tech Debt Audit & Plan — 2026-10-16

Branch: `worktree-tech-debt-audit` (off `main` @ 35b8638). Audit only; no code changed yet.

## Baseline

| Check          | Result                                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `svelte-check` | **353 errors, 24 warnings** in 38 files (270 errors in `src/lib/flatten/flatten.ts` alone)                                                                                                         |
| `eslint .`     | **316 errors, 3 warnings** — 120 `no-unused-vars`, 94 `no-explicit-any`, 57 `svelte/require-each-key`, 13 `no-unused-expressions`, 9 `prefer-svelte-reactivity`, 8 `prefer-const`, rest singletons |
| `jest`         | 1728/1730 pass. 2 failures are wall-clock asserts in `nest.test.ts` (4 s / 2 s budgets) that fail under CPU load and pass in isolation (52/52)                                                     |
| `npm outdated` | 31 packages behind; 13 have a new major                                                                                                                                                            |
| knip           | 0 unused files (tests count as entries), 64 unused exports, 72 unused types, 5 unused deps, 2 unlisted deps                                                                                        |

Package manager is **yarn** (`yarn.lock`, no `package-lock.json`); CLAUDE.md's `npm run` commands still work but installs should go through yarn.

## Findings

### Dead code (still imported, never executed) — ~2,700 lines

Chain hanging off dead functions in `src/lib/cut-pattern/generate-cut-pattern.ts`:

- `generate-cut-pattern.ts` (964 lines). **Live:** `getFlatStripV2`, `applyStrokeWidth`, `generateEdgeConfig`, `CutoutConfig`. **Dead:** `expandStroke`, `expandAndCombine` (duplicates of `expand-stroke.ts`), `generateStrutPatterns`, `generateBandPatterns`, `generateLevelSetPatterns`, `getFlatStrip`, `round`, `printPoint`, `printTriangle`, `getModelHeight`, `getPatternLength`, `getRenderableOnGeometry`, private `generatePattern` table. All `orderedPointsList` / `DynamicStrokeConfig` errors live here.
- `src/lib/patterns/flower-of-life.ts` (923) — only live export is the 2-line `svgTriangle` used by `QuadPattern.svelte`.
- `src/lib/flatten/flatten.ts` (1300) — only importer is flower-of-life.
- `src/lib/patterns/ellipse.ts` (251) — imports two modules that no longer exist.
- `src/lib/patterns/unit-pattern/unit-flower-of-life.ts` — only used by the dead table.
- `src/lib/cut-pattern/prepare-merge.ts` (92) — header says TEST-ONLY; only tests import it.

Removing this chain should clear **~285 of the 353** type errors.

### Legacy but live — needs your call

- `src/lib/transform-globule.ts` (330) — reached via deprecated `generateSubGlobule` in the "Old Globule Pipeline", whose gate defaults to `globule: true` (`generate-superglobule.ts:24,62-70`). 7 of 9 exports unused; 8 type errors (`GlobuleData.levels` missing). Either keep and fix types, or retire the old pipeline.
- `src/routes/+page.svelte` — links to nonexistent `/shades`; only other content is a "persist settings?" checkbox. Candidate: redirect `/` → `/designer2`.

### Unused dependencies / repo junk

- Unused deps: `vercel` (the CLI, as a _runtime_ dep, 34 majors behind), `@sveltejs/adapter-static`, `@sveltejs/adapter-auto` (config uses adapter-vercel), `@types/uuid` (uuid ships types), `tslib` (medium confidence).
- Misplaced: `@types/three` is in `dependencies`.
- Unlisted: `@jest/globals` (~105 test files), `@eslint/js` (`eslint.config.js`).
- Tracked junk: `Relief-SingleLine-main/` (15 MB; fonts already copied into `static/fonts/`), `Relief-SingleLine-main.zip` (10 MB), `yarn-error.log` (420 KB, 2023). `documentation/` (5 .md, unreferenced) vs `docs/` — consolidate. `TODO.md` — yours.
- CLAUDE.md drift: describes `/sandbox-*` routes that don't exist.

### Remaining type errors after dead-code removal (~70)

Grouped by cause:

1. **Domain-type drift** (~30): `Facet.orientation` required but not set (`generate-shape.ts`, `generate-superglobule.ts`); `Band.bounds` doesn't exist (`generate-tiled-pattern.ts` ×7); `GeometryAddress` union not narrowed (`generate-tiled-pattern.ts`); `BandCutPattern` / `SuperGlobuleBandPattern` shape mismatches (`generate-pattern.ts`, `generate-tiled-pattern.ts`); `PatternTypeConfig.config` (`PatternScale.svelte` ×4); `pattern-definitions.ts` signature mismatches ×3; `collate-tubes.ts` `showVoronoiGeometry`; `apply-cross-sections.ts` `divisions`; `generate-polyhedra.ts` `vertex1`.
2. **Missing type packages**: `d3-delaunay`, `d3-geo-voronoi` → add `@types/d3-delaunay`, local `.d.ts` for d3-geo-voronoi.
3. **Implicit `any` on Threlte event handlers** (`ev` ×9 across ProjectionGeometryComponent, GlobuleGeometryComponent, ColorMapped, designer2) → type as `IntersectionEvent<MouseEvent>`.
4. **Narrowing** (~10): `PanelComponent.svelte` `false | {…}`, `partner-neighbors.ts` `baseFacet.quad`, `collate-geometry.ts`, `flower-of-life.ts` (goes away), `band-sort-index.ts` self-referential `next`.
5. **Misc**: `CrossSection.svelte` / `Surface.svelte` wide union assigns; `ProjectionGeometryComponent` `MeshStandardMaterial[]` vs Physical; 3 test-file errors; `validators.ts` broken module path + `hole` any.
6. **Warnings (24)**: a11y click-handler warnings on SVG editors (13), `context="module"` → `module` (2), stale-initial-value captures (3), unused CSS (3), self-closing div, unused `labelStyle` export.

### Library versions

Constraint map (from peer deps):

- **Kit 2.70.3 already accepts** Vite 5–8, vite-plugin-svelte 3–7, TypeScript 5–6 → toolchain can move _before_ Kit.
- **Kit 3** requires Vite ^8.0.12, vite-plugin-svelte ^7, Svelte ^5.57.1, **TypeScript ^6**, Node ≥22.17 (local is 22.17.1 — right at the floor). adapter-vercel 7 requires Kit 3.
- **TypeScript 7 is blocked**: svelte-check (≤6), typescript-eslint (<6.1), ts-jest (<7) don't support it. Target TS 6.
- vite-plugin-svelte 4 → 7 pairs with Vite 5 → 8. **Vite 8 swaps in Rolldown** — the risk is the three module workers loaded via `new Worker(new URL(...), import.meta.url)` (`workerStore.ts:229`, `nest-layout-worker-factory.ts`, `band-merge-worker-factory.ts`) and `ssr.noExternal: ['three', 'troika-three-text']`. Also re-check `vite.worktree.config.ts` (git-excluded).
- ESLint 10 is supported by eslint-plugin-svelte 3.23 and typescript-eslint 8.71.
- three 0.182 → 0.186 (+ `@types/three`): Threlte 8.6 / extras 9.22 accept ≥0.172; three-mesh-bvh 0.9.16 accepts ≥0.159. Watch for material/color-management deprecations.
- Other majors: prettier-plugin-svelte 4 (reformat diff), uuid 14, dotenv 18, @libsql/client 0.18 (pre-1.0, so minor may break).

## Plan

Each phase is a separate commit (or small set), gated on: `svelte-check` error count not increasing, `jest` green, `yarn build` succeeds, and a headless Playwright smoke of `/designer2` (generate Voronoi model, open pattern pane, export SVG) for anything touching the build or geometry.

### Phase 0 — Hygiene (low risk, ~30 min)

1. `git rm -r Relief-SingleLine-main Relief-SingleLine-main.zip yarn-error.log`.
2. Remove `vercel`, `@sveltejs/adapter-static`, `@sveltejs/adapter-auto`, `@types/uuid`; move `@types/three` to devDependencies; add `@jest/globals`, `@eslint/js`. Verify `tslib` before removing.
3. Make `nest.test.ts` timing asserts robust (generous budget or `describe.skip` behind an env flag like `PERF=1`).
4. Fix CLAUDE.md drift (sandbox routes; yarn).

### Phase 1 — Dead-code removal (low-medium risk, ~1 h)

1. Move `svgTriangle` next to `QuadPattern.svelte` (or into `patterns/utils.ts`).
2. Delete dead functions from `generate-cut-pattern.ts`; drop its now-unused `svg-path-outline` import.
3. Delete `flower-of-life.ts`, `flatten/flatten.ts`, `ellipse.ts`, `unit-flower-of-life.ts`, `prepare-merge.ts` (+ its tests).
4. Expected: svelte-check ~353 → ~70 errors.

### Phase 2 — Type errors to zero (medium risk, ~3–4 h)

In order: missing type packages → Threlte `ev` typing → narrowing fixes → domain-type drift (decide per case whether the _type_ or the _code_ is wrong; `Band.bounds` and `Facet.orientation` are the biggest) → misc → warnings. Then make `yarn check` part of the pre-commit/"done" bar so it stays at zero.

### Phase 3 — In-range bumps (low risk, ~20 min)

`yarn upgrade` within carets: svelte 5.57, kit 2.70, threlte, three-mesh-bvh, svelte-check 4.7, typescript-eslint 8.71, eslint-plugin-svelte 3.23, prettier 3.9, playwright 1.64, jest 30.5, drizzle, tsx, ts-jest. Run `yarn format` as its own commit.

### Phase 4 — Toolchain majors (medium-high risk, one at a time)

1. **Vite 8 + vite-plugin-svelte 7** (still on Kit 2). Verify all three workers build and run in `dev` and `build`/`preview`, the agent-bridge plugin, and worktree config.
2. **TypeScript 6.** Re-run check; fix new strictness errors.
3. **ESLint 10.**
4. **prettier-plugin-svelte 4** + reformat commit.
5. **three 0.186 + @types/three 0.186.** Visual check of materials/colors in designer2.
6. Small majors: uuid 14, dotenv 18, @libsql/client 0.18 (verify `/api/config` CRUD against Turso).

### Phase 5 — SvelteKit 3 + adapter-vercel 7 (high risk)

Read the Kit 3 migration guide first; run `npx sv migrate` if one ships. Consider bumping Node past 22.17 (floor) — e.g. Node 24 LTS — and pin it in `.nvmrc` / `engines`. Verify Vercel preview deploy.

### Phase 6 — Lint & export cleanup (low risk, incremental)

1. `eslint --fix` (11 auto-fixable), then the 120 unused vars, 57 `{#each}` keys, `prefer-const`.
2. Prune knip's 64 unused exports / 72 unused types file by file (biggest: `generate-projection.ts`, `quadrilateral.ts`, `util.ts`, `patterns/utils.ts`, `collate-geometry.ts`, stores). Rename `distrubute-panels.ts` → `distribute-panels.ts`.
3. `no-explicit-any` (94) — chip away opportunistically, don't block on it.
4. Optionally add knip config + script so dead code doesn't silently re-accumulate.

## Decisions needed

1. **Old Globule Pipeline / `transform-globule.ts`** — keep (fix 8 type errors) or retire?
2. **`/` route** — redirect to `/designer2`, or keep?
3. **`documentation/` and `TODO.md`** — merge into `docs/`, delete, or leave?
4. **Kit 3** — do it in this pass, or stop after Phase 4?
