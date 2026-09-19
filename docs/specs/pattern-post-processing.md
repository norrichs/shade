# Pattern post processing feature

## Sequencing

This work targets the "prepare for download" pipeline. That pipeline is currently being refactored so that it is run by parallel workers.
The feature described below must integrate with those changes, which are currently in-flight.
Integration may be plannable based on plan documents rather than finished code.

That would especially be true if the new architecture takes the existing functions and wraps it in a worker orchestration layer without alteration.

Documents:
(ask for them if not here yet)

## Features

### Current feature, at a high level

Tiled patterns are processed by prepare for download to convert stroke-widthed paths into paths that outline what would be the rendered strokes. Then they are merged, along with label outlines, yielding single path elements. Those merged paths will include geometry composing an outline as well as internal holes.
Outlined patterns are also processed. This is simpler because generally only the merging is required, not the path-stroke-outlining

### Drop internal holes

We will provide an affordance for dropping the internal holes from merged tiled patterns.

Basic architecture:

- identify all internal holes
- assign each hole a value 0-1 indicating it's fractional distance from the end of the band. Distance from the end is defined by finding the centroid of the hole and measuring it's distance from the start of the band, and dividing that from the total length of the band. This assignment must account for split patterns. (e.g. if a pattern is split into 3 equal parts, a hole located at the center of the second piece would have a distance fraction value of 0.5. A hole located 1/3 of the way along the 3rd band would have a value of 7/9 (0.777778) )

A few options we'll provide:

- drop all holes
- randomly drop holes (user will provide a numerical config value with range 0 - 1, indicating chance that any single hole is dropped)
- variable chance randomly drop holes depending on each hole's position along the band. In this case the config will be a bezier curve. (curve is constrained / clamped to x values 0 - 1 and y values 0-1)

### UI

New floating editior / floating button to configure the prepare for download process

A select with label "Drop internal holes", and options:

- none (default)
- drop all
- randomly drop
- variably drop

Depending on the selection, render inputs to configure

- randomly drop: numerical input

## Integration with the worker pool architecture

The in-flight refactor moves "prepare for download" onto a pool of workers that merge
bands in parallel. It does wrap the existing merge functions without altering them, so
this feature is plannable from that design. Four constraints on it come from this spec,
and are being built into the pool work rather than retrofitted.

### The per-band worker task is a staged pipeline

The unit of work a pool worker runs is a named-stage pipeline, not a single function:

```
workerTask(payload, ctx):
   stage 1  mergeBand(payload, ctx)        ← the existing merge, unaltered
   stage 2  postProcessBand(merged, ctx)   ← hole dropping, and whatever follows
```

Hole dropping lands as stage 2. It requires no change to the pool, the message protocol,
or the payload plumbing.

### Band payloads carry their span within the parent band

Split-aware hole fractions are the reason. A piece knows its own `parentQuadOffset` and
`quadCount`, but not its parent band's total quad count — that is only derivable by
summing sibling pieces, which only the main thread sees, because a worker is handed one
band in isolation.

So payload extraction computes each piece's span at extraction time and ships it:

```
{ pieceStartFraction, pieceEndFraction }
```

A hole's fraction along the parent band is then
`pieceStartFraction + localFraction * (pieceEndFraction - pieceStartFraction)`, which
yields the values in the Features section above: a hole at the centre of piece 2 of 3
gives 0.5, and a hole a third of the way along piece 3 gives 7/9.

### Randomness is seeded per band, never `Math.random()`

In a pool, `Math.random()` would produce a different pattern on every prepare, and —
because which worker handles which band varies with scheduling — a different pattern
between two otherwise identical runs. That is unacceptable for output that gets cut on a
machine.

Each band payload therefore carries a `seed` derived from `runSeed + band.id`, and
stage 2 uses a seeded PRNG. Results become reproducible and independent of how the pool
happened to schedule the work. Bumping `runSeed` is then a natural "reroll" affordance.

### Post-process config changes must not re-run the union

Stage 1 is the expensive part (stroke expansion plus boolean union, seconds). Stage 2 is
cheap. Nudging a drop-chance value must not pay for stage 1 again.

The merged result is therefore kept in its own store, and the post-processed output
derives from it:

```
geometry/label change ──▶ stage 1 (pool, seconds) ──▶ mergedBandPathsRaw
hole config change    ──▶ stage 2 (inline, ms)    ──▶ mergedBandPaths ──▶ render
```

Only a geometry or label change invalidates stage 1. Hole config changes re-run stage 2
alone, fast enough to run inline without involving the pool at all.

### Two notes for the UI work

- Ship the variable-drop bezier to stage 2 as a **sampled lookup table of plain numbers**,
  not a bezier-js instance. Then the worker never needs the library, and the config stays
  trivially structured-cloneable.
- Keep the new floating editor's config in a **module store, not component state**. Floater
  panel content fully remounts on close and on switching panels, so panel-local state is
  wiped.

(NOTE: from )