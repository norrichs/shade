# Merge Pattern + Label Paths On "Prepare Download" — Design

## Goal

Add a user-triggered action that merges each outlined-band's outline with its self-tag label into a single continuous SVG path, with the result visible on-screen as a preview before download. Manufacturing output (Download SVG) gets a single closed contour per band instead of a band path + a separate label path — one continuous cut.

## User flow

1. User configures an outlined pattern with `selfTag` labels enabled.
2. Bands render as today: band outline as one `<path>`, label outline as a separate `<path>` per band.
3. User clicks **Prepare Download** in NavHeader. The on-screen rendering swaps: each eligible band now shows a single merged contour where the label's stem and body extrude from the band outline. Label text continues to render on top.
4. User verifies on-screen.
5. User clicks **Download SVG**. The current DOM (now containing merged paths) is serialized and downloaded.
6. If user clicks Download SVG without preparing first, the prepare step runs automatically as a synchronous prelude to the download.
7. If user changes pattern config after preparing, the merged-state is invalidated and rendering reverts to separate paths. User must re-prepare.

## Out of scope

- Tiled-pattern bands (no merge applied; tiled label rendering unchanged).
- End-cap labels (only `endIsStartCap === true` labels are merged, per the existing `tagAnchorAutoAngle` population).
- Partner/external labels — future work, not started.
- Background recomputation while user edits — invalidation, not live merging.

## Eligibility (per band)

A band is "merge-eligible" when ALL of these are true at prepare time:
- `patternConfigStore.patternTypeConfig.type === 'outlined'`
- `labels.selfTag.enabled === true`
- `band.tagAnchorAutoAngle !== undefined` (computed in `generateOutlinedBandPattern` for start caps)
- `band.facets[0]?.path` exists and is non-empty

Bands failing any check are skipped silently — they render with their original `band.svgPath`.

## State (new store module)

`src/lib/stores/mergedPathStore.ts`:

```ts
export type LabelTextDims = { width: number; height: number };

// Per-band merged path. Presence of an entry = "this band's merge is prepared".
// Empty map = "not prepared".
export const mergedBandPaths: Writable<Map<string, PathSegment[]>>;

// Per-band measured label-text bbox, written by PatternLabel after getBBox()
// settles. Read by prepareMergedPaths() to size the label outline accurately.
export const labelTextDimensions: Writable<Map<string, LabelTextDims>>;
```

No separate `isPrepared` flag. Emptiness of `mergedBandPaths` is the signal.

### Invalidation

A central `$effect` (lives in NavHeader or a small invalidation module) watches:
- `superGlobuleStore` (band geometry changes → outlines change)
- `patternConfigStore.patternTypeConfig.type` (switching outlined ↔ tiled)
- `patternConfigStore.patternTypeConfig.labels.selfTag` (radius, padding, stemLength, stemWidth, height, angle — all affect label outline shape)

On any change, clear `mergedBandPaths`. `labelTextDimensions` is also cleared (measurements rebuild reactively as PatternLabels re-render).

## Pure modules (extracted/new)

### `src/lib/cut-pattern/label-outline-path.ts`

```ts
export type LabelOutlineInput = {
	measuredWidth: number;
	measuredHeight: number;
	radius: number;
	padding: number;
	stemLength: number;
	stemWidth: number;
};

/**
 * Build the label outline (stem + body) in label-local coords with the stem
 * tip at (0, 0). Mirrors the geometry currently inline in PatternLabel's
 * getLabelPathSegments.
 */
export const buildLabelOutlinePath = (input: LabelOutlineInput): PathSegment[];
```

Extracted verbatim from `PatternLabel.svelte`'s current path-building. PatternLabel imports and uses it (replaces the inline function).

### `src/lib/cut-pattern/transform-label-outline.ts`

```ts
/**
 * Apply rotation around origin, then translation, to a label outline path.
 * Matches the SVG transform pipeline `translate(anchor) rotate(angle)`
 * which is applied right-to-left (rotate first, then translate).
 *
 * `effectiveAngleRad` is in radians (NOT degrees).
 */
export const transformLabelOutlineToBandSpace = (
	localPath: PathSegment[],
	renderAnchor: { x: number; y: number },
	effectiveAngleRad: number
): PathSegment[];
```

Implementation: `translatePS(rotatePS(localPath, effectiveAngleRad), renderAnchor.x, renderAnchor.y)`. `rotatePS` and `translatePS` already exist in `$lib/patterns/utils`.

