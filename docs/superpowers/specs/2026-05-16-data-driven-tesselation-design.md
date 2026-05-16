# Data-Driven Tesselation: Unify Hex and Box into the Spec-Driven Pipeline

**Date:** 2026-05-16
**Status:** Design

## Goal

Convert the `hex` and `box` tesselation patterns from procedural generators into fully data-driven specs that share a single generator and adjuster with `shield`. After this work, all three built-in tesselation patterns are produced by the same code path; algorithm differences live entirely in their spec data.

The motivation is threefold:

- **Editability** — `supportsEditing: true` becomes meaningful for hex and box. TileEditor will operate on real spec data instead of empty placeholders.
- **Unified generation pipeline** — one shared `generateTesselationTile(spec, props)` and one shared `adjustTesselation(bands, config, tubes, spec)`. No per-algorithm generator/adjuster files.
- **Extensibility** — new built-in tesselation patterns require only a spec file, no new TypeScript modules.

## Architecture

### Module layout

```
src/lib/patterns/tesselation/
├── shared/                          [NEW]
│   ├── generator.ts                 generateTesselationTile(spec, props)
│   ├── adjuster.ts                  adjustTesselation(bands, config, tubes, spec)
│   ├── helpers.ts                   retarget, replaceInPlace, removeInPlace,
│   │                                evaluateSkipEdge, scaleSegment (generalized),
│   │                                getTransformedPartnerCutPattern, newTransformPS
│   └── __tests__/
│       ├── generator.test.ts
│       └── adjuster.test.ts
├── shield/
│   ├── default-spec.ts              (unchanged data; matches extended UnitDefinition)
│   ├── index.ts                     re-exports only the spec
│   └── __tests__/                   existing snapshot tests, retargeted imports
├── hex/
│   ├── default-spec.ts              (REWRITTEN — full unit data + adjustments)
│   ├── index.ts                     re-exports only the spec
│   └── __tests__/                   existing snapshot tests, retargeted imports
└── box/
    ├── default-spec.ts              (REWRITTEN — full unit data, empty adjustments)
    ├── index.ts                     re-exports only the spec
    └── __tests__/                   existing snapshot tests, retargeted imports
```

**Deleted:** `shield/{generator,adjuster,helpers}.ts`, `hex/{generator,adjuster,helpers}.ts`, `box/generator.ts`.

### Registry simplification

`src/lib/patterns/pattern-registry.ts` collapses to a single `makeAlgorithm` helper:

```typescript
const makeAlgorithm = (
  algorithmId: TiledPatternAlgorithm,
  displayName: string,
  defaultSpec: TiledPatternSpec,
  tagAnchor: TagAnchor
): PatternAlgorithm => ({
  algorithmId,
  displayName,
  defaultSpec,
  supportsEditing: true,
  createPatternsEntry: (spec) => ({
    getPattern: (rows, columns, _quadBand, variant = 'rect', sideOrientation) =>
      generateTesselationTile(spec, { size: 1, rows, columns, variant, sideOrientation }),
    tagAnchor,
    adjustAfterTiling: (bands, cfg, tubes) =>
      adjustTesselation(bands, cfg, tubes, spec)
  })
});

export const algorithms = [
  makeAlgorithm('shield-tesselation', 'Shield', defaultShieldSpec,
    { facetIndex: 0, segmentIndex: 3 }),
  makeAlgorithm('hex', 'Hex', defaultHexSpec,
    { facetIndex: 0, segmentIndex: 0 }),
  makeAlgorithm('box', 'Box', defaultBoxSpec,
    { facetIndex: 0, segmentIndex: 5, angle: 0 })
];
```

The `algorithm` field on the spec stays distinct (`'shield-tesselation' | 'hex' | 'box'`) so the TileEditor can group user variants under their parent algorithm name. Internally, dispatch flows through one code path.

## Data model

### Extension to `UnitDefinition`

`src/lib/patterns/spec-types.ts`:

