# Voronoi follow-up — workstream specs

Follow-up grab-bag of upgrades after the Voronoi geometry feature. Source brief:
[`voronoi-follow-up.md`](./voronoi-follow-up.md). Brainstormed/planned on 2026-05-30.

## Decisions

- **Packaging:** one spec per workstream (this folder); each gets its own implementation plan
  and its own git worktree + Sonnet implementer. Opus orchestrates/reviews/integrates.
- **Scope:** items #2–#9. Item #1 (voronoi edge curves) **deferred** — too poorly defined.
- **Voronoi configs:** collapse `voronoiConfigs[]` → single `voronoiConfig`.
- **Seed relaxation:** area-weighted sampling feeds the **existing** Lloyd relaxation; no new
  index-space relaxation.
- **fillAll:** centroid triangle-fan preserving 2-facets-per-quad with one **degenerate**
  facet; **outlined-only**.
- **Group codes:** grouping-mode-agnostic; populated only in end-connection mode today.

## Workstreams

| WS | Spec | Brief item(s) | Depends on | Blocks |
|----|------|---------------|-----------|--------|
| A | [voronoi](./2026-05-30-ws-a-voronoi-design.md) | #2, #3 | — | — |
| B | [grouping-codes](./2026-05-30-ws-b-grouping-codes-design.md) | #4 | — | C, D |
| C | [pattern-tags](./2026-05-30-ws-c-pattern-tags-design.md) | #5 | B | — |
| D | [csv-export](./2026-05-30-ws-d-csv-export-design.md) | #7 | B | — |
| E | [tab-layout](./2026-05-30-ws-e-tab-layout-design.md) | #6 | — | — |
| F | [line-wrap](./2026-05-30-ws-f-line-wrap-design.md) | #8 | — | — |
| G | [fillall](./2026-05-30-ws-g-fillall-design.md) | #9 | — | — |

## Parallelization waves

- **Wave 1 (parallel):** A, B, E, F, G — fully independent.
- **Wave 2 (parallel, after B merges):** C, D.

Note: C's self-tag relocation has no real dependency on B (only its external-tag part does),
so C can start in Wave 1 and pick up B's `buildBandCodeMap` at integration.

## Dependency graph

```
B ──┬──> C
    └──> D
A  (independent)
E  (independent)
F  (independent)
G  (independent)
```