## Action module

### `src/lib/cut-pattern/prepare-merge.ts`

```ts
/**
 * For each merge-eligible band, compute the merged outline+label contour and
 * write it to mergedBandPaths. Idempotent — running twice with the same state
 * produces the same result.
 *
 * Reads from: superGlobuleStore, patternConfigStore, labelTextDimensions.
 * Writes to: mergedBandPaths.
 *
 * Bands without measured text dims yet fall back to FALLBACK_WIDTH/HEIGHT —
 * the result is approximate but doesn't crash. (User can re-prepare after
 * everything has rendered for an accurate merge.)
 */
export const prepareMergedPaths = (): void;
```

Algorithm per band:
1. `localPath = buildLabelOutlinePath({ measuredWidth, measuredHeight, radius, padding, stemLength, stemWidth })`
2. Compute `effectiveAngle = (band.tagAngle ?? labels.selfTag.angle ?? 0) + band.tagAnchorAutoAngle`
3. Compute `renderAnchor = band.tagAnchorPoint - (cos θ, sin θ) · stemWidth/2`
4. `bandSpacePath = transformLabelOutlineToBandSpace(localPath, renderAnchor, effectiveAngle)`
5. `merged = mergeOutlineWithLabel(band.facets[0].path, bandSpacePath)` — note: `mergeOutlineWithLabel` already wraps `unitePaths` from `$lib/paper`
6. `mergedBandPaths.update(m => new Map(m).set(band.id, merged))`

If the result has more than one contour (warning from `mergeOutlineWithLabel`), still store it — the user will see a non-merged result on-screen and can investigate. Don't throw.

## Component changes

### `src/components/cut-pattern/PatternLabel.svelte`

Two changes:

1. Replace the inline `getLabelPathSegments` with a call to `buildLabelOutlinePath` from `$lib/cut-pattern/label-outline-path`. (Pure extraction; behavior unchanged.)
2. Add a new `bandId?: string` prop to PatternLabel. BandComponent passes `bandId={band.id}` alongside the existing `id` prop. (`id` is used for the DOM element id; `bandId` is the key for the merged-state stores.) After measurement settles, write the measured dims to `labelTextDimensions`:
   ```ts
   $effect(() => {
   	if (textMeasured && bandId) {
   		labelTextDimensions.update((m) => {
   			const next = new Map(m);
   			next.set(bandId, { width: textBbox.width, height: textBbox.height });
   			return next;
   		});
   	}
   });
   ```
3. When `bandId && $mergedBandPaths.has(bandId)`, hide the standalone outline `<path d={path}>` (use an `{#if}` guard around the path element). LabelText still renders. This keeps the outline DOM element absent from the SVG entirely while merged, so the export doesn't include a stale label-outline copy alongside the merged contour.

### `src/components/cut-pattern/BandCutPatternComponent.svelte`

In the `renderAsSinglePath=true` branch, swap the `d` attribute when a merged path exists:

```svelte
<path
	d={$mergedBandPaths.has(band.id)
		? svgPathStringFromSegments($mergedBandPaths.get(band.id)!)
		: band.svgPath}
	...
/>
```

No prop changes — the swap is internal to the component.

### `src/components/nav-header/NavHeader.svelte`

Add a "Prepare Download" button immediately before the "Download SVG" button:

```svelte
<Button onclick={() => prepareMergedPaths()}>Prepare Download</Button>
<Button
	onclick={() => {
		if ($mergedBandPaths.size === 0) prepareMergedPaths();
		downloadSvg('pattern-svg', `globule-pattern ${$superGlobuleStore.name}.svg`);
	}}
>Download SVG</Button>
```

Also add the invalidation `$effect` here:

```ts
$effect(() => {
	void $superGlobuleStore;
	void $patternConfigStore.patternTypeConfig.type;
	void $patternConfigStore.patternTypeConfig.labels?.selfTag;
	mergedBandPaths.set(new Map());
});
```