```typescript
export type UnitDefinition = {
  width: number;
  height: number;
  start: PathSegment[];
  middle: PathSegment[];
  end: PathSegment[];
  firstColumn?: PathSegment[];  // NEW — appended to middle bucket only when c === 0
  lastColumn?: PathSegment[];   // NEW — appended to middle bucket only when c === columns - 1
};
```

Both new fields are optional. Shield's existing spec satisfies the extended type without modification.

`firstColumn` / `lastColumn` go into the **middle** output bucket (not their own bucket) because semantically they're column-edge decoration of the body, not row-edge decoration.

### Hex spec

Canonical unit at `width: 2, height: 3`. Coordinates expressed in `(w, h)` units that match the current procedural code's `w = col/2, h = row/3`.

```typescript
export const defaultHexSpec: TiledPatternSpec = {
  id: 'tiledHexPattern-1',
  name: 'Hex (default)',
  algorithm: 'hex',
  builtIn: true,
  unit: {
    width: 2,
    height: 3,
    start: [
      ['M', 1, 0], ['L', 1, 0.5]               // top stem
    ],
    middle: [
      ['M', 0, 1], ['L', 1, 0.5], ['L', 2, 1], // top zigzag
      ['M', 0, 1], ['L', 0, 2],                // left edge
      ['M', 0, 2], ['L', 1, 2.5], ['L', 2, 2]  // bottom zigzag
    ],
    end: [
      ['M', 1, 2.5], ['L', 1, 3]               // bottom stem
    ],
    lastColumn: [
      ['M', 2, 1], ['L', 2, 2]                 // right edge (only on last column)
    ]
  },
  adjustments: {
    // this.end-group ← next.start-group, pinning column stems contiguous
    withinBand: [
      { source: 0, target: 10 },  // start[0] of next → end[0] of this
      { source: 1, target: 11 }   // start[1] of next → end[1] of this
    ],
    acrossBands: [],
    partner: { startEnd: [], endEnd: [] },
    skipRemove: []
  }
};
```

Index math: `startCount=2, middleCount=8, endCount=2`. End-group's canonical start index = `startCount + middleCount = 10`. The `retarget` helper expands these to all columns at runtime.

`endsTrimmed` is **not** declared in the spec — it's handled by the shared adjuster based on `tiledPatternConfig.config.endsTrimmed` (see Adjuster Behavior).

### Box spec

Canonical unit at `width: 2, height: 6`.

```typescript
export const defaultBoxSpec: TiledPatternSpec = {
  id: 'tiledBoxPattern-0',
  name: 'Box (default)',
  algorithm: 'box',
  builtIn: true,
  unit: {
    width: 2,
    height: 6,
    start: [],
    middle: [
      ['M', 0, 1], ['L', 1, 0], ['L', 1, 2], ['L', 0, 3], ['Z'],
      ['M', 1, 0], ['L', 2, 1], ['L', 2, 3], ['L', 1, 2], ['Z'],
      ['M', 0, 3], ['L', 1, 2], ['L', 2, 3], ['L', 1, 4], ['Z'],
      ['M', 0, 3], ['L', 1, 4], ['L', 1, 6], ['L', 0, 5], ['Z'],
      ['M', 1, 4], ['L', 2, 3], ['L', 2, 5], ['L', 1, 6], ['Z']
    ],
    end: []
  },
  adjustments: {
    withinBand: [],
    acrossBands: [],
    partner: { startEnd: [], endEnd: [] },
    skipRemove: []
  }
};
```

Empty `start` / `end` groups are valid; the generator and adjuster handle them as no-ops.

### Shield spec

No data changes. The spec already satisfies the extended `UnitDefinition` (with `firstColumn` / `lastColumn` undefined).

## Generator behavior

### Generalized `scaleSegment`

Current shield code hardcodes M/L. The shared generator handles all `PathSegment` variants:

