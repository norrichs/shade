---
name: shades-control
description: Drive the live Shades designer (the /designer2 tab Ben has open) from chat - read and patch the globule, projection, voronoi, pattern and view configs, wait for regeneration, inspect bands, and take screenshots of the 3D model and cut pattern. Use when Ben asks to change, explore, inspect or look at the current design in the running app (e.g. "make the bands wider", "try the hex pattern", "what does band g0t3b7 look like", "show me the model"), not for editing source code.
---

# Shades control

You operate the running Shades app through a dev-only bridge:
`scripts/shades.sh` → `POST localhost:<port>/__shades/agent` → Vite dev server →
the open designer2 tab → its Svelte stores. Changes are live in Ben's browser.

## Before anything

1. Run `scripts/shades.sh status` (path is relative to this skill's directory).
   - **exit 2 / `disabled`**: the bridge is off. Tell Ben to click the **red dot**
     in the designer2 navbar (it turns green). Do not retry until he has.
   - **"No dev server"**: ask Ben to start `npm run dev` (port 9775). For a
     worktree dev server, prefix calls with `SHADES_PORT=9776`.
   - **"No designer2 tab answered"**: Ben needs `/designer2` open.
2. `scripts/shades.sh help` lists every op and its arguments.

## The loop

1. **Look**: `summary`, then `getConfig` on the relevant subtree. Read the
   reference file for that area before changing values you don't know.
2. **Change**: `patchConfig`. It snapshots for `undo`, regenerates (also in
   manual mode), waits until generation is idle, and returns a fresh summary.
   Batch related edits with `patches: [...]` so they regenerate once.
3. **Check**: read `workerError` and `pattern.bandErrors` in the response.
   Then `screenshot` and **Read the returned PNG paths** to see the result.
4. If it got worse or broke, `undo`.

Describe what you changed and what you saw. Ben judges visually; fold or
error counts are telemetry, not pass/fail gates.

## Ops at a glance

| Op                           | Args                                                          | Use                                                     |
| ---------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| `status`                     |                                                               | modes, pattern source, pipeline gates, undo depth       |
| `summary`                    |                                                               | 3D tube/band/facet counts, pattern bands, errors, pages |
| `getConfig`                  | `store`, `path?`, `depth?`, `maxItems?`                       | read `super` / `pattern` / `view` / `ui`                |
| `patchConfig`                | `store`, `path`+`value` or `patches`, `wait?`, `timeoutMs?`   | change and regenerate                                   |
| `undo`                       |                                                               | revert the last mutating op (stack of 30)               |
| `regenerate` / `waitForIdle` | `timeoutMs?`                                                  | force or await generation                               |
| `bands`                      | `tube?`, `errorsOnly?`, `offset?`, `limit?`                   | list pattern bands with flattened bounds                |
| `band`                       | `address`, `facets?`                                          | partners, tabs, labels for one band                     |
| `screenshot`                 | `view: model\|pattern\|both`, `annotate?`, `width?`, `bands?` | PNGs written to `$TMPDIR/shades-agent/`                 |
| `setCamera`                  | `x`, `y`, `z`                                                 | view the model from a direction, then screenshot        |
| `listConfigs` / `loadConfig` | `id`                                                          | saved designs in the DB (load is undoable)              |
| `saveConfig`                 | `name`                                                        | save as a NEW config; only when Ben asks                |

Paths are dotted with array indexes: `subGlobuleConfigs.0.globuleConfig.levelConfig`.
`getConfig` collapses anything deeper than `depth` (default 3) to a key list
and elides arrays past `maxItems`, so walk down a path rather than raising
depth on the root. A path that doesn't exist is an error, never a new key tree.

`ui` paths start with the store name: `computationMode`, `isManualMode`,
`designerPanels.layout`.

## Bands and addresses

Pattern bands are addressed `g<globule>t<tube>b<band>` with `p<piece>` for split
pieces, e.g. `g0t3b7p1`. `screenshot {view:"pattern", annotate:true}` draws
these on the image so you can name what you see, then query it with `band`.
Crop to specific bands with `bands: ["g0t3b7", "g0t3b8"]`.

## Gotchas

- The pattern pane only shows bands for the active `patternViewConfig.patternSource`
  and its pipeline gate. Default model is Voronoi. Projections only generate with
  `view.showProjectionGeometry.any = true`. Check `status.pipelineGates` first.
- Only `pattern.patternViewConfig.range` bands are patterned: by default the
  first 2 bands of each tube. Widen it before judging a "whole" pattern.
- Swapping `patternTypeConfig` to another pattern drops its `labels`; patch the
  type, its config and labels together in one `patches` call.
- A `patches` call is applied as one write per store, so coupled values (min/max
  pairs) never generate half-applied, and a bad path changes nothing.
- The bridge never creates missing parent objects: write an absent optional
  object (e.g. `fill`, `labels`, `edgeSampling`) whole at its parent key.
- `computationMode: "2d-only"` silently resets to `continuous` on any 3D edit.
- Many pattern fields (page layout, post-process, zoom) apply at render time
  without regenerating; `patchConfig` still waits briefly, which is harmless.
- There is no live fold telemetry; `bands` rows with `sideOrientation: "mixed"`
  are the only runtime hint of a folded band. Look at a screenshot instead.
- Pattern screenshots need the pattern pane visible (`ui.designerPanels.layout`
  not `model`); model screenshots need the 3D pane visible.
- Large models take seconds to regenerate; pass `timeoutMs` for slow edits.
- Config edits autosave to the working state but not to the database. Only
  `saveConfig` writes to the DB, and only as a new row.
- Every open designer2 tab with the bridge on receives commands. If results
  look inconsistent, ask Ben to close extra tabs.

## Reference (read when working in that area)

- `reference/concepts.md`: domain primer (globules, projections, voronoi, bands, addresses)
- `reference/super-config.md`: the `super` store: geometry configs
- `reference/pattern-config.md`: the `pattern` store: pattern types, layout, labels
- `reference/view-and-ui.md`: the `view` and `ui` stores and their gating effects