(The `void` reads register the effect's dependency on these stores. The body clears the map.)

## Data flow recap

```
Render time (today's behavior, no merge):
  CutPatternRenderer
    → BandComponent
      → BandCutPatternComponent renders <path d={band.svgPath}>
      → PatternLabel renders <path d={labelOutline}> + LabelText
        → after bbox settles, writes labelTextDimensions[band.id]

User clicks "Prepare Download":
  prepareMergedPaths()
    → for each eligible band:
      → buildLabelOutlinePath(measured dims + config)
      → transformLabelOutlineToBandSpace(local, renderAnchor, θ)
      → mergeOutlineWithLabel(band.facets[0].path, transformed)
      → mergedBandPaths.set(band.id, merged)

Render reacts to mergedBandPaths:
  BandCutPatternComponent renders merged d= instead of band.svgPath
  PatternLabel hides standalone outline (text still renders)

User clicks "Download SVG":
  if mergedBandPaths is empty → prepareMergedPaths() first
  downloadSvg('pattern-svg', filename)
    → serializes current DOM (now contains merged paths) → file

User changes config:
  $effect in NavHeader clears mergedBandPaths
  Components revert to non-merged rendering automatically
```

## Coordinate-space notes

- `band.facets[0].path` is in band-local coords (origin at the band's local 0,0). The wrapper `<g transform="translate(origin.x origin.y)">` in CutPatternRenderer places it in world. Merging happens in band-local space.
- `band.tagAnchorPoint` is in band-local coords (it's the start-cap edge midpoint, possibly shifted by tabWidth).
- The label outline (built by `buildLabelOutlinePath`) is in label-local coords (stem tip at origin).
- `transformLabelOutlineToBandSpace` lifts the label outline from label-local to band-local coords, applying `rotate(θ)` then `translate(renderAnchor)` — the same transform PatternLabel applies via its SVG wrapper.

## Failure modes

- **Text not measured at prep time.** Use fallback dims (`FALLBACK_WIDTH = 350`, `FALLBACK_HEIGHT = 280` — same as PatternLabel's existing fallbacks). Result is approximate; user can re-prep after labels have rendered.
- **Merge produces multiple contours.** This indicates the label outline doesn't touch the band outline (positioning bug). Store the result anyway; the on-screen preview will show the discrepancy and the merge function logs a `console.warn`.
- **Worker is mid-computation when user prepares.** Bands may be empty or stale. The prep operates on whatever is in the store at the moment. If the worker finishes later and bands update, the invalidation `$effect` will clear the merged map automatically — user re-preps.

## Testing strategy

- **Pure modules** (`label-outline-path.ts`, `transform-label-outline.ts`) — unit tested with concrete inputs and known expected outputs.
- **`prepare-merge.ts`** — unit tested by mocking the input stores and asserting on the resulting `mergedBandPaths`. Verify eligibility filtering (tiled bands skipped, no-autoAngle bands skipped) and fallback-dims behavior.
- **NavHeader integration** — manual visual verification: click Prepare, confirm on-screen render swaps; click Download, confirm file contains merged paths.
- **Invalidation** — manual: prepare, then tweak `selfTag.padding` in LabelEditor, confirm rendering reverts to separate paths until re-prepared.

## Migration / backwards compatibility

- Tiled-pattern bands: untouched. No `tagAnchorAutoAngle`, never become eligible, never get a merged path.
- Outlined bands without self-tag enabled: untouched.
- Existing saved configs: no schema change. The new stores are runtime-only.
- The `Download SVG` button preserves its current single-click semantics — auto-prep means existing user workflow still works.

## Files summary

| File | Action |
|---|---|
| `src/lib/stores/mergedPathStore.ts` | New — two writable maps |
| `src/lib/cut-pattern/label-outline-path.ts` | New — pure outline builder |
| `src/lib/cut-pattern/transform-label-outline.ts` | New — pure transform |
| `src/lib/cut-pattern/prepare-merge.ts` | New — action that populates `mergedBandPaths` |
| `src/lib/cut-pattern/__tests__/label-outline-path.test.ts` | New — pure module tests |
| `src/lib/cut-pattern/__tests__/transform-label-outline.test.ts` | New — pure module tests |
| `src/lib/cut-pattern/__tests__/prepare-merge.test.ts` | New — eligibility + behavior tests |
| `src/components/cut-pattern/PatternLabel.svelte` | Modify — use extracted outline builder, add `bandId` prop, write to `labelTextDimensions`, hide outline when merged |
| `src/components/cut-pattern/BandComponent.svelte` | Modify — pass `bandId={band.id}` to `<PatternLabel>` |
| `src/components/cut-pattern/BandCutPatternComponent.svelte` | Modify — swap `d=` to merged path when available |
| `src/components/nav-header/NavHeader.svelte` | Modify — add Prepare Download button, modify Download SVG handler, add invalidation `$effect` |