```typescript
const scaleSegment = (seg: PathSegment, w: number, h: number): PathSegment => {
  switch (seg[0]) {
    case 'M': return ['M', seg[1] * w, seg[2] * h];
    case 'L': return ['L', seg[1] * w, seg[2] * h];
    case 'Q': return ['Q', seg[1] * w, seg[2] * h, seg[3] * w, seg[4] * h];
    case 'C': return ['C',
      seg[1] * w, seg[2] * h,
      seg[3] * w, seg[4] * h,
      seg[5] * w, seg[6] * h];
    case 'A': return ['A',
      seg[1] * w, seg[2] * h,
      seg[3], seg[4], seg[5],
      seg[6] * w, seg[7] * h];
    case 'Z': return ['Z'];
  }
};
```

Arcs: `rx`/`ry` (indices 1, 2) scale with `w`/`h`; rotation and flags pass through unchanged.

### `buildUnit`

Same shape as today's shield helper, with `firstColumn` and `lastColumn` also scaled into the resulting object. Returns `{ start, middle, end, firstColumn, lastColumn }` where the last two may be empty arrays.

The `invertGroup` helper stays shield-specific for now (it hardcodes M↔L flipping). Hex and box don't invert, so we don't need to generalize it as part of this work. Tracked as a follow-up if a non-M/L pattern ever needs inverting.

### Main loop

Identical layout logic to today's shield generator, with the column-position groups merged into the middle output bucket:

```typescript
export const generateTesselationTile = (
  spec: TiledPatternSpec,
  props: TesselationGeneratorProps
): PathSegment[] => {
  const { size, columns } = props;
  const rows = 1;  // matches current hardcoded behavior in shield + hex generators
  const row = size / rows;
  const col = size / columns;
  const w = col / spec.unit.width;
  const h = row / spec.unit.height;

  const unit = buildUnit(spec, w, h, /* invert */ false);

  const startSegments: PathSegment[] = [];
  const middleSegments: PathSegment[] = [];
  const endSegments: PathSegment[] = [];

  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      const tx = col * c;
      const ty = row * r;

      if (r > 0 && r < rows - 1) {
        middleSegments.push(
          ...translatePS(unit.start, tx, ty),
          ...translatePS(unit.middle, tx, ty),
          ...translatePS(unit.end, tx, ty)
        );
      } else if (rows === 1) {
        startSegments.push(...translatePS(unit.start, tx, ty));
        middleSegments.push(...translatePS(unit.middle, tx, ty));
        endSegments.push(...translatePS(unit.end, tx, ty));
      } else if (r === 0) {
        startSegments.push(...translatePS(unit.start, tx, ty));
        middleSegments.push(...translatePS(unit.end, tx, ty));
        middleSegments.push(...translatePS(unit.middle, tx, ty));
      } else if (r === rows - 1) {
        middleSegments.push(...translatePS(unit.start, tx, ty));
        endSegments.push(...translatePS(unit.end, tx, ty));
        middleSegments.push(...translatePS(unit.middle, tx, ty));
      }

      if (c === 0 && unit.firstColumn?.length) {
        middleSegments.push(...translatePS(unit.firstColumn, tx, ty));
      }
      if (c === columns - 1 && unit.lastColumn?.length) {
        middleSegments.push(...translatePS(unit.lastColumn, tx, ty));
      }
    }
  }

  return [...startSegments, ...middleSegments, ...endSegments];
};
```

## Adjuster behavior

The shared adjuster is structurally identical to today's shield adjuster (same loop, same helpers, same retarget logic). Changes:

1. Lives in `tesselation/shared/` instead of being shield-specific.
2. Adds an `endsTrimmed` handler that maps to the existing `skipRemove`/`removeInPlace` mechanism.
3. Hex's old `endLooped` facet-duplication code is gone; the shared `endLooped` is shield's band-wrap semantic (already present in shield's existing adjuster at line 149).

### `endsTrimmed` handling

When `tiledPatternConfig.config.endsTrimmed === true`, the adjuster automatically:

- Removes all start-group indices from `band.facets[0].path` (only if `spec.unit.start.length > 0`).
- Removes all end-group indices from `band.facets[last].path` (only if `spec.unit.end.length > 0`).

```typescript
if (tiledPatternConfig.config.endsTrimmed) {
  if (band.facets.length > 0 && startCount > 0) {
    const allStartCanonical = Array.from({ length: startCount }, (_, i) => i);
    const expanded = retarget(allStartCanonical, rows, columns, startCount, middleCount, endCount);
    removeInPlace({ indices: expanded, target: newBands[b].facets[0].path });
  }
  if (band.facets.length > 0 && endCount > 0) {
    const allEndCanonical = Array.from(
      { length: endCount },
      (_, i) => startCount + middleCount + i
    );
    const expanded = retarget(allEndCanonical, rows, columns, startCount, middleCount, endCount);
    removeInPlace({
      indices: expanded,
      target: newBands[b].facets[band.facets.length - 1].path
    });
  }
}
```

This makes `endsTrimmed` work for any pattern with populated start/end groups. Box has empty start/end so it's a no-op; shield currently ignores `endsTrimmed` and will now respect it (no expected user-visible change in built-in shield configs since their saved values default to the same setting).

### `endLooped` reconciliation

Decision: adopt shield's semantic (band-wrap) as canonical. Hex's facet-duplication behavior is **dropped**.

- Saved hex configs with `endLooped > 0` will render differently after the migration.
- The new meaning: when `endLooped` is truthy, the last facet's `withinBand` replacements still fire, wrapping the band onto itself.

### withinBand for hex

Already declared in the spec (Section: Data model → Hex spec). The shared adjuster's `replaceInPlace` + `retarget` will fire for hex automatically.

### Geometric note on hex pinning

Current hex adjuster pins both directions: `this.start ← prev.end` AND `this.end ← next.start`. The shared model only does one direction (`this.end ← next.start`). The geometric result is still **continuous** — every facet boundary is pinned to coincident points — but absolute coordinate values may shift slightly versus current output. Wherever today's hex compromises between `prev.end` and `this.start`, the new version snaps fully to `next.start`. Snapshot tests will need one re-baselining pass.

## Migration plan

### New files

- `src/lib/patterns/tesselation/shared/generator.ts`
- `src/lib/patterns/tesselation/shared/adjuster.ts`
- `src/lib/patterns/tesselation/shared/helpers.ts`
- `src/lib/patterns/tesselation/shared/__tests__/generator.test.ts`
- `src/lib/patterns/tesselation/shared/__tests__/adjuster.test.ts`

### Modified files

- `src/lib/patterns/spec-types.ts` — add `firstColumn?` and `lastColumn?` to `UnitDefinition`.
- `src/lib/patterns/tesselation/shield/default-spec.ts` — no change (validated against extended type).
- `src/lib/patterns/tesselation/shield/index.ts` — reduce to `export { defaultShieldSpec } from './default-spec';`.
- `src/lib/patterns/tesselation/hex/default-spec.ts` — full rewrite (Data model → Hex spec).
- `src/lib/patterns/tesselation/hex/index.ts` — reduce to `export { defaultHexSpec } from './default-spec';`.
- `src/lib/patterns/tesselation/box/default-spec.ts` — full rewrite (Data model → Box spec).
- `src/lib/patterns/tesselation/box/index.ts` — reduce to `export { defaultBoxSpec } from './default-spec';`.
- `src/lib/patterns/pattern-registry.ts` — collapse three algorithms to the `makeAlgorithm` helper.

### Deleted files

- `src/lib/patterns/tesselation/shield/generator.ts`
- `src/lib/patterns/tesselation/shield/adjuster.ts`
- `src/lib/patterns/tesselation/shield/helpers.ts`
- `src/lib/patterns/tesselation/hex/generator.ts`
- `src/lib/patterns/tesselation/hex/adjuster.ts`
- `src/lib/patterns/tesselation/hex/helpers.ts`
- `src/lib/patterns/tesselation/box/generator.ts`

### Import audit

Before deleting the old per-pattern generator/adjuster/helper files, grep for any external imports:

```bash
grep -rn "tesselation/shield/generator\|tesselation/shield/adjuster\|tesselation/shield/helpers" src/
grep -rn "tesselation/hex/generator\|tesselation/hex/adjuster\|tesselation/hex/helpers" src/
grep -rn "tesselation/box/generator" src/
```

Expected: only the pattern-registry and the snapshot tests inside the same directory. Redirect any external consumers to the new `tesselation/shared/` module.

## Testing

### Pre-migration snapshot capture

Run existing snapshot tests first to establish a baseline:

```bash
npx jest src/lib/patterns/tesselation --no-coverage
```

Confirm all pass before changing anything.

### New shared-module unit tests

`tesselation/shared/__tests__/generator.test.ts`:

- Each PathSegment command through `scaleSegment` (M, L, Q, C, A, Z).
- `firstColumn` only appears when `c === 0`; `lastColumn` only when `c === columns - 1`.
- Output ordering: `[...starts, ...middles, ...ends]`.
- Empty `start` / `end` groups (box case) produce empty buckets but valid total output.
- Undefined `firstColumn` / `lastColumn` (default shield/box case) does not throw.

`tesselation/shared/__tests__/adjuster.test.ts`:

- `withinBand` replacement fires with retargeted indices.
- `endsTrimmed: true` removes start-group from first facet and end-group from last facet.
- `endsTrimmed: true` is a no-op for empty start/end (box).
- `endLooped` truthy triggers wrap-around replacement on the last facet.

### Snapshot re-baselining

- **Shield** — expected byte-identical. Run without `-u`; investigate any mismatches before re-baselining.
- **Box** — expected byte-identical (generator logic equivalent; no adjuster).
- **Hex** — deliberate re-baseline with `-u`. Document the expected coordinate shifts in the commit message (one-directional pinning vs. bidirectional).

### Verification at end of implementation

```bash
npx jest src/lib/patterns/tesselation --no-coverage
npm run test:unit
npm run check 2>&1 | grep -E "error TS" | wc -l   # confirm at or below ~427 baseline
```

### Smoke check

Open `/designer2`, cycle through Shield / Hex / Box in the TilingControl picker. Vary `rowCount`, `columnCount`, `endsTrimmed`, `endsMatched`, `endLooped`. Confirm:

- Shield and Box are visually unchanged.
- Hex's `endLooped > 0` produces band-wrap behavior (regression vs. prior facet-duplication is expected and was approved in the design).
- Hex's stem-pinning between facets is continuous (no visible breaks at facet boundaries).

## Trade-offs and known regressions

- **+** Single generator, single adjuster, three specs. Mechanical coalescence achieved.
- **+** TileEditor's `supportsEditing: true` becomes meaningful for hex and box.
- **+** New built-in patterns can be added as pure data.
- **−** Hex's `endLooped > 0` behavior changes from facet-duplication to band-wrap. Saved hex configs using that flag will render differently. Approved in design discussion.
- **−** Hex snapshot tests require a single re-baseline. Geometric result remains continuous; coordinate values may shift sub-pixel.
- **−** This is a larger change than Phase 6 — it touches the adjuster contract, not just the generator.

## Out of scope

- Generalizing `invertGroup` to non-M/L commands. Shield doesn't currently invert in the registry; if a future pattern needs C/Q/A inversion, address it then.
- Migrating tristar, carnation, bowtie, grid, panel, or branched patterns into the data-driven model. These still live outside `tesselation/` and use the legacy `pattern-definitions.ts` dispatch.
- Changing `shades-config.ts` defaults. The `tiledPatternConfigs` map is untouched.
