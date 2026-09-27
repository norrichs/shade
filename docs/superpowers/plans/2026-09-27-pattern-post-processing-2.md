# Pattern Post-Processing 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag every exported cut path with a geometry type mapped to a LightBurn layer, add disconnect/connect-surround cuts and page labels, and export either a millimetre-true SVG or a `.lbrn2` project whose CutSettings come from a template captured on the cutting machine.

**Architecture:** Stage 1b (worker) grows from a hole index into a full contour index (kind per contour, band axis and ends). Stage 2 (main thread, ms) emits `TaggedPath[]` per band and inserts outline gaps. A new pure stage 3 at render time computes disconnect segments and page-label placement from the page layout. Every producer writes `data-geometry` and a mapped stroke; the exporters read only those tags.

**Tech Stack:** SvelteKit (Svelte 5 runes + some Svelte 4 `$:`), TypeScript, Jest (ts-jest, node env), Playwright, paper.js (existing merge), svelte stores.

**Spec:** `docs/superpowers/specs/2026-09-27-pattern-post-processing-2-design.md` — read it before any task.

## Global Constraints

- Units: SVG export user unit = 1 mm (`width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"`, content wrapped in `scale(1/pageScale) translate(-minX -minY)`); `.lbrn2` coordinates in mm, Y up.
- LightBurn palette hex values are exactly the research table (`docs/specs/lightburn-export-research.md` §1). Layer indexes: C00–C29 → 0–29, T1 → 30, T2 → 31. Tool layers (T1/T2) get no `<CutSetting>`.
- `DEFAULT_LAYER_MAP`: pattern-outline, pattern-hole, surround-disconnect → C00; outline-gap → C01; label-text, page-label → C02; page-outline → T1.
- Filenames: `${name?.trim() || 'untitled'} - YYYY-MM-DD HH.mm.ss` (local time), `.svg` / `.lbrn2`; CSV is `${stamp} pattern-map.csv`.
- Page label string: `[text, configName && name, pageNumber && `${i + 1} of ${n}`].filter(Boolean).join(' - ')`.
- Connect-surround default `gapMm: 1.5`; validated into `[0.1, 20]`.
- Disconnect cone ±30° (`DISCONNECT_CONE_DEG`), 2° steps (`DISCONNECT_STEP_DEG`).
- Stage 2 and 3 never call `Math.random()`; hole dropping stays seeded as today.
- `postProcess` stays OUT of NavHeader's invalidation key: no new control may re-run the merge.
- All new `PostProcessConfig` fields optional; absent = off/default; no migration.
- Worker/geometry edits: restart the dev server before browser checks (Vite does not rebuild workers on reload).
- **Git safety for every agent:** never `git stash`, `git checkout <file>`, `git reset`, `git revert`, or rebase-drop. Commit only files your task names. Other sessions commit on this branch; never touch commits you did not author.
- Baselines: `npx jest` → 174 suites / 1523 tests passing, 101 snapshots. Record `npm run check` error count before Task 1 and do not increase it.

## Review Focus

1. **Label text containing glyphs the font lacks** (e.g. a config name with `é` or an emoji): `getChars` throws on unknown characters and would crash the render. Expected: unknown characters render as `?`. Pinned in Task 7 (`sanitizeLabelText`).
2. **Connect-surround gap longer than half the outline, or two ends closer than one gap** (tiny split piece): expected no crash, overlapping windows merge, and a gap ≥ half the contour length is skipped so the piece is not cut away. Pinned in Task 6.
3. **A band that overlaps a neighbour or sits outside every page** (overflow, rotated skyline item): expected no disconnect from inside another outline, no ray from off-page points, and no NaN coordinates. Pinned in Task 5.
4. **Export with nothing prepared, or with a stray untagged element** (tiled pattern never prepared; a new debug overlay): expected download auto-prepares for both pattern types, and an untagged path blocks the download with a toast naming it. Pinned in Tasks 4 and 12.
5. **LightBurn template with no or partial CutSettings, or a non-LightBurn file uploaded**: expected export still succeeds with minimal CutSettings and a warning listing missing layers; an unparseable upload is rejected with a message and the previous template kept. Pinned in Tasks 8 and 11.

---

## Execution waves

| Wave | Tasks | Mode |
| ---- | ----- | ---- |
| 0 | 1 → 2 → 3 → 4 | sequential, on the working branch |
| 1 | 5, 6, 7, 8, 9 | **parallel**, one worktree each, merged back in any order |
| 2 | 10, 11, 12 | **parallel**, one worktree each |
| 3 | 13 | sequential: Playwright, full verification |

Wave 1 and 2 tasks touch disjoint files by construction (see each task's **Files**). If a merge conflicts, stop and report; do not resolve by discarding another task's work.

## File map

| File | Task | Responsibility |
| ---- | ---- | -------------- |
| `src/lib/cut-pattern/post-process-types.ts` | 1 | `GeometryType`, `TaggedPath`, band-end and stage-3 types |
| `src/lib/lightburn/layers.ts` | 1 | 32-layer palette, default map, stroke resolution |
| `src/lib/lightburn/types.ts` | 1 | `LbProject` / `LbShape` |
| `src/lib/cut-pattern/hole-drop-config.ts` | 1 | new `PostProcessConfig` fields |
| `src/lib/validators.ts` | 1 | validate new fields |
| `src/lib/stores/mergedPathStore.ts` | 1, 2, 3, 6 | `layerStrokes`; contour index rename; tagged output; pageScale |
| `src/lib/stores/exportStores.ts` | 1 | `exportPagesStore`, `lightburnTemplateStore` |
| `src/lib/cut-pattern/path-contours.ts` | 2 | `flattenPath` |
| `src/lib/cut-pattern/contour-index.ts` (renamed from `hole-index.ts`) | 2 | contour kinds, axis, ends |
| `src/lib/workers/band-merge-worker-core.ts`, `band-merge-pool.ts` | 2 | carry `contours` |
| `src/components/nav-header/NavHeader.svelte` | 2, 12 | publish contours; downloads |
| `src/lib/cut-pattern/drop-holes.ts` | 3, 6 | `TaggedPath[]` output; gap wiring |
| `src/components/cut-pattern/BandCutPatternComponent.svelte` | 3 | render tagged pieces |
| `src/lib/cut-pattern/export-guard.ts` | 4 | untagged-element check |
| `SvgText.svelte`, `LabelText.svelte`, `OnTabLabel.svelte`, `PatternLabel.svelte`, `PageGeometry.svelte` | 4 | tag producers |
| `src/lib/cut-pattern/page-post-process/disconnect.ts` | 5 | disconnect search |
| `src/lib/cut-pattern/page-post-process/segments.ts` | 5 | ray/segment geometry helpers |
| `src/lib/cut-pattern/outline-gap.ts` | 6 | arc-length gap split |
| `src/lib/cut-pattern/page-post-process/page-label.ts` | 7 | label text, measurement, placement |
| `src/lib/lightburn/lbrn2-path.ts`, `lbrn2-writer.ts`, `template.ts` | 8 | `.lbrn2` serialisation |
| `src/lib/download/file-stamp.ts`, `export-frame.ts`, `parse-path-d.ts`, `src/lib/lightburn/build-lb-project.ts` | 9 | naming, mm frame, `d` parsing, shapes → `LbProject` |
| `src/lib/cut-pattern/page-post-process/index.ts`, `place-bands.ts`, `src/components/cut-pattern/PageAnnotations.svelte`, `CutPatternRenderer.svelte` | 10 | stage 3 wiring and render |
| `src/components/modal/editor/PostProcess.svelte` | 11 | controls |
| `src/lib/util.ts`, `src/lib/lightburn/collect-dom-shapes.ts` | 12 | export plumbing |
| `tests/post-process-2.spec.ts`, `tests/hole-drop.spec.ts` | 3, 13 | Playwright |

---

## Task 1: Geometry types, LightBurn palette, config fields, export stores

**Files:**
- Create: `src/lib/cut-pattern/post-process-types.ts`
- Create: `src/lib/lightburn/layers.ts`
- Create: `src/lib/lightburn/types.ts`
- Create: `src/lib/stores/exportStores.ts`
- Modify: `src/lib/cut-pattern/hole-drop-config.ts` (extend `PostProcessConfig`)
- Modify: `src/lib/validators.ts` (the `// Hole-drop post-processing.` block in `migrateGlobulePatternConfig`, ~line 100)
- Modify: `src/lib/stores/mergedPathStore.ts` (add `layerStrokes`)
- Modify: `src/lib/stores/index.ts` (export `exportStores`)
- Test: `src/lib/lightburn/__tests__/layers.test.ts`, `src/lib/__tests__/post-process-config.test.ts` (extend)

**Interfaces:**
- Produces: everything in `post-process-types.ts`, `layers.ts`, `lightburn/types.ts` below, verbatim; `PostProcessConfig` new fields; `layerStrokes: Readable<Record<GeometryType, string>>`; `exportPagesStore: Writable<ExportPages | null>`; `lightburnTemplateStore: Writable<LightburnTemplate | null>`.

- [ ] **Step 1: Record the `npm run check` baseline**

Run: `npm run check 2>&1 | tail -3`
Note the error and warning counts in the task report; later tasks must not increase them.

- [ ] **Step 2: Write the failing palette test**

`src/lib/lightburn/__tests__/layers.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import {
	LIGHTBURN_LAYERS,
	DEFAULT_LAYER_MAP,
	layerStroke,
	resolveLayer,
	isLayerId,
	layerOptionLabel
} from '../layers';
import { GEOMETRY_TYPES } from '$lib/cut-pattern/post-process-types';

describe('LightBurn layers', () => {
	it('has all 32 layers with unique ids and indexes', () => {
		expect(LIGHTBURN_LAYERS).toHaveLength(32);
		expect(new Set(LIGHTBURN_LAYERS.map((l) => l.id)).size).toBe(32);
		expect(new Set(LIGHTBURN_LAYERS.map((l) => l.index)).size).toBe(32);
	});

	it('uses the exact palette values', () => {
		const hex = Object.fromEntries(LIGHTBURN_LAYERS.map((l) => [l.id, l.hex]));
		expect(hex.C00).toBe('#000000');
		expect(hex.C01).toBe('#0000FF');
		expect(hex.C02).toBe('#FF0000');
		expect(hex.C29).toBe('#FFDB66');
		expect(hex.T1).toBe('#F36926');
		expect(hex.T2).toBe('#0C96D9');
	});

	it('indexes C00–C29 as 0–29 and tool layers as 30 and 31', () => {
		const idx = Object.fromEntries(LIGHTBURN_LAYERS.map((l) => [l.id, l.index]));
		expect(idx.C00).toBe(0);
		expect(idx.C29).toBe(29);
		expect(idx.T1).toBe(30);
		expect(idx.T2).toBe(31);
	});

	it('maps every geometry type by default', () => {
		for (const t of GEOMETRY_TYPES) expect(isLayerId(DEFAULT_LAYER_MAP[t])).toBe(true);
		expect(layerStroke('pattern-outline')).toBe('#000000');
		expect(layerStroke('outline-gap')).toBe('#0000FF');
		expect(layerStroke('page-outline')).toBe('#F36926');
	});

	it('prefers the configured layer over the default', () => {
		expect(resolveLayer('pattern-hole', { 'pattern-hole': 'C05' }).id).toBe('C05');
		expect(layerStroke('pattern-hole', { 'pattern-hole': 'C05' })).toBe('#FF8000');
	});

	it('formats option labels as id · color · function', () => {
		expect(layerOptionLabel(resolveLayer('outline-gap'))).toBe('C01 · blue · skip');
	});
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx jest src/lib/lightburn/__tests__/layers.test.ts`
Expected: FAIL — cannot find module `../layers`.

- [ ] **Step 4: Create `post-process-types.ts`**

```ts
import type { PathSegment } from '$lib/types';

export type Pt = { x: number; y: number };

/**
 * What a piece of exported geometry IS, assigned by whatever produces it.
 * Nothing downstream infers a type from color or shape; the layer mapping and
 * both exporters read only this tag (`data-geometry` in the DOM).
 */
export const GEOMETRY_TYPES = [
	'pattern-outline',
	'pattern-hole',
	'outline-gap',
	'surround-disconnect',
	'label-text',
	'page-label',
	'page-outline'
] as const;
export type GeometryType = (typeof GEOMETRY_TYPES)[number];

export const GEOMETRY_TYPE_LABELS: Record<GeometryType, string> = {
	'pattern-outline': 'Pattern outlines',
	'pattern-hole': 'Pattern holes',
	'outline-gap': 'Outline gaps',
	'surround-disconnect': 'Surround disconnects',
	'label-text': 'Label text',
	'page-label': 'Page labels',
	'page-outline': 'Page outlines'
};

export const isGeometryType = (v: unknown): v is GeometryType =>
	typeof v === 'string' && (GEOMETRY_TYPES as readonly string[]).includes(v);

/** One stroked piece of a band's prepared output. `contour` indexes `BandContourIndex.contours`. */
export type TaggedPath = { geometry: GeometryType; segments: PathSegment[]; contour?: number };

/** A band end, band-local. `outward` is a unit vector pointing away from the band. */
export type BandEnd = { point: Pt; outward: Pt };
export type BandEnds = { start: BandEnd; end: BandEnd };

/** Same semantics as `bandTransform(origin, rotation, pivot)`: rotate about pivot, then translate. */
export type Placement = { origin: Pt; rotation: number; pivot: Pt };

/** A prepared band in PAGE space, as stage 3 sees it. Polylines are closed or open point runs. */
export type PlacedBand = {
	bandId: string;
	page: number;
	outlines: Pt[][];
	holes: Pt[][];
	ends?: BandEnds;
};

export type Disconnect = {
	page: number;
	a: Pt;
	b: Pt;
	fromBand: string;
	/** Band the ray hit, or null when it hit the page edge. */
	toBand: string | null;
};

export type PageLabelResult = {
	page: number;
	text: string;
	/** SvgText anchor (glyph origin), page space. */
	origin: Pt;
	/** SvgText `size`. */
	size: number;
	unplaced?: boolean;
};

export type PagePostProcessResult = { disconnects: Disconnect[]; pageLabels: PageLabelResult[] };
```

- [ ] **Step 5: Create `lightburn/layers.ts`**

```ts
import type { GeometryType } from '$lib/cut-pattern/post-process-types';

export const LAYER_IDS = [
	'C00', 'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09',
	'C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17', 'C18', 'C19',
	'C20', 'C21', 'C22', 'C23', 'C24', 'C25', 'C26', 'C27', 'C28', 'C29',
	'T1', 'T2'
] as const;
export type LayerId = (typeof LAYER_IDS)[number];

export type LightBurnLayer = {
	id: LayerId;
	/** CutIndex in a .lbrn2 file. */
	index: number;
	/** Exact LightBurn palette value; near colors mis-match on import. */
	hex: string;
	colorName: string;
	/** Hard-coded meaning in Ben's LightBurn setup. Edit here to rename. */
	functionName: string;
};

const layer = (
	id: LayerId,
	index: number,
	hex: string,
	colorName: string,
	functionName: string
): LightBurnLayer => ({ id, index, hex, colorName, functionName });

export const LIGHTBURN_LAYERS: readonly LightBurnLayer[] = [
	layer('C00', 0, '#000000', 'black', 'cut'),
	layer('C01', 1, '#0000FF', 'blue', 'skip'),
	layer('C02', 2, '#FF0000', 'red', 'score'),
	layer('C03', 3, '#00E000', 'green', 'engrave'),
	layer('C04', 4, '#D0D000', 'yellow', 'light cut'),
	layer('C05', 5, '#FF8000', 'orange', 'perforate'),
	layer('C06', 6, '#00E0E0', 'cyan', 'unassigned'),
	layer('C07', 7, '#FF00FF', 'magenta', 'unassigned'),
	layer('C08', 8, '#B4B4B4', 'light grey', 'unassigned'),
	layer('C09', 9, '#0000A0', 'dark blue', 'unassigned'),
	layer('C10', 10, '#A00000', 'dark red', 'unassigned'),
	layer('C11', 11, '#00A000', 'dark green', 'unassigned'),
	layer('C12', 12, '#A0A000', 'olive', 'unassigned'),
	layer('C13', 13, '#C08000', 'ochre', 'unassigned'),
	layer('C14', 14, '#00A0FF', 'sky blue', 'unassigned'),
	layer('C15', 15, '#A000A0', 'purple', 'unassigned'),
	layer('C16', 16, '#808080', 'grey', 'unassigned'),
	layer('C17', 17, '#7D87B9', 'periwinkle', 'unassigned'),
	layer('C18', 18, '#BB7784', 'dusty rose', 'unassigned'),
	layer('C19', 19, '#4A6FE3', 'royal blue', 'unassigned'),
	layer('C20', 20, '#D33F6A', 'raspberry', 'unassigned'),
	layer('C21', 21, '#8CD78C', 'light green', 'unassigned'),
	layer('C22', 22, '#F0B98D', 'peach', 'unassigned'),
	layer('C23', 23, '#F6C4E1', 'pale pink', 'unassigned'),
	layer('C24', 24, '#FA9ED4', 'pink', 'unassigned'),
	layer('C25', 25, '#500A78', 'indigo', 'unassigned'),
	layer('C26', 26, '#B45A00', 'brown', 'unassigned'),
	layer('C27', 27, '#004754', 'dark teal', 'unassigned'),
	layer('C28', 28, '#86FA88', 'mint', 'unassigned'),
	layer('C29', 29, '#FFDB66', 'gold', 'unassigned'),
	layer('T1', 30, '#F36926', 'tool orange', 'page'),
	layer('T2', 31, '#0C96D9', 'tool blue', 'guide')
];

const BY_ID = new Map(LIGHTBURN_LAYERS.map((l) => [l.id, l]));
const BY_INDEX = new Map(LIGHTBURN_LAYERS.map((l) => [l.index, l]));

export const isLayerId = (v: unknown): v is LayerId =>
	typeof v === 'string' && BY_ID.has(v as LayerId);
export const layerById = (id: LayerId): LightBurnLayer => BY_ID.get(id)!;
export const layerByIndex = (index: number): LightBurnLayer | undefined => BY_INDEX.get(index);
/** Tool layers are never sent to the laser and carry no cut settings. */
export const isToolLayer = (l: LightBurnLayer): boolean => l.id === 'T1' || l.id === 'T2';

export type LayerMap = Partial<Record<GeometryType, LayerId>>;

export const DEFAULT_LAYER_MAP: Record<GeometryType, LayerId> = {
	'pattern-outline': 'C00',
	'pattern-hole': 'C00',
	'surround-disconnect': 'C00',
	'outline-gap': 'C01',
	'label-text': 'C02',
	'page-label': 'C02',
	'page-outline': 'T1'
};

export const resolveLayer = (type: GeometryType, map?: LayerMap): LightBurnLayer =>
	layerById(map?.[type] ?? DEFAULT_LAYER_MAP[type]);

export const layerStroke = (type: GeometryType, map?: LayerMap): string =>
	resolveLayer(type, map).hex;

export const layerOptionLabel = (l: LightBurnLayer): string =>
	`${l.id} · ${l.colorName} · ${l.functionName}`;
```

(Prettier will reflow `LAYER_IDS`; that is fine.)

- [ ] **Step 6: Create `lightburn/types.ts`**

```ts
import type { PathSegment } from '$lib/types';

/** Millimetres, Y up (LightBurn's frame). Paths contain only M, L, C, Z. */
export type LbPathShape = { kind: 'path'; cutIndex: number; segments: PathSegment[] };
/** `x`, `y` are the MIN corner in mm, Y up. The writer centres it for LightBurn. */
export type LbRectShape = {
	kind: 'rect';
	cutIndex: number;
	x: number;
	y: number;
	width: number;
	height: number;
};
export type LbShape = LbPathShape | LbRectShape;
/** One page = one LightBurn Group; its page rect is one of its shapes. */
export type LbPage = { shapes: LbShape[] };
export type LbProject = { pages: LbPage[] };
```

- [ ] **Step 7: Run the palette test to verify it passes**

Run: `npx jest src/lib/lightburn/__tests__/layers.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 8: Write failing config/validator tests**

Append to `src/lib/__tests__/post-process-config.test.ts`, inside the existing `describe`:

```ts
	const migratePP = (postProcess: Record<string, unknown>) =>
		migrateGlobulePatternConfig({
			patternConfig: { pageLayout: { keepConnected: 0 }, postProcess }
		} as unknown as GlobulePatternConfig).patternConfig?.postProcess as Record<string, unknown>;

	it('keeps valid post-processing 2 fields', () => {
		const pp = migratePP({
			dropHoles: { mode: 'none' },
			runSeed: 0,
			disconnectSurround: true,
			connectSurround: { enabled: true, gapMm: 2 },
			pageLabel: { pageNumber: true, configName: false, text: ' shade ' },
			layerMap: { 'outline-gap': 'C05' },
			downloadFormat: 'lbrn2'
		});
		expect(pp.disconnectSurround).toBe(true);
		expect(pp.connectSurround).toEqual({ enabled: true, gapMm: 2 });
		expect(pp.pageLabel).toEqual({ pageNumber: true, configName: false, text: 'shade' });
		expect(pp.layerMap).toEqual({ 'outline-gap': 'C05' });
		expect(pp.downloadFormat).toBe('lbrn2');
	});

	it('repairs malformed post-processing 2 fields', () => {
		const pp = migratePP({
			dropHoles: { mode: 'none' },
			runSeed: 0,
			disconnectSurround: 'yes',
			connectSurround: { enabled: 1, gapMm: 999 },
			pageLabel: { pageNumber: 'x', text: 5 },
			layerMap: { 'outline-gap': 'C99', bogus: 'C01', 'pattern-hole': 'T2' },
			downloadFormat: 'pdf'
		});
		expect('disconnectSurround' in pp).toBe(false);
		expect(pp.connectSurround).toEqual({ enabled: false, gapMm: 20 });
		expect(pp.pageLabel).toEqual({ pageNumber: false, configName: false, text: '' });
		expect(pp.layerMap).toEqual({ 'pattern-hole': 'T2' });
		expect('downloadFormat' in pp).toBe(false);
	});

	it('clamps a tiny or non-finite gap', () => {
		expect(migratePP({ dropHoles: { mode: 'none' }, runSeed: 0, connectSurround: { enabled: true, gapMm: 0 } }).connectSurround).toEqual({ enabled: true, gapMm: 0.1 });
		expect(migratePP({ dropHoles: { mode: 'none' }, runSeed: 0, connectSurround: { enabled: true, gapMm: NaN } }).connectSurround).toEqual({ enabled: true, gapMm: 1.5 });
	});
```

- [ ] **Step 9: Run to verify failure**

Run: `npx jest src/lib/__tests__/post-process-config.test.ts`
Expected: FAIL on the three new tests.

- [ ] **Step 10: Extend `PostProcessConfig`**

In `hole-drop-config.ts`, add imports and fields:

```ts
import type { LayerMap } from '$lib/lightburn/layers';

export type PageLabelConfig = { pageNumber: boolean; configName: boolean; text: string };
export type ConnectSurroundConfig = { enabled: boolean; gapMm: number };
export const DEFAULT_CONNECT_GAP_MM = 1.5;
```

and inside `PostProcessConfig`, after `dropLabelText`:

```ts
	/** Straight cuts from band ends to the page edge or a neighbour. Absent = false. */
	disconnectSurround?: boolean;
	/** One gap per band end in the outline, re-emitted as `outline-gap`. */
	connectSurround?: ConnectSurroundConfig;
	pageLabel?: PageLabelConfig;
	/** Geometry type → LightBurn layer. Absent entries use DEFAULT_LAYER_MAP. */
	layerMap?: LayerMap;
	downloadFormat?: 'svg' | 'lbrn2';
```

- [ ] **Step 11: Extend the validator**

In `validators.ts`, add imports at the top:

```ts
import { GEOMETRY_TYPES } from '$lib/cut-pattern/post-process-types';
import { isLayerId } from '$lib/lightburn/layers';
import { DEFAULT_CONNECT_GAP_MM } from '$lib/cut-pattern/hole-drop-config';
```

Change the optional-flag loop to include `disconnectSurround`:

```ts
			for (const flag of ['dropOutline', 'dropLabelText', 'disconnectSurround'] as const) {
```

and immediately after that loop add:

```ts
			if ('connectSurround' in pp) {
				const cs = pp.connectSurround as { enabled?: unknown; gapMm?: unknown } | null;
				if (!cs || typeof cs !== 'object') delete pp.connectSurround;
				else {
					const gap =
						typeof cs.gapMm === 'number' && Number.isFinite(cs.gapMm)
							? cs.gapMm
							: DEFAULT_CONNECT_GAP_MM;
					pp.connectSurround = {
						enabled: cs.enabled === true,
						gapMm: Math.min(20, Math.max(0.1, gap))
					};
				}
			}
			if ('pageLabel' in pp) {
				const pl = pp.pageLabel as Record<string, unknown> | null;
				if (!pl || typeof pl !== 'object') delete pp.pageLabel;
				else
					pp.pageLabel = {
						pageNumber: pl.pageNumber === true,
						configName: pl.configName === true,
						text: typeof pl.text === 'string' ? pl.text.trim() : ''
					};
			}
			if ('layerMap' in pp) {
				const lm = pp.layerMap as Record<string, unknown> | null;
				if (!lm || typeof lm !== 'object') delete pp.layerMap;
				else
					for (const key of Object.keys(lm)) {
						if (!(GEOMETRY_TYPES as readonly string[]).includes(key) || !isLayerId(lm[key]))
							delete lm[key];
					}
			}
			if ('downloadFormat' in pp && pp.downloadFormat !== 'svg' && pp.downloadFormat !== 'lbrn2')
				delete pp.downloadFormat;
```

If importing `hole-drop-config` from `validators.ts` creates an import cycle that breaks tests, inline `1.5` with a comment naming `DEFAULT_CONNECT_GAP_MM`.

- [ ] **Step 12: Run to verify pass**

Run: `npx jest src/lib/__tests__/post-process-config.test.ts`
Expected: PASS.

- [ ] **Step 13: Add `layerStrokes` and the export stores**

In `mergedPathStore.ts` add:

```ts
import { GEOMETRY_TYPES, type GeometryType } from '$lib/cut-pattern/post-process-types';
import { layerStroke } from '$lib/lightburn/layers';

/**
 * Stroke hex per geometry type, from the post-process layer map. Every exported
 * producer reads its stroke from here, so preview and export always agree.
 */
export const layerStrokes = derived(postProcessConfig, (config) =>
	Object.fromEntries(GEOMETRY_TYPES.map((t) => [t, layerStroke(t, config.layerMap)])) as Record<
		GeometryType,
		string
	>
);
```

Create `src/lib/stores/exportStores.ts`:

```ts
import { writable } from 'svelte/store';
import type { PageRect } from '$lib/cut-pattern/page-layout/types';

/**
 * The page rects of the current page layout, in pattern units, plus the scale.
 * Written by CutPatternRenderer (Task 10); read by the exporters (Task 12).
 * Null when the view is not in page layout mode.
 */
export type ExportPages = { pages: PageRect[]; pageScale: number };
export const exportPagesStore = writable<ExportPages | null>(null);

/**
 * The LightBurn template captured on the cutting machine. Machine-level, NOT
 * pattern config: it describes the cutter, not the design. Stored in
 * localStorage directly (the app's `persistable` is globally disabled).
 */
export type LightburnTemplate = { fileName: string; xml: string; loadedAt: string };
const TEMPLATE_KEY = 'shades-lightburn-template';

const readTemplate = (): LightburnTemplate | null => {
	try {
		if (typeof localStorage === 'undefined') return null;
		const raw = localStorage.getItem(TEMPLATE_KEY);
		return raw ? (JSON.parse(raw) as LightburnTemplate) : null;
	} catch {
		return null;
	}
};

export const lightburnTemplateStore = writable<LightburnTemplate | null>(readTemplate());
lightburnTemplateStore.subscribe((value) => {
	try {
		if (typeof localStorage === 'undefined') return;
		if (value) localStorage.setItem(TEMPLATE_KEY, JSON.stringify(value));
		else localStorage.removeItem(TEMPLATE_KEY);
	} catch {
		// Private mode or quota: the template simply is not remembered.
	}
});
```

Add `export * from '$lib/stores/exportStores';` to `src/lib/stores/index.ts`.

- [ ] **Step 14: Full unit run and type check**

Run: `npx jest 2>&1 | tail -5` → all pass (baseline + new).
Run: `npm run check 2>&1 | tail -3` → no more errors than baseline.

- [ ] **Step 15: Commit**

```bash
git add src/lib/cut-pattern/post-process-types.ts src/lib/lightburn src/lib/stores/exportStores.ts src/lib/stores/index.ts src/lib/stores/mergedPathStore.ts src/lib/cut-pattern/hole-drop-config.ts src/lib/validators.ts src/lib/__tests__/post-process-config.test.ts
git commit -m "feat(post-process): geometry types, LightBurn palette, config fields"
```

---

## Task 2: Contour index (stage 1b) with kinds, axis and ends

**Files:**
- Rename: `src/lib/cut-pattern/hole-index.ts` → `src/lib/cut-pattern/contour-index.ts` (`git mv`)
- Rename: `src/lib/cut-pattern/__tests__/hole-index.test.ts` → `contour-index.test.ts`
- Modify: `src/lib/cut-pattern/path-contours.ts` (add `flattenPath`)
- Modify: `src/lib/workers/band-merge-worker-core.ts`, `src/lib/workers/band-merge-pool.ts`
- Modify: `src/components/nav-header/NavHeader.svelte` (imports, `publish`, inline branch, invalidation)
- Modify: `src/lib/stores/mergedPathStore.ts` (`bandHoleIndexes` → `bandContourIndexes`)
- Modify: `src/lib/cut-pattern/drop-holes.ts` (read holes from contours; output shape unchanged in this task)
- Modify tests referencing `BandHoleIndex`/`buildHoleIndex`/`holes`: `drop-holes.test.ts`, `hole-drop-integration.test.ts`, `band-merge-worker-core.test.ts`, `band-merge-pool.test.ts`, `merged-path-store.test.ts`, `tube-pattern-characterization.test.ts`, `band-render-mode.test.ts` (find all with `grep -rlE "BandHoleIndex|buildHoleIndex|bandHoleIndexes|holes:" src`)

**Interfaces:**
- Consumes: `BandEnds`, `Pt` from Task 1.
- Produces:
  ```ts
  export type ContourKind = 'outline' | 'hole';
  export type ContourRef = { start: number; end: number; kind: ContourKind; depth: number; area: number; bandFraction?: number };
  export type BandContourIndex = { seed: number; contours: ContourRef[]; axis?: { origin: Pt; direction: Pt }; ends?: BandEnds };
  export const buildContourIndex = (path: PathSegment[], input: ContourIndexInput, patternType: string): BandContourIndex;
  export const holesOf = (index: BandContourIndex): (ContourRef & { bandFraction: number })[];
  // path-contours.ts
  export const flattenPath = (path: PathSegment[]): Pt[][]; // one polyline per M-run; Z appends the first point
  ```
  `MergeResponse` merge-result carries `contours: BandContourIndex` (not `holes`). `PoolRunResult.contours: Map<string, BandContourIndex>`. Store `bandContourIndexes: Writable<Map<string, BandContourIndex>>`.

- [ ] **Step 1: Rename files**

```bash
git mv src/lib/cut-pattern/hole-index.ts src/lib/cut-pattern/contour-index.ts
git mv src/lib/cut-pattern/__tests__/hole-index.test.ts src/lib/cut-pattern/__tests__/contour-index.test.ts
```

- [ ] **Step 2: Rewrite the existing tests against the new API, and add new ones**

In `contour-index.test.ts`: replace `import { buildHoleIndex } from '../hole-index'` with `import { buildContourIndex, holesOf } from '../contour-index'`; replace each `buildHoleIndex(path, input)` with `buildContourIndex(path, input, 'tiled')`; replace `index.holes` with `holesOf(index)`. Keep every existing assertion. Then append:

```ts
describe('buildContourIndex kinds, axis and ends', () => {
	const input = (count: number) => ({
		...straightBand(count),
		pieceStartFraction: 0,
		pieceEndFraction: 1,
		seed: 1
	});

	it('records every contour with an even/odd kind', () => {
		const path: PathSegment[] = [...square(0, 0, 10, 10), ...square(4, 4, 2, 2)];
		const index = buildContourIndex(path, input(10), 'tiled');
		expect(index.contours.map((c) => c.kind)).toEqual(['outline', 'hole']);
		expect(index.contours.map((c) => c.depth)).toEqual([0, 1]);
	});

	it('marks every contour of an outlined band as outline', () => {
		const path: PathSegment[] = [...square(0, 0, 10, 10), ...square(4, 4, 2, 2)];
		const index = buildContourIndex(path, input(10), 'outlined');
		expect(index.contours.every((c) => c.kind === 'outline')).toBe(true);
		expect(holesOf(index)).toHaveLength(0);
	});

	it('finds the major axis and the two ends of a tall band', () => {
		// 2 wide, 10 tall, facets run down +y
		const path: PathSegment[] = square(-0.5, 0, 2, 10);
		const index = buildContourIndex(path, input(10), 'tiled');
		expect(Math.abs(index.axis!.direction.y)).toBeCloseTo(1, 6);
		const { start, end } = index.ends!;
		expect(start.point.y).toBeCloseTo(0, 6); // first facet is at the top
		expect(end.point.y).toBeCloseTo(10, 6);
		expect(start.outward.y).toBeCloseTo(-1, 6);
		expect(end.outward.y).toBeCloseTo(1, 6);
	});

	it('puts the end on a protruding tag', () => {
		// band plus a small tag sticking out below the last facet
		const path: PathSegment[] = [
			['M', 0, 0], ['L', 1, 0], ['L', 1, 10], ['L', 0.6, 10], ['L', 0.6, 12],
			['L', 0.4, 12], ['L', 0.4, 10], ['L', 0, 10], ['Z']
		];
		const index = buildContourIndex(path, input(10), 'tiled');
		expect(index.ends!.end.point.y).toBeCloseTo(12, 6);
	});

	it('returns no ends for an empty path', () => {
		const index = buildContourIndex([], input(3), 'tiled');
		expect(index.contours).toEqual([]);
		expect(index.ends).toBeUndefined();
	});
});
```

Also in `path-contours` tests (create `src/lib/cut-pattern/__tests__/path-contours.flatten.test.ts`):

```ts
import { describe, it, expect } from '@jest/globals';
import { flattenPath } from '../path-contours';

describe('flattenPath', () => {
	it('splits runs and closes on Z', () => {
		const runs = flattenPath([
			['M', 0, 0], ['L', 1, 0], ['L', 1, 1], ['Z'],
			['M', 5, 5], ['L', 6, 5]
		]);
		expect(runs).toHaveLength(2);
		expect(runs[0][runs[0].length - 1]).toEqual({ x: 0, y: 0 });
		expect(runs[1]).toEqual([{ x: 5, y: 5 }, { x: 6, y: 5 }]);
	});

	it('samples cubics and ends on the endpoint', () => {
		const [run] = flattenPath([['M', 0, 0], ['C', 0, 1, 1, 1, 1, 0]]);
		expect(run.length).toBeGreaterThan(2);
		expect(run[run.length - 1]).toEqual({ x: 1, y: 0 });
	});
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx jest src/lib/cut-pattern/__tests__/contour-index.test.ts src/lib/cut-pattern/__tests__/path-contours.flatten.test.ts`
Expected: FAIL (missing exports).

- [ ] **Step 4: Add `flattenPath` to `path-contours.ts`**

```ts
/**
 * Every `M`-run of a path as a polyline, open or closed. Unlike
 * `splitContours`, it keeps open runs (split outline pieces, disconnect lines)
 * and does no measuring. `Z` appends the run's first point. Arcs are treated as
 * straight to their endpoint — merged paths contain none.
 */
export const flattenPath = (path: PathSegment[]): Pt[][] => {
	const runs: Pt[][] = [];
	let run: Pt[] = [];
	let cur: Pt = { x: 0, y: 0 };
	const flush = () => {
		if (run.length > 0) runs.push(run);
		run = [];
	};
	for (const seg of path) {
		switch (seg[0]) {
			case 'M':
				flush();
				cur = { x: seg[1], y: seg[2] };
				run.push(cur);
				break;
			case 'L':
				cur = { x: seg[1], y: seg[2] };
				run.push(cur);
				break;
			case 'C': {
				const p0 = cur;
				const c1 = { x: seg[1], y: seg[2] };
				const c2 = { x: seg[3], y: seg[4] };
				const p1 = { x: seg[5], y: seg[6] };
				for (let i = 1; i < CURVE_SAMPLES; i += 1) run.push(cubicAt(p0, c1, c2, p1, i / CURVE_SAMPLES));
				run.push(p1);
				cur = p1;
				break;
			}
			case 'Q': {
				const p0 = cur;
				const c = { x: seg[1], y: seg[2] };
				const p1 = { x: seg[3], y: seg[4] };
				for (let i = 1; i < CURVE_SAMPLES; i += 1) {
					const t = i / CURVE_SAMPLES;
					const u = 1 - t;
					run.push({
						x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
						y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y
					});
				}
				run.push(p1);
				cur = p1;
				break;
			}
			case 'A':
				cur = { x: seg[6], y: seg[7] };
				run.push(cur);
				break;
			case 'Z':
				if (run.length > 0) {
					run.push(run[0]);
					cur = run[0];
				}
				break;
		}
	}
	flush();
	return runs;
};
```

(`cubicAt` and `CURVE_SAMPLES` already exist in this file.)

- [ ] **Step 5: Rewrite `contour-index.ts`**

Keep `depthsOf`, `facetCentroid`, `centerlineOf`, `localFractionOf` unchanged. Replace the types and the exported builder:

```ts
import type { BandEnds, Pt as EndPt } from './post-process-types';

export type ContourKind = 'outline' | 'hole';

/**
 * One contour of a merged band path. `start`/`end` index the merged
 * `PathSegment[]`. Kind is containment-depth parity (even = outline, odd =
 * hole) — exact topology, not winding. `bandFraction` is set on holes only: the
 * hole centroid's position along the PARENT band.
 */
export type ContourRef = {
	start: number;
	end: number;
	kind: ContourKind;
	depth: number;
	/** |area|. */
	area: number;
	bandFraction?: number;
};

export type BandContourIndex = {
	seed: number;
	contours: ContourRef[];
	/** PCA major axis of the outline contours, band-local. */
	axis?: { origin: EndPt; direction: EndPt };
	/** Extreme outline points along the axis; `start` is the end nearer the first facet. */
	ends?: BandEnds;
};

export type ContourIndexInput = {
	facets: { path: PathSegment[] }[];
	pieceStartFraction: number;
	pieceEndFraction: number;
	seed: number;
};

export const holesOf = (index: BandContourIndex) =>
	index.contours.filter(
		(c): c is ContourRef & { bandFraction: number } => c.kind === 'hole'
	);

/** Major axis by PCA. A degenerate cloud gets +x. */
const majorAxis = (points: Pt[]): { origin: Pt; direction: Pt } => {
	let mx = 0;
	let my = 0;
	for (const p of points) {
		mx += p.x;
		my += p.y;
	}
	mx /= points.length;
	my /= points.length;
	let sxx = 0;
	let syy = 0;
	let sxy = 0;
	for (const p of points) {
		const dx = p.x - mx;
		const dy = p.y - my;
		sxx += dx * dx;
		syy += dy * dy;
		sxy += dx * dy;
	}
	if (sxx + syy === 0) return { origin: { x: mx, y: my }, direction: { x: 1, y: 0 } };
	const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
	return { origin: { x: mx, y: my }, direction: { x: Math.cos(theta), y: Math.sin(theta) } };
};

const bandEndsOf = (
	outlinePoints: Pt[],
	axis: { origin: Pt; direction: Pt },
	firstFacet: Pt | undefined
): BandEnds => {
	const d = axis.direction;
	let minT = Infinity;
	let maxT = -Infinity;
	let minP = outlinePoints[0];
	let maxP = outlinePoints[0];
	for (const p of outlinePoints) {
		const t = (p.x - axis.origin.x) * d.x + (p.y - axis.origin.y) * d.y;
		if (t < minT) {
			minT = t;
			minP = p;
		}
		if (t > maxT) {
			maxT = t;
			maxP = p;
		}
	}
	const low = { point: minP, outward: { x: -d.x, y: -d.y } };
	const high = { point: maxP, outward: { x: d.x, y: d.y } };
	if (!firstFacet) return { start: low, end: high };
	const dLow = Math.hypot(firstFacet.x - minP.x, firstFacet.y - minP.y);
	const dHigh = Math.hypot(firstFacet.x - maxP.x, firstFacet.y - maxP.y);
	return dLow <= dHigh ? { start: low, end: high } : { start: high, end: low };
};

/**
 * Stage 1b: index every contour of one merged band path, plus the band's axis
 * and ends. Pure and config-free. Runs in the band-merge worker.
 *
 * Outlined bands: every contour is `outline`. Their only interior contours are
 * label-tag artefacts, which must never be dropped as holes.
 */
export const buildContourIndex = (
	path: PathSegment[],
	input: ContourIndexInput,
	patternType: string
): BandContourIndex => {
	const contours = splitContours(path);
	if (contours.length === 0) return { seed: input.seed, contours: [] };

	const depths = depthsOf(contours);
	const line = centerlineOf(input.facets);
	const span = input.pieceEndFraction - input.pieceStartFraction;
	const refs: ContourRef[] = [];
	const outlinePoints: Pt[] = [];

	for (let i = 0; i < contours.length; i += 1) {
		const contour = contours[i];
		const isHole = patternType !== 'outlined' && depths[i] % 2 === 1;
		const ref: ContourRef = {
			start: contour.start,
			end: contour.end,
			kind: isHole ? 'hole' : 'outline',
			depth: depths[i],
			area: Math.abs(contour.area)
		};
		if (isHole) {
			ref.bandFraction =
				input.pieceStartFraction + localFractionOf(contour.centroid, line) * span;
		} else {
			outlinePoints.push(...contour.points);
		}
		refs.push(ref);
	}

	if (outlinePoints.length === 0) return { seed: input.seed, contours: refs };
	const axis = majorAxis(outlinePoints);
	return {
		seed: input.seed,
		contours: refs,
		axis,
		ends: bandEndsOf(outlinePoints, axis, line.points[0])
	};
};
```

Note the behaviour change from `buildHoleIndex`: a single-contour path is now indexed (one outline), where before it returned early with no holes. Update the old test that asserted `holes: []` for a single contour to assert `holesOf(index)` is empty.

- [ ] **Step 6: Run the index tests to verify pass**

Run: `npx jest src/lib/cut-pattern/__tests__/contour-index.test.ts src/lib/cut-pattern/__tests__/path-contours.flatten.test.ts`
Expected: PASS.

- [ ] **Step 7: Rewire drop-holes, worker, pool, store, NavHeader**

`drop-holes.ts`: import `{ holesOf, type BandContourIndex } from './contour-index'`; change the three `BandHoleIndex` parameter types to `BandContourIndex`; in `droppedHoles` replace `index.holes` with `holesOf(index)` (both uses); in `dropHoles` replace `index.holes.length === 0` with `holesOf(index).length === 0`; in `postProcessBandPath` replace `index.holes.filter(...)` with `holesOf(index).filter(...)`. Output shape is unchanged in this task.

`band-merge-worker-core.ts`:

```ts
import { buildContourIndex, type BandContourIndex } from '$lib/cut-pattern/contour-index';
// ...
	| { type: 'merge-result'; bandId: string; path: PathSegment[]; contours: BandContourIndex }
// ...
			// Stage 1b. Config-independent, so it runs here, where the facets, the
			// piece span and the seed are already in hand. Outlined bands are
			// indexed too (for their ends); their contours are all `outline`.
			const contours = buildContourIndex(path, message.payload, message.ctx.patternType);
			post({ type: 'merge-result', bandId: message.bandId, path, contours });
```

`band-merge-pool.ts`: rename the `holes` field of `PoolRunResult` to `contours: Map<string, BandContourIndex>` (update its doc comment), the local `holes` map to `contours`, and wherever a `merge-result` is stored, read `data.contours`. Use `grep -n "holes" src/lib/workers/band-merge-pool.ts` to find every site.

`mergedPathStore.ts`: rename `bandHoleIndexes` → `bandContourIndexes` with type `Writable<Map<string, BandContourIndex>>`; update `applyPostProcess`'s `indexes` parameter type and the `mergedBandPaths` derived inputs.

`NavHeader.svelte`: import `buildContourIndex, type BandContourIndex` from `$lib/cut-pattern/contour-index` and `bandContourIndexes` from stores; in the invalidation block `bandContourIndexes.set(new Map())`; `publish(paths, contours: Map<string, BandContourIndex>)` sets `bandContourIndexes`; in the inline branch replace the ternary with `contours.set(payload.id, buildContourIndex(path, payload, ctx.patternType))`; where the pool result is published use `result.contours`.

- [ ] **Step 8: Update the remaining tests**

Run `grep -rlE "BandHoleIndex|buildHoleIndex|bandHoleIndexes|hole-index|\.holes\b|holes:" src tests` and update each hit to the new names: fixtures built as `{ seed, holes: [...] }` become `{ seed, contours: [...] }` with each hole ref given `kind: 'hole', depth: 1`. Pool/worker tests expect `contours` on results. Do not weaken assertions.

- [ ] **Step 9: Full run and check**

Run: `npx jest 2>&1 | tail -5` → all pass.
Run: `npm run check 2>&1 | tail -3` → not above baseline.

- [ ] **Step 10: Commit**

```bash
git add -A src/lib/cut-pattern src/lib/workers src/lib/stores/mergedPathStore.ts src/components/nav-header/NavHeader.svelte src/lib/stores/__tests__
git commit -m "feat(post-process): index every contour with kind, axis and band ends"
```

(`git add -A` on those paths only — check `git status` first and add nothing outside them.)

---

## Task 3: Stage 2 emits `TaggedPath[]`; renderer draws tagged pieces

**Files:**
- Modify: `src/lib/cut-pattern/drop-holes.ts` (`postProcessBandPath` returns `TaggedPath[]`)
- Modify: `src/lib/stores/mergedPathStore.ts` (`applyPostProcess`, `mergedBandPaths` type)
- Modify: `src/components/cut-pattern/BandCutPatternComponent.svelte` (merged branches)
- Modify tests: `drop-holes.test.ts`, `hole-drop-integration.test.ts`, `merged-path-store.test.ts`, `mergedPathStore.test.ts`
- Modify: `tests/hole-drop.spec.ts` (segment totals over pieces)

**Interfaces:**
- Consumes: `TaggedPath`, `layerStrokes` (Task 1); `BandContourIndex`, `holesOf` (Task 2).
- Produces:
  ```ts
  export const postProcessBandPath = (path: PathSegment[], index: BandContourIndex, config: PostProcessConfig): TaggedPath[];
  export const applyPostProcess = (raw: Map<string, PathSegment[]>, indexes: Map<string, BandContourIndex>, config: PostProcessConfig): Map<string, TaggedPath[]>;
  export const mergedBandPaths: Readable<Map<string, TaggedPath[]>>;
  export const concatPieces = (pieces: TaggedPath[]): PathSegment[]; // in drop-holes.ts
  ```

- [ ] **Step 1: Write the failing tests**

Add to `drop-holes.test.ts` (reuse its existing `pathWith`/`indexFor`/`cfg` helpers; after Task 2 `indexFor` builds `contours`):

```ts
describe('postProcessBandPath tagged output', () => {
	const outer: PathSegment[] = [['M', 0, 0], ['L', 20, 0], ['L', 20, 20], ['L', 0, 20], ['Z']];
	const hole = (x: number): PathSegment[] => [['M', x, 5], ['L', x + 2, 5], ['L', x + 2, 7], ['Z']];
	const path = [...outer, ...hole(2), ...hole(8)];
	const index: BandContourIndex = {
		seed: 3,
		contours: [
			{ start: 0, end: 5, kind: 'outline', depth: 0, area: 400 },
			{ start: 5, end: 9, kind: 'hole', depth: 1, area: 2, bandFraction: 0.2 },
			{ start: 9, end: 13, kind: 'hole', depth: 1, area: 2, bandFraction: 0.8 }
		]
	};

	it('emits one tagged piece per contour, in contour order', () => {
		const pieces = postProcessBandPath(path, index, cfg({ mode: 'none' }));
		expect(pieces.map((p) => p.geometry)).toEqual(['pattern-outline', 'pattern-hole', 'pattern-hole']);
		expect(pieces.map((p) => p.contour)).toEqual([0, 1, 2]);
		expect(concatPieces(pieces)).toEqual(path);
	});

	it('omits dropped holes', () => {
		const pieces = postProcessBandPath(path, index, cfg({ mode: 'all' }));
		expect(pieces.map((p) => p.geometry)).toEqual(['pattern-outline']);
	});

	it('omits outline pieces with dropOutline', () => {
		const pieces = postProcessBandPath(path, index, { ...cfg({ mode: 'none' }), dropOutline: true });
		expect(pieces.every((p) => p.geometry === 'pattern-hole')).toBe(true);
		expect(pieces).toHaveLength(2);
	});

	it('matches the flat dropHoles output when re-concatenated', () => {
		const config = cfg({ mode: 'random', chance: 0.5 });
		expect(concatPieces(postProcessBandPath(path, index, config))).toEqual(dropHoles(path, index, config));
	});

	it('treats an unindexed non-empty path as one outline piece', () => {
		const pieces = postProcessBandPath(outer, { seed: 1, contours: [] }, cfg({ mode: 'none' }));
		expect(pieces).toEqual([{ geometry: 'pattern-outline', segments: outer }]);
	});
});
```

(`cfg(mode)` in the existing file builds a `PostProcessConfig`; if it has a different name, use it.) Update existing `postProcessBandPath` assertions that compared a flat array to compare `concatPieces(result)`.

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/lib/cut-pattern/__tests__/drop-holes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `drop-holes.ts` replace `postProcessBandPath` and remove `onlyRanges` if now unused:

```ts
import type { TaggedPath } from './post-process-types';

export const concatPieces = (pieces: TaggedPath[]): PathSegment[] =>
	pieces.flatMap((p) => p.segments);

/**
 * Stage 2 for one band: one tagged piece per surviving contour, in contour
 * order. Dropped holes are omitted; `dropOutline` omits every outline contour
 * (outer shell with its label tag, and islands inside holes).
 */
export const postProcessBandPath = (
	path: PathSegment[],
	index: BandContourIndex,
	config: PostProcessConfig
): TaggedPath[] => {
	if (index.contours.length === 0) {
		return path.length === 0 ? [] : [{ geometry: 'pattern-outline', segments: path }];
	}
	const dropped = new Set(droppedHoles(index, config).map((r) => r.start));
	const pieces: TaggedPath[] = [];
	index.contours.forEach((c, i) => {
		if (c.kind === 'hole' && dropped.has(c.start)) return;
		if (c.kind === 'outline' && config.dropOutline) return;
		pieces.push({
			geometry: c.kind === 'hole' ? 'pattern-hole' : 'pattern-outline',
			segments: path.slice(c.start, c.end),
			contour: i
		});
	});
	return pieces;
};
```

In `mergedPathStore.ts`:

```ts
export const applyPostProcess = (
	raw: Map<string, PathSegment[]>,
	indexes: Map<string, BandContourIndex>,
	config: PostProcessConfig
): Map<string, TaggedPath[]> => {
	const out = new Map<string, TaggedPath[]>();
	for (const [bandId, path] of raw) {
		const index = indexes.get(bandId) ?? { seed: 0, contours: [] };
		out.set(bandId, postProcessBandPath(path, index, config));
	}
	return out;
};
```

(The old early-return-by-reference is gone because the output type differs; stage 2 is still milliseconds.)

- [ ] **Step 4: Render tagged pieces**

In `BandCutPatternComponent.svelte`, import `layerStrokes` from `$lib/stores` and `concatPieces` from `$lib/cut-pattern/drop-holes`, and replace the `renderAsSinglePath` merged branches:

```svelte
{#if renderAsSinglePath}
	{@const pieces = $mergedBandPaths.get(band.id)}
	{@const hasMerged = !!pieces}
	{@const renderMode = resolveBandRenderMode({
		hasMerged,
		patternType: $patternConfigStore.patternTypeConfig.type
	})}
	{#if renderMode === 'merged-outlined' && pieces}
		<!-- One path per tagged piece; stroke from the layer map, so the preview
		     shows the colors the cut file carries. -->
		{#each pieces as piece, p (p)}
			<path
				d={svgPathStringFromSegments(piece.segments)}
				data-geometry={piece.geometry}
				fill="none"
				stroke={$layerStrokes[piece.geometry]}
				stroke-width={band.facets[0]?.strokeWidth ?? 1}
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{/each}
	{:else if renderMode === 'merged-tiled' && pieces}
		<!-- Preview-only silhouette: holes now render as separate paths, so the
		     evenodd fill needs its own concatenated path. Never exported. -->
		<path
			class="screen-only"
			d={svgPathStringFromSegments(concatPieces(pieces))}
			fill="rgba(200,200,200,0.1)"
			fill-rule="evenodd"
			stroke="none"
		/>
		{#each pieces as piece, p (p)}
			<path
				d={svgPathStringFromSegments(piece.segments)}
				data-geometry={piece.geometry}
				fill="none"
				stroke={$layerStrokes[piece.geometry]}
				stroke-width={1}
			/>
		{/each}
	{:else}
		<!-- unchanged per-facet branch -->
```

Keep the existing comments that still apply and the unchanged per-facet `{:else}` body. Remove the now-unused `mergedPath` const.

- [ ] **Step 5: Update store tests and the Playwright spec**

`merged-path-store.test.ts` / `mergedPathStore.test.ts`: expectations on `mergedBandPaths` values become `TaggedPath[]` — compare `concatPieces(value)` where they compared a flat path. `tests/hole-drop.spec.ts` `readTotal`: count segments across pieces:

```ts
				for (const value of paths.values()) {
					const pieces = value as unknown[];
					total += pieces.reduce<number>(
						(n, piece) =>
							n + (Array.isArray(piece) ? 1 : ((piece as { segments: unknown[] }).segments.length)),
						0
					);
				}
```

(`mergedBandPathsRaw` values are still flat arrays of segments — each item is an array and counts 1; `mergedBandPaths` values are pieces — each counts its segments.)

- [ ] **Step 6: Run everything**

Run: `npx jest 2>&1 | tail -5` → all pass. `npm run check 2>&1 | tail -3` → not above baseline.

- [ ] **Step 7: Browser smoke**

Restart the dev server (worker code changed in Task 2), then run the existing Playwright spec: `npx playwright test tests/hole-drop.spec.ts tests/prepare-download.spec.ts`. Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/cut-pattern/drop-holes.ts src/lib/stores/mergedPathStore.ts src/components/cut-pattern/BandCutPatternComponent.svelte src/lib/cut-pattern/__tests__ src/lib/stores/__tests__ tests/hole-drop.spec.ts
git commit -m "feat(post-process): stage 2 emits tagged pieces; render one path per piece"
```

---

## Task 4: Tag every exported producer; untagged-export guard

**Files:**
- Create: `src/lib/cut-pattern/export-guard.ts`
- Test: `src/lib/cut-pattern/__tests__/export-guard.test.ts`
- Modify: `src/components/cut-pattern/SvgText/SvgText.svelte`, `LabelText.svelte`, `OnTabLabel.svelte`, `PatternLabel.svelte`, `PageGeometry.svelte`
- Modify: any other component the browser check (Step 6) finds emitting untagged exported elements

**Interfaces:**
- Consumes: `GeometryType`, `isGeometryType`, `layerStrokes`.
- Produces:
  ```ts
  export type ExportNode = { tag: string; geometry: string | null; describe: string };
  export const EXPORTED_TAGS: readonly string[]; // ['path','rect','line','polyline','polygon','circle','ellipse','text']
  export const findUntagged = (nodes: ExportNode[]): ExportNode[];
  export const collectExportNodes = (root: Element): ExportNode[]; // DOM adapter, excludes .screen-only subtrees
  export const untaggedMessage = (bad: ExportNode[]): string;
  ```
  `SvgText` prop `geometry?: GeometryType` (default `'label-text'`); it no longer takes `color`.

- [ ] **Step 1: Failing guard test**

```ts
import { describe, it, expect } from '@jest/globals';
import { findUntagged, untaggedMessage } from '../export-guard';

describe('findUntagged', () => {
	it('passes tagged drawables and ignores groups', () => {
		expect(
			findUntagged([
				{ tag: 'g', geometry: null, describe: 'g#a' },
				{ tag: 'path', geometry: 'pattern-outline', describe: 'path' },
				{ tag: 'rect', geometry: 'page-outline', describe: 'rect' }
			])
		).toEqual([]);
	});

	it('flags drawables without a valid tag', () => {
		const bad = findUntagged([
			{ tag: 'path', geometry: null, describe: 'path#x' },
			{ tag: 'circle', geometry: 'bogus', describe: 'circle' }
		]);
		expect(bad.map((b) => b.describe)).toEqual(['path#x', 'circle']);
		expect(untaggedMessage(bad)).toContain('2 untagged');
		expect(untaggedMessage(bad)).toContain('path#x');
	});
});
```

Run: `npx jest src/lib/cut-pattern/__tests__/export-guard.test.ts` → FAIL.

- [ ] **Step 2: Implement `export-guard.ts`**

```ts
import { isGeometryType } from './post-process-types';

export type ExportNode = { tag: string; geometry: string | null; describe: string };

export const EXPORTED_TAGS = [
	'path', 'rect', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'text'
] as const;

/**
 * Drawables without a valid `data-geometry`. Such an element would land on an
 * arbitrary LightBurn layer and cut at the wrong setting, so exports refuse it.
 */
export const findUntagged = (nodes: ExportNode[]): ExportNode[] =>
	nodes.filter(
		(n) => (EXPORTED_TAGS as readonly string[]).includes(n.tag) && !isGeometryType(n.geometry)
	);

export const untaggedMessage = (bad: ExportNode[]): string =>
	`Export blocked: ${bad.length} untagged element${bad.length === 1 ? '' : 's'} ` +
	`(${bad.slice(0, 5).map((b) => b.describe).join(', ')}${bad.length > 5 ? ', …' : ''}).`;

/** DOM adapter. `root` should already have screen-only nodes removed (a clone). */
export const collectExportNodes = (root: Element): ExportNode[] =>
	Array.from(root.querySelectorAll(EXPORTED_TAGS.join(','))).map((el) => {
		const parentId = el.closest('[id]')?.id;
		return {
			tag: el.tagName.toLowerCase(),
			geometry: el.getAttribute('data-geometry'),
			describe: `${el.tagName.toLowerCase()}${parentId ? ` in #${parentId}` : ''}`
		};
	});
```

Run the test → PASS.

- [ ] **Step 3: Tag `SvgText`**

In `SvgText.svelte`: remove the `color` prop; add `geometry = 'label-text'` typed `GeometryType`; import `layerStrokes` from `$lib/stores`; set the outer `<g>`'s `stroke={$layerStrokes[geometry]}` and add `data-geometry={geometry}` to each glyph `<path>`. Update `LabelText.svelte` (drop `color`, add optional `geometry` pass-through) and every other `SvgText`/`LabelText` caller found by `grep -rn "SvgText\|LabelText" src/components` (drop `color=`; screen-only callers are unaffected).

- [ ] **Step 4: Tag the page rect and the pre-prepare tag outline**

`PageGeometry.svelte` rect: `data-geometry="page-outline" stroke={$layerStrokes['page-outline']}` (import `layerStrokes`). Keep `fill="#ffffff"`.

`PatternLabel.svelte` tag outline path (`{#if !bandId || !$mergedBandPaths.has(bandId)}`): add `data-geometry="pattern-outline"`.

- [ ] **Step 5: Check the whole build**

Run: `npm run check 2>&1 | tail -3` → not above baseline. `npx jest 2>&1 | tail -5` → pass.

- [ ] **Step 6: Find every remaining untagged exported element in the browser**

Restart the dev server. Write a throwaway script in the scratchpad (not the repo) using Playwright's library API, run from the repo root with `npx tsx` or `node`: open `/designer2`, switch Geometry to Voronoi (same steps as `selectVoronoiGeometry` in `tests/hole-drop.spec.ts`), set layout to page mode if not default, click "Prepare Download", wait for `✓ ready`, then evaluate in the page:

```js
const svg = document.getElementById('pattern-svg').cloneNode(true);
svg.querySelectorAll('.svg-pattern-quad, .split-target, .screen-only').forEach((n) => n.remove());
[...svg.querySelectorAll('path,rect,line,polyline,polygon,circle,ellipse,text')]
	.filter((el) => !el.getAttribute('data-geometry'))
	.map((el) => el.outerHTML.slice(0, 160));
```

Repeat for pattern type `outlined`. For each untagged element: if it is cut geometry, tag it with the matching type; if it is screen furniture, add `class="screen-only"`; if it is cut geometry with no matching type (e.g. a registration mark or scale bar meant for the cutter), STOP and report it rather than inventing a type. Re-run until the list is empty for both pattern types.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cut-pattern/export-guard.ts src/lib/cut-pattern/__tests__/export-guard.test.ts src/components
git commit -m "feat(post-process): tag every exported producer; add untagged-export guard"
```

(Stage only the component files you changed.)

---

# Wave 1 — parallel (Tasks 5–9)

Each task runs in its own worktree branched from the wave-0 result and touches only its listed files: pure modules plus Jest tests. The exceptions are Task 6's store change and Task 7's one-line font-metrics import.

## Task 5: Disconnect surround (stage 3, pure)

**Files:**
- Create: `src/lib/cut-pattern/page-post-process/segments.ts`
- Create: `src/lib/cut-pattern/page-post-process/disconnect.ts`
- Test: `src/lib/cut-pattern/page-post-process/__tests__/disconnect.test.ts`, `segments.test.ts`

**Interfaces:**
- Consumes: `PlacedBand`, `Disconnect`, `Pt` (Task 1); `pointInPolygon` from `path-contours.ts`; `PageRect` from `page-layout/types.ts`.
- Produces:
  ```ts
  // segments.ts
  export type Seg = { a: Pt; b: Pt };
  export const segmentsOf = (polylines: Pt[][]): Seg[];
  export const raySegment = (origin: Pt, dir: Pt, s: Seg): number | null; // ray parameter t ≥ 0, or null
  export const segmentsIntersect = (p: Seg, q: Seg): boolean;
  export const rotate = (v: Pt, deg: number): Pt;
  export const rectEdges = (r: { x: number; y: number; width: number; height: number }): Seg[];
  export const isFinitePt = (p: Pt): boolean;
  // disconnect.ts
  export const DISCONNECT_CONE_DEG = 30;
  export const DISCONNECT_STEP_DEG = 2;
  export const computeDisconnects = (bands: PlacedBand[], pages: PageRect[], dedupeDistance: number): Disconnect[];
  ```

- [ ] **Step 1: Failing tests**

`segments.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { raySegment, segmentsIntersect, rotate, segmentsOf } from '../segments';

describe('segments', () => {
	it('intersects a ray with a segment', () => {
		const t = raySegment({ x: 0, y: 0 }, { x: 0, y: 1 }, { a: { x: -1, y: 5 }, b: { x: 1, y: 5 } });
		expect(t).toBeCloseTo(5, 9);
	});
	it('misses a segment behind, beside, or parallel to the ray', () => {
		expect(raySegment({ x: 0, y: 0 }, { x: 0, y: 1 }, { a: { x: -1, y: -5 }, b: { x: 1, y: -5 } })).toBeNull();
		expect(raySegment({ x: 0, y: 0 }, { x: 0, y: 1 }, { a: { x: 2, y: 5 }, b: { x: 3, y: 5 } })).toBeNull();
		expect(raySegment({ x: 0, y: 0 }, { x: 0, y: 1 }, { a: { x: 1, y: 0 }, b: { x: 1, y: 5 } })).toBeNull();
	});
	it('detects crossing segments', () => {
		expect(segmentsIntersect({ a: { x: 0, y: 0 }, b: { x: 2, y: 2 } }, { a: { x: 0, y: 2 }, b: { x: 2, y: 0 } })).toBe(true);
		expect(segmentsIntersect({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, { a: { x: 0, y: 1 }, b: { x: 1, y: 1 } })).toBe(false);
	});
	it('rotates counter-clockwise in math orientation', () => {
		const r = rotate({ x: 1, y: 0 }, 90);
		expect(r.x).toBeCloseTo(0, 9);
		expect(r.y).toBeCloseTo(1, 9);
	});
	it('turns polylines into segments', () => {
		expect(segmentsOf([[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]])).toHaveLength(2);
	});
});
```

`disconnect.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { computeDisconnects } from '../disconnect';
import type { PlacedBand } from '../../post-process-types';

const rectPoly = (x0: number, y0: number, x1: number, y1: number) => [
	{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }
];
const vband = (id: string, x0: number, y0: number, x1: number, y1: number, page = 0): PlacedBand => ({
	bandId: id,
	page,
	outlines: [rectPoly(x0, y0, x1, y1)],
	holes: [],
	ends: {
		start: { point: { x: (x0 + x1) / 2, y: y0 }, outward: { x: 0, y: -1 } },
		end: { point: { x: (x0 + x1) / 2, y: y1 }, outward: { x: 0, y: 1 } }
	}
});
const page = { x: 0, y: 0, width: 100, height: 100 };

describe('computeDisconnects', () => {
	it('reaches the page edge from a lone band', () => {
		const d = computeDisconnects([vband('a', 45, 10, 55, 80)], [page], 2);
		expect(d).toHaveLength(2);
		const top = d.find((s) => s.a.y === 10)!;
		expect(top.b.x).toBeCloseTo(50, 6);
		expect(top.b.y).toBeCloseTo(0, 6);
		expect(top.toBand).toBeNull();
		expect(d.find((s) => s.a.y === 80)!.b.y).toBeCloseTo(100, 6);
	});

	it('reaches a facing neighbour once, not twice', () => {
		const d = computeDisconnects([vband('a', 45, 10, 55, 40), vband('b', 45, 45, 55, 90)], [page], 2);
		const between = d.filter((s) => s.toBand !== null);
		expect(between).toHaveLength(1);
		expect(Math.hypot(between[0].b.x - between[0].a.x, between[0].b.y - between[0].a.y)).toBeCloseTo(5, 6);
		expect(d).toHaveLength(3);
	});

	it('snaps to an off-axis neighbour inside the cone', () => {
		// a's end at (50,50) points down; the edge is 50 away, c is ~20 away at ~20°
		const a = vband('a', 45, 10, 55, 50);
		const c: PlacedBand = { bandId: 'c', page: 0, outlines: [rectPoly(54, 67, 80, 75)], holes: [] };
		const d = computeDisconnects([a, c], [page], 2).find((s) => s.a.y === 50)!;
		expect(d.toBand).toBe('c');
		expect(Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)).toBeLessThan(25);
	});

	it('skips an end buried inside another band', () => {
		const a = vband('a', 45, 10, 55, 50);
		const cover: PlacedBand = { bandId: 'cover', page: 0, outlines: [rectPoly(40, 45, 60, 60)], holes: [] };
		const d = computeDisconnects([a, cover], [page], 2);
		expect(d.find((s) => s.fromBand === 'a' && s.a.y === 50)).toBeUndefined();
	});

	it('ignores off-page ends, end-less bands and unknown pages, with no NaN', () => {
		const off = vband('off', 45, -20, 55, -5);
		const noEnds: PlacedBand = { bandId: 'n', page: 0, outlines: [rectPoly(10, 10, 20, 20)], holes: [] };
		const other = vband('o', 45, 10, 55, 80, 1);
		const d = computeDisconnects([off, noEnds, other], [page], 2);
		expect(d.filter((s) => s.fromBand === 'off')).toHaveLength(0);
		expect(d.filter((s) => s.fromBand === 'o')).toHaveLength(0);
		expect(d.every((s) => [s.a.x, s.a.y, s.b.x, s.b.y].every(Number.isFinite))).toBe(true);
	});
});
```

Run: `npx jest src/lib/cut-pattern/page-post-process` → FAIL.

- [ ] **Step 2: Implement `segments.ts`**

```ts
import type { Pt } from '../post-process-types';

export type Seg = { a: Pt; b: Pt };

export const isFinitePt = (p: Pt): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);

export const segmentsOf = (polylines: Pt[][]): Seg[] =>
	polylines.flatMap((run) => run.slice(1).map((b, i) => ({ a: run[i], b })));

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

/** Distance along `dir` from `origin` to segment `s` (in units of |dir|), or null. */
export const raySegment = (origin: Pt, dir: Pt, s: Seg): number | null => {
	const ex = s.b.x - s.a.x;
	const ey = s.b.y - s.a.y;
	const den = cross(dir.x, dir.y, ex, ey);
	if (Math.abs(den) < 1e-12) return null;
	const wx = s.a.x - origin.x;
	const wy = s.a.y - origin.y;
	const t = cross(wx, wy, ex, ey) / den;
	const u = cross(wx, wy, dir.x, dir.y) / den;
	if (t < 0 || u < 0 || u > 1) return null;
	return t;
};

export const segmentsIntersect = (p: Seg, q: Seg): boolean => {
	const o = (a: Pt, b: Pt, c: Pt) => Math.sign(cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y));
	return o(p.a, p.b, q.a) !== o(p.a, p.b, q.b) && o(q.a, q.b, p.a) !== o(q.a, q.b, p.b);
};

export const rotate = (v: Pt, deg: number): Pt => {
	const r = (deg * Math.PI) / 180;
	const c = Math.cos(r);
	const s = Math.sin(r);
	return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

export const rectEdges = (r: { x: number; y: number; width: number; height: number }): Seg[] => {
	const p0 = { x: r.x, y: r.y };
	const p1 = { x: r.x + r.width, y: r.y };
	const p2 = { x: r.x + r.width, y: r.y + r.height };
	const p3 = { x: r.x, y: r.y + r.height };
	return [{ a: p0, b: p1 }, { a: p1, b: p2 }, { a: p2, b: p3 }, { a: p3, b: p0 }];
};
```

- [ ] **Step 3: Implement `disconnect.ts`**

```ts
import type { Disconnect, PlacedBand, Pt } from '../post-process-types';
import type { PageRect } from '../page-layout/types';
import { pointInPolygon } from '../path-contours';
import { isFinitePt, raySegment, rectEdges, rotate, segmentsOf, type Seg } from './segments';

export const DISCONNECT_CONE_DEG = 30;
export const DISCONNECT_STEP_DEG = 2;
const MIN_T = 1e-6;

type Obstacle = { bandId: string; segs: Seg[]; polys: Pt[][] };

const inside = (p: Pt, r: PageRect) =>
	p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

const closed = (poly: Pt[]) =>
	poly.length > 3 &&
	poly[0].x === poly[poly.length - 1].x &&
	poly[0].y === poly[poly.length - 1].y;

/**
 * Straight cuts from each band end to whatever it meets first within a cone
 * around its outward axis: another band's outline, or the page edge. The
 * shortest hit wins, so edge bands reach the edge and interior bands reach
 * their neighbour.
 *
 * A band's own outline is not an obstacle: the end is the outline's extreme
 * point along the axis, and every ray in the ±30° cone has a positive
 * component along the axis, so it can never re-enter its own band.
 */
export const computeDisconnects = (
	bands: PlacedBand[],
	pages: PageRect[],
	dedupeDistance: number
): Disconnect[] => {
	const out: Disconnect[] = [];

	pages.forEach((page, p) => {
		const onPage = bands.filter((b) => b.page === p);
		const obstacles: Obstacle[] = onPage.map((b) => ({
			bandId: b.bandId,
			segs: segmentsOf(b.outlines),
			polys: b.outlines.filter(closed)
		}));
		const edges = rectEdges(page);

		for (const band of onPage) {
			if (!band.ends) continue;
			for (const end of [band.ends.start, band.ends.end]) {
				const o = end.point;
				if (!isFinitePt(o) || !isFinitePt(end.outward) || !inside(o, page)) continue;
				const buried = obstacles.some(
					(ob) => ob.bandId !== band.bandId && ob.polys.some((poly) => pointInPolygon(o, poly))
				);
				if (buried) continue;

				let best: { t: number; dir: Pt; toBand: string | null } | null = null;
				for (
					let deg = -DISCONNECT_CONE_DEG;
					deg <= DISCONNECT_CONE_DEG + 1e-9;
					deg += DISCONNECT_STEP_DEG
				) {
					const dir = rotate(end.outward, deg);
					let rayT = Infinity;
					let rayTo: string | null = null;
					for (const ob of obstacles) {
						if (ob.bandId === band.bandId) continue;
						for (const s of ob.segs) {
							const t = raySegment(o, dir, s);
							if (t !== null && t > MIN_T && t < rayT) {
								rayT = t;
								rayTo = ob.bandId;
							}
						}
					}
					for (const s of edges) {
						const t = raySegment(o, dir, s);
						if (t !== null && t > MIN_T && t < rayT) {
							rayT = t;
							rayTo = null;
						}
					}
					if (Number.isFinite(rayT) && (!best || rayT < best.t)) best = { t: rayT, dir, toBand: rayTo };
				}
				if (!best) continue;
				out.push({
					page: p,
					a: o,
					b: { x: o.x + best.dir.x * best.t, y: o.y + best.dir.y * best.t },
					fromBand: band.bandId,
					toBand: best.toBand
				});
			}
		}
	});

	return dedupe(out, dedupeDistance);
};

const len = (d: Disconnect) => Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
const near = (p: Pt, q: Pt, r: number) => Math.hypot(p.x - q.x, p.y - q.y) <= r;

/** Two neighbours reaching for each other produce two near-identical cuts; keep the shorter. */
const dedupe = (all: Disconnect[], r: number): Disconnect[] => {
	const dropped = new Set<number>();
	for (let i = 0; i < all.length; i += 1) {
		for (let j = i + 1; j < all.length; j += 1) {
			if (dropped.has(i) || dropped.has(j)) continue;
			const a = all[i];
			const b = all[j];
			if (a.page !== b.page || a.toBand !== b.fromBand || b.toBand !== a.fromBand) continue;
			if (!near(a.a, b.b, r) || !near(a.b, b.a, r)) continue;
			dropped.add(len(a) <= len(b) ? j : i);
		}
	}
	return all.filter((_, i) => !dropped.has(i));
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/lib/cut-pattern/page-post-process` → PASS. If the off-axis test picks the edge instead, check the fixture geometry against `rotate`'s sign before changing the algorithm.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cut-pattern/page-post-process/segments.ts src/lib/cut-pattern/page-post-process/disconnect.ts src/lib/cut-pattern/page-post-process/__tests__/segments.test.ts src/lib/cut-pattern/page-post-process/__tests__/disconnect.test.ts
git commit -m "feat(post-process): disconnect-surround search"
```

---

## Task 6: Connect surround — outline gap split, wired into stage 2

**Files:**
- Create: `src/lib/cut-pattern/outline-gap.ts`
- Test: `src/lib/cut-pattern/__tests__/outline-gap.test.ts`
- Modify: `src/lib/cut-pattern/drop-holes.ts` (`postProcessBandPath` gains `pageScale`)
- Modify: `src/lib/stores/mergedPathStore.ts` (`applyPostProcess` and `mergedBandPaths` get `pageScale`)
- Modify: `src/lib/cut-pattern/__tests__/drop-holes.test.ts` (append one integration test)

**Interfaces:**
- Consumes: `TaggedPath`, `BandEnds`, `Pt` (Task 1); `BandContourIndex`, `flattenPath` (Task 2); `postProcessBandPath`, `applyPostProcess` (Task 3).
- Produces:
  ```ts
  export const insertGaps = (piece: TaggedPath, points: Pt[], gap: number): TaggedPath[];
  export const applyConnectSurround = (pieces: TaggedPath[], ends: BandEnds, gap: number): TaggedPath[];
  export const postProcessBandPath = (path, index, config, pageScale = 1): TaggedPath[];
  export const applyPostProcess = (raw, indexes, config, pageScale = 1): Map<string, TaggedPath[]>;
  export const pageScaleValue: Readable<number>;
  ```

- [ ] **Step 1: Failing tests**

`outline-gap.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { insertGaps, applyConnectSurround } from '../outline-gap';
import { flattenPath } from '../path-contours';
import type { TaggedPath } from '../post-process-types';
import type { PathSegment } from '$lib/types';

const length = (segs: PathSegment[]) =>
	flattenPath(segs).reduce(
		(n, run) => n + run.slice(1).reduce((m, p, i) => m + Math.hypot(p.x - run[i].x, p.y - run[i].y), 0),
		0
	);
const outline = (segments: PathSegment[]): TaggedPath => ({ geometry: 'pattern-outline', segments, contour: 0 });
const square: PathSegment[] = [['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['L', 0, 10], ['Z']];
const K = 0.5522847498 * 10;
const circle: PathSegment[] = [
	['M', 10, 0],
	['C', 10, K, K, 10, 0, 10],
	['C', -K, 10, -10, K, -10, 0],
	['C', -10, -K, -K, -10, 0, -10],
	['C', K, -10, 10, -K, 10, 0],
	['Z']
];

describe('insertGaps', () => {
	it('cuts one gap per point out of a line contour', () => {
		const out = insertGaps(outline(square), [{ x: 5, y: 0 }, { x: 5, y: 10 }], 2);
		const gaps = out.filter((p) => p.geometry === 'outline-gap');
		const rest = out.filter((p) => p.geometry === 'pattern-outline');
		expect(gaps).toHaveLength(2);
		expect(rest).toHaveLength(1);
		gaps.forEach((g) => expect(length(g.segments)).toBeCloseTo(2, 6));
		expect(length(rest[0].segments)).toBeCloseTo(36, 6);
		expect(rest[0].contour).toBe(0);
	});

	it('cuts gaps out of a cubic contour within tolerance', () => {
		const total = length(circle);
		const out = insertGaps(outline(circle), [{ x: 0, y: -10 }, { x: 0, y: 10 }], 2);
		out.filter((p) => p.geometry === 'outline-gap').forEach((g) => expect(length(g.segments)).toBeCloseTo(2, 1));
		// both sides are 8-sample flattenings of differently split curves; compare to within 0.5
		expect(length(out.find((p) => p.geometry === 'pattern-outline')!.segments)).toBeCloseTo(total - 4, 0);
	});

	it('handles a window that wraps the contour start', () => {
		const out = insertGaps(outline(square), [{ x: 0, y: 0 }], 2);
		const gap = out.find((p) => p.geometry === 'outline-gap')!;
		expect(gap.segments.filter((s) => s[0] === 'M')).toHaveLength(1);
		expect(length(gap.segments)).toBeCloseTo(2, 6);
		expect(length(out.find((p) => p.geometry === 'pattern-outline')!.segments)).toBeCloseTo(38, 6);
	});

	it('merges overlapping windows', () => {
		const gaps = insertGaps(outline(square), [{ x: 4, y: 0 }, { x: 5, y: 0 }], 2).filter(
			(p) => p.geometry === 'outline-gap'
		);
		expect(gaps).toHaveLength(1);
		expect(length(gaps[0].segments)).toBeCloseTo(3, 6);
	});

	it('leaves the piece alone when the gap is at least half the contour', () => {
		expect(insertGaps(outline(square), [{ x: 5, y: 0 }], 20)).toEqual([outline(square)]);
	});
});

describe('applyConnectSurround', () => {
	it('splits the outline piece nearest each end and passes holes through', () => {
		const hole: TaggedPath = {
			geometry: 'pattern-hole',
			segments: [['M', 4, 4], ['L', 6, 4], ['L', 6, 6], ['Z']],
			contour: 1
		};
		const out = applyConnectSurround(
			[outline(square), hole],
			{
				start: { point: { x: 5, y: 0 }, outward: { x: 0, y: -1 } },
				end: { point: { x: 5, y: 10 }, outward: { x: 0, y: 1 } }
			},
			2
		);
		expect(out.filter((p) => p.geometry === 'outline-gap')).toHaveLength(2);
		expect(out).toContainEqual(hole);
	});
});
```

Append to `drop-holes.test.ts` (use the file's config helper, called `cfg` here):

```ts
it('inserts gaps in stage 2 when connect surround is on', () => {
	const path: PathSegment[] = [['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['L', 0, 10], ['Z']];
	const index: BandContourIndex = {
		seed: 1,
		contours: [{ start: 0, end: 5, kind: 'outline', depth: 0, area: 100 }],
		ends: {
			start: { point: { x: 5, y: 0 }, outward: { x: 0, y: -1 } },
			end: { point: { x: 5, y: 10 }, outward: { x: 0, y: 1 } }
		}
	};
	const config = { ...cfg({ mode: 'none' }), connectSurround: { enabled: true, gapMm: 1 } };
	const pieces = postProcessBandPath(path, index, config, 2); // 1 mm × 2 units/mm = 2 units
	expect(pieces.filter((p) => p.geometry === 'outline-gap')).toHaveLength(2);
	expect(
		postProcessBandPath(path, index, { ...config, dropOutline: true }, 2).some((p) => p.geometry === 'outline-gap')
	).toBe(false);
});
```

Run: `npx jest src/lib/cut-pattern/__tests__/outline-gap.test.ts src/lib/cut-pattern/__tests__/drop-holes.test.ts` → FAIL.

- [ ] **Step 2: Implement `outline-gap.ts`**

```ts
import type { PathSegment } from '$lib/types';
import type { BandEnds, Pt, TaggedPath } from './post-process-types';

type Quad4 = [Pt, Pt, Pt, Pt];
type Line = { kind: 'L'; p0: Pt; p1: Pt; len: number };
type Cubic = { kind: 'C'; q: Quad4; len: number; lut: number[] };
type Edge = Line | Cubic;

const LUT_N = 64;
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

const cubicAt = ([p0, c1, c2, p1]: Quad4, t: number): Pt => {
	const u = 1 - t;
	return {
		x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
		y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y
	};
};

/** de Casteljau split at t. */
const splitCubic = (q: Quad4, t: number): [Quad4, Quad4] => {
	const [p0, c1, c2, p1] = q;
	const a = lerp(p0, c1, t);
	const b = lerp(c1, c2, t);
	const c = lerp(c2, p1, t);
	const d = lerp(a, b, t);
	const e = lerp(b, c, t);
	const f = lerp(d, e, t);
	return [[p0, a, d, f], [f, e, c, p1]];
};

/** The part of a cubic between t0 and t1, exactly. */
const subCubic = (q: Quad4, t0: number, t1: number): Quad4 => {
	if (t1 <= 0) return [q[0], q[0], q[0], q[0]];
	const [left] = splitCubic(q, t1);
	return splitCubic(left, t0 / t1)[1];
};

const cubicEdge = (q: Quad4): Cubic => {
	const lut = [0];
	let prev = q[0];
	for (let i = 1; i <= LUT_N; i += 1) {
		const p = cubicAt(q, i / LUT_N);
		lut.push(lut[i - 1] + dist(prev, p));
		prev = p;
	}
	return { kind: 'C', q, len: lut[LUT_N], lut };
};

/** t at arc length s along a cubic, from the sampled table. */
const tAt = (e: Cubic, s: number): number => {
	if (s <= 0) return 0;
	if (s >= e.len) return 1;
	let i = 1;
	while (e.lut[i] < s) i += 1;
	const f = (s - e.lut[i - 1]) / (e.lut[i] - e.lut[i - 1] || 1);
	return (i - 1 + f) / LUT_N;
};

/** Arc length at t along a cubic, from the sampled table. */
const sAt = (e: Cubic, t: number): number => {
	const x = t * LUT_N;
	const i = Math.min(LUT_N - 1, Math.floor(x));
	return e.lut[i] + (e.lut[i + 1] - e.lut[i]) * (x - i);
};

/** Edges of a single closed `M … Z` run, or null for anything else. */
const edgesOf = (segs: PathSegment[]): Edge[] | null => {
	if (segs.length < 2 || segs[0][0] !== 'M') return null;
	if (segs.slice(1).some((s) => s[0] === 'M')) return null;
	if (segs[segs.length - 1][0] !== 'Z') return null;
	const start = { x: segs[0][1] as number, y: segs[0][2] as number };
	let cur = start;
	const edges: Edge[] = [];
	for (const s of segs.slice(1)) {
		if (s[0] === 'L' || s[0] === 'A') {
			// Merged paths contain no arcs; treat one as its chord rather than fail.
			const p1 = s[0] === 'L' ? { x: s[1], y: s[2] } : { x: s[6], y: s[7] };
			edges.push({ kind: 'L', p0: cur, p1, len: dist(cur, p1) });
			cur = p1;
		} else if (s[0] === 'C') {
			const p1 = { x: s[5], y: s[6] };
			edges.push(cubicEdge([cur, { x: s[1], y: s[2] }, { x: s[3], y: s[4] }, p1]));
			cur = p1;
		} else if (s[0] === 'Q') {
			const c = { x: s[1], y: s[2] };
			const p1 = { x: s[3], y: s[4] };
			edges.push(cubicEdge([cur, lerp(cur, c, 2 / 3), lerp(p1, c, 2 / 3), p1]));
			cur = p1;
		} else if (s[0] === 'Z') {
			if (dist(cur, start) > 1e-9) edges.push({ kind: 'L', p0: cur, p1: start, len: dist(cur, start) });
			cur = start;
		}
	}
	return edges.filter((e) => e.len > 1e-12);
};

const cumulative = (edges: Edge[]) => {
	const cum = [0];
	for (const e of edges) cum.push(cum[cum.length - 1] + e.len);
	return cum;
};

const pointAtEdge = (e: Edge, s: number): Pt =>
	e.kind === 'L' ? lerp(e.p0, e.p1, s / e.len) : cubicAt(e.q, tAt(e, s));

const pointAt = (edges: Edge[], cum: number[], s: number): Pt => {
	let i = 0;
	while (i < edges.length - 1 && cum[i + 1] < s) i += 1;
	return pointAtEdge(edges[i], s - cum[i]);
};

/** Arc-length position of the contour point closest to `p`, and its distance. */
const closestArc = (edges: Edge[], cum: number[], p: Pt): { s: number; d: number } => {
	let best = { s: 0, d: Infinity };
	edges.forEach((e, i) => {
		if (e.kind === 'L') {
			const dx = e.p1.x - e.p0.x;
			const dy = e.p1.y - e.p0.y;
			const t = Math.max(0, Math.min(1, ((p.x - e.p0.x) * dx + (p.y - e.p0.y) * dy) / (e.len * e.len)));
			const d = dist(p, lerp(e.p0, e.p1, t));
			if (d < best.d) best = { s: cum[i] + t * e.len, d };
			return;
		}
		let bi = 0;
		let bd = Infinity;
		for (let k = 0; k <= LUT_N; k += 1) {
			const d = dist(p, cubicAt(e.q, k / LUT_N));
			if (d < bd) {
				bd = d;
				bi = k;
			}
		}
		let lo = Math.max(0, (bi - 1) / LUT_N);
		let hi = Math.min(1, (bi + 1) / LUT_N);
		for (let it = 0; it < 40; it += 1) {
			const m1 = lo + (hi - lo) / 3;
			const m2 = hi - (hi - lo) / 3;
			if (dist(p, cubicAt(e.q, m1)) < dist(p, cubicAt(e.q, m2))) hi = m2;
			else lo = m1;
		}
		const t = (lo + hi) / 2;
		const d = dist(p, cubicAt(e.q, t));
		if (d < best.d) best = { s: cum[i] + sAt(e, t), d };
	});
	return best;
};

/** Open path covering arc length [from, to], 0 ≤ from < to ≤ total. */
const slice = (edges: Edge[], cum: number[], from: number, to: number): PathSegment[] => {
	const start = pointAt(edges, cum, from);
	const out: PathSegment[] = [['M', start.x, start.y]];
	edges.forEach((e, i) => {
		const s0 = Math.max(from, cum[i]) - cum[i];
		const s1 = Math.min(to, cum[i + 1]) - cum[i];
		if (s1 - s0 <= 1e-9) return;
		if (e.kind === 'L') {
			const p = pointAtEdge(e, s1);
			out.push(['L', p.x, p.y]);
		} else {
			const [, c1, c2, p1] = subCubic(e.q, tAt(e, s0), tAt(e, s1));
			out.push(['C', c1.x, c1.y, c2.x, c2.y, p1.x, p1.y]);
		}
	});
	return out;
};

/** Like `slice`, but `from` may be anywhere and the span may wrap past the start. */
const sliceCyclic = (edges: Edge[], cum: number[], from: number, span: number): PathSegment[] => {
	const total = cum[cum.length - 1];
	const f = ((from % total) + total) % total;
	if (f + span <= total + 1e-9) return slice(edges, cum, f, Math.min(total, f + span));
	const head = slice(edges, cum, f, total);
	const tail = slice(edges, cum, 0, f + span - total);
	return [...head, ...tail.slice(1)];
};

/**
 * Cut a gap of arc length `gap`, centred on the contour point nearest each of
 * `points`, out of one closed outline piece. The cut-out stretches come back as
 * `outline-gap` pieces; the rest stays `pattern-outline` (now open runs).
 * Overlapping windows merge. If the gaps would total half the contour or more,
 * the piece would be cut loose, so it is returned untouched.
 */
export const insertGaps = (piece: TaggedPath, points: Pt[], gap: number): TaggedPath[] => {
	const edges = edgesOf(piece.segments);
	if (!edges || edges.length === 0 || points.length === 0 || !(gap > 0)) return [piece];
	const cum = cumulative(edges);
	const total = cum[cum.length - 1];
	if (gap >= total / 2) return [piece];

	const windows = points
		.map((p) => closestArc(edges, cum, p).s - gap / 2)
		.map((s) => ({ start: ((s % total) + total) % total, span: gap }))
		.sort((a, b) => a.start - b.start);
	const merged: { start: number; span: number }[] = [];
	for (const w of windows) {
		const last = merged[merged.length - 1];
		if (last && w.start <= last.start + last.span) {
			last.span = Math.max(last.span, w.start + w.span - last.start);
		} else merged.push({ ...w });
	}
	if (merged.length > 1) {
		const first = merged[0];
		const last = merged[merged.length - 1];
		if (last.start + last.span >= first.start + total) {
			last.span = Math.max(last.span, first.start + total + first.span - last.start);
			merged.shift();
		}
	}
	if (merged.reduce((n, w) => n + w.span, 0) >= total / 2) return [piece];

	const outlineSegs: PathSegment[] = [];
	const gaps: TaggedPath[] = [];
	merged.forEach((w, k) => {
		gaps.push({
			geometry: 'outline-gap',
			segments: sliceCyclic(edges, cum, w.start, w.span),
			contour: piece.contour
		});
		const next = merged[(k + 1) % merged.length];
		const restStart = w.start + w.span;
		const restEnd = k + 1 < merged.length ? next.start : next.start + total;
		if (restEnd - restStart > 1e-9) outlineSegs.push(...sliceCyclic(edges, cum, restStart, restEnd - restStart));
	});
	return [{ geometry: 'pattern-outline', segments: outlineSegs, contour: piece.contour }, ...gaps];
};

/** Distance from `p` to a closed outline piece, or Infinity when it is not one. */
const distanceTo = (piece: TaggedPath, p: Pt): number => {
	const edges = edgesOf(piece.segments);
	if (!edges || edges.length === 0) return Infinity;
	return closestArc(edges, cumulative(edges), p).d;
};

/** Connect surround: one gap per band end, in whichever outline piece the end lies on. */
export const applyConnectSurround = (pieces: TaggedPath[], ends: BandEnds, gap: number): TaggedPath[] => {
	const assigned = new Map<number, Pt[]>();
	for (const end of [ends.start, ends.end]) {
		let bestI = -1;
		let bestD = Infinity;
		pieces.forEach((piece, i) => {
			if (piece.geometry !== 'pattern-outline') return;
			const d = distanceTo(piece, end.point);
			if (d < bestD) {
				bestD = d;
				bestI = i;
			}
		});
		if (bestI >= 0) assigned.set(bestI, [...(assigned.get(bestI) ?? []), end.point]);
	}
	return pieces.flatMap((piece, i) =>
		assigned.has(i) ? insertGaps(piece, assigned.get(i)!, gap) : [piece]
	);
};
```

- [ ] **Step 3: Wire into stage 2**

In `drop-holes.ts`, import `applyConnectSurround` from `./outline-gap`, change the signature to `(path, index, config, pageScale = 1)`, and at the end of `postProcessBandPath` replace `return pieces;` with:

```ts
	const cs = config.connectSurround;
	if (cs?.enabled && !config.dropOutline && index.ends) {
		return applyConnectSurround(pieces, index.ends, cs.gapMm * pageScale);
	}
	return pieces;
```

In `mergedPathStore.ts`, `applyPostProcess(raw, indexes, config, pageScale = 1)` passes `pageScale` through to `postProcessBandPath`. Add a narrowed page-scale store and feed it to `mergedBandPaths`:

```ts
let lastPageScale = NaN;
/** `pageLayout.pageScale`, emitting only when it changes. */
export const pageScaleValue = derived<typeof patternConfigStore, number>(
	patternConfigStore,
	($config, set) => {
		const next = $config.patternConfig.pageLayout?.pageScale ?? 1;
		if (next === lastPageScale) return;
		lastPageScale = next;
		set(next);
	},
	1
);

export const mergedBandPaths = derived(
	[mergedBandPathsRaw, bandContourIndexes, postProcessConfig, pageScaleValue],
	([$raw, $indexes, $config, $pageScale]) => applyPostProcess($raw, $indexes, $config, $pageScale)
);
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/lib/cut-pattern src/lib/stores` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cut-pattern/outline-gap.ts src/lib/cut-pattern/__tests__/outline-gap.test.ts src/lib/cut-pattern/drop-holes.ts src/lib/cut-pattern/__tests__/drop-holes.test.ts src/lib/stores/mergedPathStore.ts
git commit -m "feat(post-process): connect surround — outline gaps at band ends"
```

---

## Task 7: Page labels — text, measurement, placement (pure)

**Files:**
- Create: `src/lib/svg-text-metrics.ts`
- Create: `src/lib/cut-pattern/page-post-process/page-label.ts`
- Test: `src/lib/cut-pattern/page-post-process/__tests__/page-label.test.ts`
- Modify: `src/components/cut-pattern/SvgText/svg-text.ts` (use the shared `CHAR_GAP`)

**Interfaces:**
- Consumes: `PlacedBand`, `Disconnect`, `PageLabelResult`, `Pt` (Task 1); `PageLabelConfig` (Task 1); `PageRect`; `pointInPolygon`; `segmentsIntersect`, `segmentsOf` and `Seg` from `./segments` (**Task 5, which runs in parallel**). If `segments.ts` is not on your branch, create it with exactly Task 5's `segments.ts` content (copy it from Task 5 in this plan), but do NOT commit it. Report that you did this; Task 5's commit supplies the file.
- Produces:
  ```ts
  // svg-text-metrics.ts
  export const CHAR_GAP = 0.3;
  // page-label.ts
  export type GlyphDict = Record<string, { path: PathSegment[]; width: number }>;
  export const PAGE_LABEL_HEIGHT_MM = 4;
  export const composePageLabel = (cfg: PageLabelConfig | undefined, configName: string | undefined, pageIndex: number, pageCount: number): string;
  export const sanitizeLabelText = (text: string, dict: GlyphDict): string;
  export const measureText = (text: string, dict: GlyphDict): { minX: number; minY: number; maxX: number; maxY: number };
  export const placeBox = (args: { content: Box; width: number; height: number; obstacles: Seg[]; solids: Pt[][] }): Pt | null; // top-left
  export const buildPageLabels = (args: { pages: PageRect[]; marginPx: number; pageScale: number; bands: PlacedBand[]; disconnects: Disconnect[]; config: PageLabelConfig | undefined; configName: string | undefined; dict: GlyphDict }): PageLabelResult[];
  ```
  A `PageLabelResult` renders as `<SvgText string={text} anchor={origin} size={size} offset={{ x: 0, y: 0 }} geometry="page-label" />`. The `svgTextDictionary` store value is a `GlyphDict` (its entries carry `path` and `width`).

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from '@jest/globals';
import {
	composePageLabel,
	sanitizeLabelText,
	measureText,
	placeBox,
	buildPageLabels,
	type GlyphDict
} from '../page-label';
import type { PlacedBand } from '../../post-process-types';
import type { PathSegment } from '$lib/types';

const glyphPath: PathSegment[] = [['M', 0, 0], ['L', 1, 0], ['L', 1, 1]];
const glyph = { path: glyphPath, width: 1 };
const dict: GlyphDict = {
	a: glyph, b: glyph, '?': glyph, o: glyph, f: glyph, '1': glyph, '2': glyph,
	' ': { path: [], width: 0.5 }
};
const rectPoly = (x0: number, y0: number, x1: number, y1: number) => [
	{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }
];

describe('composePageLabel', () => {
	it('joins the enabled parts', () => {
		expect(composePageLabel({ text: 'hello', configName: true, pageNumber: true }, 'shade', 0, 3)).toBe('hello - shade - 1 of 3');
		expect(composePageLabel({ text: '', configName: false, pageNumber: true }, 'shade', 1, 3)).toBe('2 of 3');
		expect(composePageLabel({ text: '', configName: true, pageNumber: false }, undefined, 0, 1)).toBe('');
		expect(composePageLabel(undefined, 'x', 0, 1)).toBe('');
	});
});

describe('sanitizeLabelText', () => {
	it('replaces glyphs the font lacks with ?', () => {
		expect(sanitizeLabelText('ab🙂é', dict)).toBe('ab??');
	});
});

describe('measureText', () => {
	it('spans every glyph at its offset', () => {
		const box = measureText('ab', dict);
		expect(box.minY).toBe(0);
		expect(box.maxY).toBe(1);
		expect(box.maxX - box.minX).toBeGreaterThan(1.5);
	});
});

describe('placeBox', () => {
	const content = { x: 10, y: 10, width: 80, height: 80 };
	it('sits in the bottom-right corner of an empty page', () => {
		const p = placeBox({ content, width: 20, height: 5, obstacles: [], solids: [] })!;
		expect(p.x + 20).toBeCloseTo(90, 6);
		expect(p.y + 5).toBeCloseTo(90, 6);
	});
	it('avoids a band covering the corner', () => {
		const p = placeBox({ content, width: 20, height: 5, obstacles: [], solids: [rectPoly(40, 60, 95, 95)] })!;
		expect(p.x + 20 > 40 && p.y + 5 > 60).toBe(false);
	});
	it('returns null when nothing fits', () => {
		expect(placeBox({ content, width: 20, height: 5, obstacles: [], solids: [rectPoly(0, 0, 100, 100)] })).toBeNull();
	});
});

describe('buildPageLabels', () => {
	it('numbers pages and flags unplaceable ones', () => {
		const pages = [{ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 110, width: 100, height: 100 }];
		const full: PlacedBand = { bandId: 'f', page: 1, outlines: [rectPoly(0, 110, 100, 210)], holes: [] };
		const labels = buildPageLabels({
			pages, marginPx: 5, pageScale: 1, bands: [full], disconnects: [],
			config: { text: '', configName: false, pageNumber: true }, configName: undefined, dict
		});
		expect(labels.map((l) => l.text)).toEqual(['1 of 2', '2 of 2']);
		expect(labels[0].unplaced).toBeUndefined();
		expect(labels[1].unplaced).toBe(true);
	});
	it('returns nothing when the label is empty', () => {
		expect(
			buildPageLabels({
				pages: [{ x: 0, y: 0, width: 100, height: 100 }], marginPx: 5, pageScale: 1, bands: [],
				disconnects: [], config: undefined, configName: 'x', dict
			})
		).toEqual([]);
	});
});
```

Run: `npx jest src/lib/cut-pattern/page-post-process/__tests__/page-label.test.ts` → FAIL.

- [ ] **Step 2: Share the glyph gap**

Create `src/lib/svg-text-metrics.ts`:

```ts
/** Horizontal gap between stroke-font glyphs, in glyph units. Read by SvgText layout and label measurement. */
export const CHAR_GAP = 0.3;
```

In `src/components/cut-pattern/SvgText/svg-text.ts`: delete `const GAP = 0.3;`, add `import { CHAR_GAP } from '$lib/svg-text-metrics';`, and replace its single use in `getChars` (`width + GAP`) with `width + CHAR_GAP`.

- [ ] **Step 3: Implement `page-label.ts`**

```ts
import type { PathSegment } from '$lib/types';
import { CHAR_GAP } from '$lib/svg-text-metrics';
import type { PageRect } from '../page-layout/types';
import type { PageLabelConfig } from '../hole-drop-config';
import type { Disconnect, PageLabelResult, PlacedBand, Pt } from '../post-process-types';
import { pointInPolygon } from '../path-contours';
import { segmentsIntersect, segmentsOf, type Seg } from './segments';

/** The processed stroke-font dictionary (`svgTextDictionary`), narrowed to what is read here. */
export type GlyphDict = Record<string, { path: PathSegment[]; width: number }>;

export const PAGE_LABEL_HEIGHT_MM = 4;

type Box = { x: number; y: number; width: number; height: number };

export const composePageLabel = (
	cfg: PageLabelConfig | undefined,
	configName: string | undefined,
	pageIndex: number,
	pageCount: number
): string => {
	if (!cfg) return '';
	return [
		cfg.text.trim(),
		cfg.configName ? (configName?.trim() ?? '') : '',
		cfg.pageNumber ? `${pageIndex + 1} of ${pageCount}` : ''
	]
		.filter(Boolean)
		.join(' - ');
};

/** The stroke font has a fixed glyph set; any other character would crash `getChars`. */
export const sanitizeLabelText = (text: string, dict: GlyphDict): string =>
	[...text].map((c) => (dict[c] ? c : '?')).join('');

/**
 * Glyph-space bbox of `text` as SvgText lays it out with `offset: {x: 0, y: 0}`:
 * each glyph at `running - width / 2`, advancing by `width + CHAR_GAP`.
 */
export const measureText = (text: string, dict: GlyphDict) => {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	let running = 0;
	for (const c of [...text]) {
		const g = dict[c];
		if (!g) continue;
		running += g.width + CHAR_GAP;
		const dx = running - g.width / 2;
		for (const s of g.path) {
			for (let i = 1; i + 1 < s.length; i += 2) {
				const x = (s[i] as number) + dx;
				const y = s[i + 1] as number;
				minX = Math.min(minX, x);
				maxX = Math.max(maxX, x);
				minY = Math.min(minY, y);
				maxY = Math.max(maxY, y);
			}
		}
	}
	if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
	return { minX, minY, maxX, maxY };
};

const boxHits = (b: Box, obstacles: Seg[], solids: Pt[][]): boolean => {
	const corners = [
		{ x: b.x, y: b.y },
		{ x: b.x + b.width, y: b.y },
		{ x: b.x + b.width, y: b.y + b.height },
		{ x: b.x, y: b.y + b.height }
	];
	const edges: Seg[] = corners.map((a, i) => ({ a, b: corners[(i + 1) % 4] }));
	const inBox = (p: Pt) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
	for (const s of [...obstacles, ...segmentsOf(solids)]) {
		if (inBox(s.a) || inBox(s.b)) return true;
		if (edges.some((e) => segmentsIntersect(e, s))) return true;
	}
	const centre = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
	return solids.some((poly) => poly.length > 3 && pointInPolygon(centre, poly));
};

/**
 * First box position — scanning from the bottom-right of `content` leftwards,
 * then upwards — that touches no obstacle segment and sits in no solid.
 * Exact segment tests, not bboxes: a curved band's bbox covers the corner.
 * Returns the box's top-left, or null.
 */
export const placeBox = (args: {
	content: Box;
	width: number;
	height: number;
	obstacles: Seg[];
	solids: Pt[][];
}): Pt | null => {
	const { content, width, height, obstacles, solids } = args;
	if (!(width > 0) || !(height > 0) || width > content.width || height > content.height) return null;
	const stepX = width / 4;
	const stepY = height / 2;
	for (let y = content.y + content.height - height; y >= content.y - 1e-9; y -= stepY) {
		for (let x = content.x + content.width - width; x >= content.x - 1e-9; x -= stepX) {
			if (!boxHits({ x, y, width, height }, obstacles, solids)) return { x, y };
		}
	}
	return null;
};

export const buildPageLabels = (args: {
	pages: PageRect[];
	marginPx: number;
	pageScale: number;
	bands: PlacedBand[];
	disconnects: Disconnect[];
	config: PageLabelConfig | undefined;
	configName: string | undefined;
	dict: GlyphDict;
}): PageLabelResult[] => {
	const { pages, marginPx, pageScale, bands, disconnects, config, configName, dict } = args;
	const out: PageLabelResult[] = [];
	pages.forEach((page, p) => {
		const text = sanitizeLabelText(composePageLabel(config, configName, p, pages.length), dict);
		if (!text) return;
		const m = measureText(text, dict);
		const glyphH = m.maxY - m.minY || 1;
		const size = (PAGE_LABEL_HEIGHT_MM * pageScale) / glyphH;
		const clearance = size * 0.5;
		const width = (m.maxX - m.minX) * size + 2 * clearance;
		const height = glyphH * size + 2 * clearance;
		const onPage = bands.filter((b) => b.page === p);
		const at = placeBox({
			content: {
				x: page.x + marginPx,
				y: page.y + marginPx,
				width: page.width - 2 * marginPx,
				height: page.height - 2 * marginPx
			},
			width,
			height,
			obstacles: [
				...onPage.flatMap((b) => segmentsOf(b.holes)),
				...disconnects.filter((d) => d.page === p).map((d) => ({ a: d.a, b: d.b }))
			],
			solids: onPage.flatMap((b) => b.outlines)
		});
		if (!at) {
			out.push({ page: p, text, origin: { x: 0, y: 0 }, size, unplaced: true });
			return;
		}
		out.push({
			page: p,
			text,
			size,
			origin: { x: at.x + clearance - m.minX * size, y: at.y + clearance - m.minY * size }
		});
	});
	return out;
};
```

Band outlines are passed as `solids`, so both their edges and their interiors block the label. After gap insertion, outline runs are open. Their edges still block the label; containment only counts for closed runs.

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/lib/cut-pattern/page-post-process/__tests__/page-label.test.ts` → PASS.
Run: `npx jest src/components src/lib/cut-pattern` → still PASS after the `CHAR_GAP` move.

- [ ] **Step 5: Commit**

```bash
git add src/lib/svg-text-metrics.ts src/lib/cut-pattern/page-post-process/page-label.ts src/lib/cut-pattern/page-post-process/__tests__/page-label.test.ts src/components/cut-pattern/SvgText/svg-text.ts
git commit -m "feat(post-process): page label text, measurement and placement"
```

---

## Task 8: LightBurn `.lbrn2` writer, path encoding, template parsing

**Files:**
- Create: `src/lib/lightburn/lbrn2-path.ts`, `src/lib/lightburn/lbrn2-writer.ts`, `src/lib/lightburn/template.ts`
- Test: `src/lib/lightburn/__tests__/lbrn2-path.test.ts`, `lbrn2-writer.test.ts`, `template.test.ts`

**Interfaces:**
- Consumes: `LbProject`, `LbShape` (Task 1); `layerByIndex`, `isToolLayer` (Task 1).
- Produces:
  ```ts
  // lbrn2-path.ts
  export const fmt = (n: number): string;
  export const toCubicSegments = (segs: PathSegment[]): PathSegment[]; // output only M, L, C, Z
  export const encodeSubpaths = (segs: PathSegment[]): { vertList: string; primList: string }[]; // input M/L/C/Z
  // template.ts
  export type ParsedTemplate = { cutSettings: Map<number, string> };
  export const parseTemplate = (xml: string): ParsedTemplate; // throws Error('Not a LightBurn project file')
  // lbrn2-writer.ts
  export const writeLbrn2 = (project: LbProject, templateXml?: string): { xml: string; missingLayers: number[] };
  ```

- [ ] **Step 1: Failing tests**

`lbrn2-path.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { encodeSubpaths, toCubicSegments, fmt } from '../lbrn2-path';

describe('fmt', () => {
	it('rounds to 6 places with no -0', () => {
		expect(fmt(1.23456789)).toBe('1.234568');
		expect(fmt(-0.0000001)).toBe('0');
		expect(fmt(10)).toBe('10');
	});
});

describe('encodeSubpaths', () => {
	it('encodes a closed polyline', () => {
		expect(encodeSubpaths([['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['L', 0, 10], ['Z']])).toEqual([
			{
				vertList: 'V0 0c0x1c1x1V10 0c0x1c1x1V10 10c0x1c1x1V0 10c0x1c1x1',
				primList: 'L0 1L1 2L2 3L3 0'
			}
		]);
	});

	it('stores cubic controls as c0 on the start and c1 on the end vertex', () => {
		expect(encodeSubpaths([['M', 0, 0], ['C', 0, 5, 5, 10, 10, 10]])).toEqual([
			{ vertList: 'V0 0c0x0c0y5c1x1V10 10c0x1c1x5c1y10', primList: 'B0 1' }
		]);
	});

	it('folds a closing point that repeats the start into vertex 0', () => {
		const [enc] = encodeSubpaths([['M', 0, 0], ['L', 10, 0], ['C', 10, 5, 5, 5, 0, 0], ['Z']]);
		expect(enc.primList).toBe('L0 1B1 0');
		expect(enc.vertList).toBe('V0 0c0x1c1x5c1y5V10 0c0x10c0y5c1x1');
	});

	it('emits one entry per M-run', () => {
		expect(encodeSubpaths([['M', 0, 0], ['L', 1, 0], ['M', 5, 5], ['L', 6, 5]])).toHaveLength(2);
	});

	it('rejects arcs', () => {
		expect(() => encodeSubpaths([['M', 0, 0], ['A', 1, 1, 0, 0, 1, 2, 0]])).toThrow();
	});
});

describe('toCubicSegments', () => {
	it('elevates quadratics exactly', () => {
		expect(toCubicSegments([['M', 0, 0], ['Q', 3, 3, 6, 0]])[1]).toEqual(['C', 2, 2, 4, 2, 6, 0]);
	});

	it('turns a half-circle arc into cubics ending on the endpoint', () => {
		const out = toCubicSegments([['M', -10, 0], ['A', 10, 10, 0, 0, 1, 10, 0]]);
		expect(out.every((s) => ['M', 'L', 'C', 'Z'].includes(s[0]))).toBe(true);
		const last = out[out.length - 1];
		expect(last[0]).toBe('C');
		expect(last[5]).toBeCloseTo(10, 9);
		expect(last[6]).toBeCloseTo(0, 9);
		expect(out.length).toBeGreaterThanOrEqual(3);
	});
});
```

`template.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { parseTemplate } from '../template';

const TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<LightBurnProject AppVersion="1.7.08" FormatVersion="1">
    <CutSetting type="Cut">
        <index Value="0"/>
        <name Value="Cut paper"/>
        <maxPower Value="35"/>
        <speed Value="40"/>
    </CutSetting>
    <CutSetting type="Cut">
        <index Value="2"/>
        <name Value="Score"/>
        <maxPower Value="8"/>
    </CutSetting>
    <CutSetting_Img type="Image">
        <index Value="5"/>
    </CutSetting_Img>
</LightBurnProject>`;

describe('parseTemplate', () => {
	it('extracts CutSetting blocks verbatim by index', () => {
		const t = parseTemplate(TEMPLATE);
		expect([...t.cutSettings.keys()]).toEqual([0, 2]);
		expect(t.cutSettings.get(0)).toContain('<maxPower Value="35"/>');
		expect(t.cutSettings.get(0)!.startsWith('<CutSetting type="Cut">')).toBe(true);
		expect(t.cutSettings.get(0)!.endsWith('</CutSetting>')).toBe(true);
	});

	it('rejects a file that is not a LightBurn project', () => {
		expect(() => parseTemplate('<svg></svg>')).toThrow('Not a LightBurn project file');
	});
});
```

`lbrn2-writer.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { writeLbrn2 } from '../lbrn2-writer';
import type { LbProject } from '../types';

const project: LbProject = {
	pages: [
		{
			shapes: [
				{ kind: 'rect', cutIndex: 30, x: 0, y: 0, width: 300, height: 300 },
				{ kind: 'path', cutIndex: 0, segments: [['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['Z']] },
				{ kind: 'path', cutIndex: 1, segments: [['M', 1, 1], ['L', 2, 2]] }
			]
		},
		{ shapes: [{ kind: 'rect', cutIndex: 30, x: 0, y: 310, width: 300, height: 300 }] }
	]
};
const TEMPLATE = `<LightBurnProject><CutSetting type="Cut">
        <index Value="0"/>
        <name Value="Cut paper"/>
        <maxPower Value="35"/>
    </CutSetting></LightBurnProject>`;

const balanced = (xml: string, tag: string) =>
	(xml.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length ===
	(xml.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;

describe('writeLbrn2', () => {
	it('writes one Group per page with each page rect centred', () => {
		const { xml } = writeLbrn2(project);
		expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
		expect((xml.match(/<Shape Type="Group"/g) ?? []).length).toBe(2);
		expect(xml).toContain('<Shape Type="Rect" CutIndex="30" W="300" H="300" Cr="0">');
		expect(xml).toContain('<XForm>1 0 0 1 150 150</XForm>');
		expect(xml).toContain('<XForm>1 0 0 1 150 460</XForm>');
		expect(balanced(xml, 'Shape')).toBe(true);
		expect(balanced(xml, 'Children')).toBe(true);
		expect(balanced(xml, 'CutSetting')).toBe(true);
	});

	it('copies template CutSettings verbatim and reports missing layers', () => {
		const { xml, missingLayers } = writeLbrn2(project, TEMPLATE);
		expect(xml).toContain('<maxPower Value="35"/>');
		expect(missingLayers).toEqual([1]);
		expect(xml).toMatch(/<CutSetting type="Cut">\s*<index Value="1"\/>\s*<name Value="C01"\/>/);
	});

	it('gives tool layers no CutSetting', () => {
		const { xml, missingLayers } = writeLbrn2(project);
		expect(xml).not.toContain('<index Value="30"/>');
		expect(missingLayers).toEqual([0, 1]);
	});

	it('writes path shapes with encoded vertices', () => {
		const { xml } = writeLbrn2(project);
		expect(xml).toContain('<Shape Type="Path" CutIndex="0">');
		expect(xml).toContain('<PrimList>L0 1L1 2L2 0</PrimList>');
	});
});
```

Run: `npx jest src/lib/lightburn` → FAIL.

- [ ] **Step 2: Implement `lbrn2-path.ts`**

```ts
import type { PathSegment } from '$lib/types';

type Pt = { x: number; y: number };

export const fmt = (n: number): string => {
	const r = Math.round(n * 1e6) / 1e6;
	return r === 0 ? '0' : String(r);
};

/** SVG endpoint arc → cubic Béziers of at most 90° each (centre parameterisation). */
const arcToCubics = (
	p0: Pt,
	rxIn: number,
	ryIn: number,
	phiDeg: number,
	largeArc: boolean,
	sweep: boolean,
	p1: Pt
): PathSegment[] => {
	if (p0.x === p1.x && p0.y === p1.y) return [];
	if (rxIn === 0 || ryIn === 0) return [['L', p1.x, p1.y]];
	let rx = Math.abs(rxIn);
	let ry = Math.abs(ryIn);
	const phi = (phiDeg * Math.PI) / 180;
	const cos = Math.cos(phi);
	const sin = Math.sin(phi);
	const dx = (p0.x - p1.x) / 2;
	const dy = (p0.y - p1.y) / 2;
	const x1p = cos * dx + sin * dy;
	const y1p = -sin * dx + cos * dy;
	const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
	if (lambda > 1) {
		rx *= Math.sqrt(lambda);
		ry *= Math.sqrt(lambda);
	}
	const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
	const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
	let coef = Math.sqrt(Math.max(0, num / den));
	if (largeArc === sweep) coef = -coef;
	const cxp = (coef * rx * y1p) / ry;
	const cyp = (-coef * ry * x1p) / rx;
	const cx = cos * cxp - sin * cyp + (p0.x + p1.x) / 2;
	const cy = sin * cxp + cos * cyp + (p0.y + p1.y) / 2;
	const ang = (ux: number, uy: number, vx: number, vy: number) =>
		Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
	const theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
	let dtheta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
	if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
	else if (sweep && dtheta < 0) dtheta += 2 * Math.PI;
	const n = Math.max(1, Math.ceil(Math.abs(dtheta) / (Math.PI / 2) - 1e-9));
	const delta = dtheta / n;
	const k = (4 / 3) * Math.tan(delta / 4);
	const at = (a: number): Pt => ({
		x: cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin,
		y: cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos
	});
	const deriv = (a: number): Pt => ({
		x: -rx * Math.sin(a) * cos - ry * Math.cos(a) * sin,
		y: -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos
	});
	const out: PathSegment[] = [];
	for (let i = 0; i < n; i += 1) {
		const a0 = theta1 + i * delta;
		const a1 = a0 + delta;
		const s = at(a0);
		const e = i === n - 1 ? p1 : at(a1);
		const d0 = deriv(a0);
		const d1 = deriv(a1);
		out.push(['C', s.x + k * d0.x, s.y + k * d0.y, e.x - k * d1.x, e.y - k * d1.y, e.x, e.y]);
	}
	return out;
};

/** Normalise to M, L, C, Z — the primitives LightBurn's condensed format has. */
export const toCubicSegments = (segs: PathSegment[]): PathSegment[] => {
	const out: PathSegment[] = [];
	let cur: Pt = { x: 0, y: 0 };
	let start: Pt = cur;
	for (const s of segs) {
		switch (s[0]) {
			case 'M':
				cur = start = { x: s[1], y: s[2] };
				out.push(s);
				break;
			case 'L':
				cur = { x: s[1], y: s[2] };
				out.push(s);
				break;
			case 'C':
				cur = { x: s[5], y: s[6] };
				out.push(s);
				break;
			case 'Q': {
				const c = { x: s[1], y: s[2] };
				const p1 = { x: s[3], y: s[4] };
				out.push([
					'C',
					cur.x + (2 / 3) * (c.x - cur.x),
					cur.y + (2 / 3) * (c.y - cur.y),
					p1.x + (2 / 3) * (c.x - p1.x),
					p1.y + (2 / 3) * (c.y - p1.y),
					p1.x,
					p1.y
				]);
				cur = p1;
				break;
			}
			case 'A': {
				const p1 = { x: s[6], y: s[7] };
				out.push(...arcToCubics(cur, s[1], s[2], s[3], s[4] === 1, s[5] === 1, p1));
				cur = p1;
				break;
			}
			case 'Z':
				out.push(s);
				cur = start;
				break;
		}
	}
	return out;
};

type Vertex = { x: number; y: number; c0?: Pt; c1?: Pt };
type Prim = { type: 'L' | 'B'; i: number; j: number };

const same = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

const encodeRun = (verts: Vertex[], prims: Prim[]) => ({
	vertList: verts
		.map(
			(v) =>
				`V${fmt(v.x)} ${fmt(v.y)}` +
				(v.c0 ? `c0x${fmt(v.c0.x)}c0y${fmt(v.c0.y)}` : 'c0x1') +
				(v.c1 ? `c1x${fmt(v.c1.x)}c1y${fmt(v.c1.y)}` : 'c1x1')
		)
		.join(''),
	primList: prims.map((p) => `${p.type}${p.i} ${p.j}`).join('')
});

/**
 * LightBurn condensed (`FormatVersion="1"`) VertList/PrimList, one entry per
 * M-run. `c0` is a vertex's outgoing control point, `c1` its incoming one;
 * `c0x1`/`c1x1` mean "none" (inferred from LightBurn 1.7.08 files — see the
 * research doc). Input must already be M/L/C/Z (`toCubicSegments`).
 */
export const encodeSubpaths = (segs: PathSegment[]): { vertList: string; primList: string }[] => {
	const out: { vertList: string; primList: string }[] = [];
	let verts: Vertex[] = [];
	let prims: Prim[] = [];
	const flush = () => {
		if (prims.length > 0) out.push(encodeRun(verts, prims));
		verts = [];
		prims = [];
	};
	for (const s of segs) {
		if (s[0] === 'M') {
			flush();
			verts.push({ x: s[1], y: s[2] });
		} else if (s[0] === 'L') {
			verts.push({ x: s[1], y: s[2] });
			prims.push({ type: 'L', i: verts.length - 2, j: verts.length - 1 });
		} else if (s[0] === 'C') {
			verts[verts.length - 1].c0 = { x: s[1], y: s[2] };
			verts.push({ x: s[5], y: s[6], c1: { x: s[3], y: s[4] } });
			prims.push({ type: 'B', i: verts.length - 2, j: verts.length - 1 });
		} else if (s[0] === 'Z') {
			if (verts.length < 2) continue;
			const last = verts[verts.length - 1];
			if (same(last, verts[0])) {
				// The run already returns to its start: fold the duplicate into vertex 0.
				verts[0].c1 = last.c1;
				verts.pop();
				prims[prims.length - 1].j = 0;
			} else {
				prims.push({ type: 'L', i: verts.length - 1, j: 0 });
			}
		} else {
			throw new Error(`encodeSubpaths: unsupported segment ${s[0]}; run toCubicSegments first`);
		}
	}
	flush();
	return out;
};
```

- [ ] **Step 3: Implement `template.ts`**

```ts
export type ParsedTemplate = { cutSettings: Map<number, string> };

/**
 * `<CutSetting>` blocks from a LightBurn project saved on the cutting machine,
 * keyed by layer index and kept verbatim, so every parameter (and any
 * material-library link) travels into generated files unchanged.
 * `<CutSetting_Img>` (image layers) is not matched.
 */
export const parseTemplate = (xml: string): ParsedTemplate => {
	if (!/<LightBurnProject[\s>]/.test(xml)) throw new Error('Not a LightBurn project file');
	const cutSettings = new Map<number, string>();
	for (const block of xml.match(/<CutSetting\b[^>]*>[\s\S]*?<\/CutSetting>/g) ?? []) {
		const index = block.match(/<index\s+Value="(\d+)"/);
		if (index) cutSettings.set(Number(index[1]), block);
	}
	return { cutSettings };
};
```

- [ ] **Step 4: Implement `lbrn2-writer.ts`**

```ts
import type { LbProject, LbShape } from './types';
import { encodeSubpaths, fmt } from './lbrn2-path';
import { parseTemplate } from './template';
import { isToolLayer, layerByIndex } from './layers';

const minimalCutSetting = (index: number) =>
	`<CutSetting type="Cut">
        <index Value="${index}"/>
        <name Value="${layerByIndex(index)?.id ?? `C${String(index).padStart(2, '0')}`}"/>
    </CutSetting>`;

const shapeXml = (s: LbShape, indent: string): string => {
	if (s.kind === 'rect') {
		return (
			`${indent}<Shape Type="Rect" CutIndex="${s.cutIndex}" W="${fmt(s.width)}" H="${fmt(s.height)}" Cr="0">\n` +
			`${indent}    <XForm>1 0 0 1 ${fmt(s.x + s.width / 2)} ${fmt(s.y + s.height / 2)}</XForm>\n` +
			`${indent}</Shape>`
		);
	}
	return encodeSubpaths(s.segments)
		.map(
			(run) =>
				`${indent}<Shape Type="Path" CutIndex="${s.cutIndex}">\n` +
				`${indent}    <XForm>1 0 0 1 0 0</XForm>\n` +
				`${indent}    <VertList>${run.vertList}</VertList>\n` +
				`${indent}    <PrimList>${run.primList}</PrimList>\n` +
				`${indent}</Shape>`
		)
		.join('\n');
};

/**
 * One `.lbrn2` project. Every page is a Group (select a page, cut selected);
 * shapes sit on their layers; each non-tool layer used gets a CutSetting,
 * copied verbatim from the template when it has one and minimal otherwise.
 * `missingLayers` lists the minimal ones so the UI can warn before download.
 */
export const writeLbrn2 = (
	project: LbProject,
	templateXml?: string
): { xml: string; missingLayers: number[] } => {
	const template = templateXml
		? parseTemplate(templateXml)
		: { cutSettings: new Map<number, string>() };
	const used = [...new Set(project.pages.flatMap((p) => p.shapes.map((s) => s.cutIndex)))].sort(
		(a, b) => a - b
	);
	const missingLayers: number[] = [];
	const settings = used
		.filter((i) => {
			const l = layerByIndex(i);
			return !l || !isToolLayer(l);
		})
		.map((i) => {
			const block = template.cutSettings.get(i);
			if (block) return `    ${block}`;
			missingLayers.push(i);
			return `    ${minimalCutSetting(i)}`;
		});
	const groups = project.pages.map((page) => {
		const children = page.shapes.map((s) => shapeXml(s, '            ')).join('\n');
		return (
			`    <Shape Type="Group" CutIndex="${page.shapes[0]?.cutIndex ?? 0}">\n` +
			`        <XForm>1 0 0 1 0 0</XForm>\n` +
			`        <Children>\n${children}\n        </Children>\n` +
			`    </Shape>`
		);
	});
	const xml = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<LightBurnProject AppVersion="1.7.08" FormatVersion="1" MaterialHeight="0" MirrorX="False" MirrorY="False">',
		...settings,
		...groups,
		'</LightBurnProject>',
		''
	].join('\n');
	return { xml, missingLayers };
};
```

- [ ] **Step 5: Run to verify pass**

Run: `npx jest src/lib/lightburn` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/lightburn/lbrn2-path.ts src/lib/lightburn/lbrn2-writer.ts src/lib/lightburn/template.ts src/lib/lightburn/__tests__/lbrn2-path.test.ts src/lib/lightburn/__tests__/lbrn2-writer.test.ts src/lib/lightburn/__tests__/template.test.ts
git commit -m "feat(lightburn): .lbrn2 writer, path encoding and template parsing"
```

---

## Task 9: File naming, millimetre export frame, `d` parsing, shapes → `LbProject`

**Files:**
- Create: `src/lib/download/file-stamp.ts`, `src/lib/download/export-frame.ts`, `src/lib/download/parse-path-d.ts`, `src/lib/lightburn/build-lb-project.ts`
- Test: `src/lib/download/__tests__/file-stamp.test.ts`, `export-frame.test.ts`, `parse-path-d.test.ts`, `src/lib/lightburn/__tests__/build-lb-project.test.ts`

**Interfaces:**
- Consumes: `GeometryType` (Task 1); `LbProject`, `LayerMap`, `resolveLayer` (Task 1); `PageRect`.
- Produces:
  ```ts
  export const fileStamp = (name: string | undefined, now?: Date): string;
  export type ExportFrame = { width: string; height: string; viewBox: string; contentTransform: string; widthMm: number; heightMm: number };
  export const exportFrame = (pages: PageRect[], pageScale: number): ExportFrame;
  export const parsePathD = (d: string): PathSegment[]; // absolute M L H V C Q A Z; throws on relative
  export type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };
  export const applyMatrix = (segs: PathSegment[], m: Matrix): PathSegment[]; // M/L/C/Q/Z; throws on A
  export type ExportShape = { geometry: GeometryType; segments: PathSegment[] }; // page space, pattern units, M/L/C/Z
  export const buildLbProject = (args: { shapes: ExportShape[]; pages: PageRect[]; pageScale: number; layerMap?: LayerMap }): LbProject;
  ```

- [ ] **Step 1: Failing tests**

`file-stamp.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { fileStamp } from '../file-stamp';

describe('fileStamp', () => {
	const at = new Date(2026, 8, 27, 14, 5, 3);
	it('formats name and local time', () => {
		expect(fileStamp('Shade 4', at)).toBe('Shade 4 - 2026-09-27 14.05.03');
	});
	it('falls back to untitled and strips path separators', () => {
		expect(fileStamp('  ', at)).toBe('untitled - 2026-09-27 14.05.03');
		expect(fileStamp(undefined, at)).toBe('untitled - 2026-09-27 14.05.03');
		expect(fileStamp('a/b:c', at)).toBe('a-b-c - 2026-09-27 14.05.03');
	});
});
```

`export-frame.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { exportFrame } from '../export-frame';

describe('exportFrame', () => {
	it('makes a 300 mm page exactly 300mm with mm user units', () => {
		const f = exportFrame([{ x: 0, y: 0, width: 600, height: 600 }], 2);
		expect(f.width).toBe('300mm');
		expect(f.height).toBe('300mm');
		expect(f.viewBox).toBe('0 0 300 300');
		expect(f.contentTransform).toBe('scale(0.5) translate(0 0)');
	});
	it('spans every page from their union origin', () => {
		const f = exportFrame(
			[{ x: 100, y: 50, width: 600, height: 600 }, { x: 100, y: 670, width: 600, height: 600 }],
			2
		);
		expect(f.heightMm).toBe(610);
		expect(f.contentTransform).toBe('scale(0.5) translate(-100 -50)');
	});
	it('refuses no pages or a bad scale', () => {
		expect(() => exportFrame([], 2)).toThrow();
		expect(() => exportFrame([{ x: 0, y: 0, width: 1, height: 1 }], 0)).toThrow();
	});
});
```

`parse-path-d.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { parsePathD, applyMatrix } from '../parse-path-d';

describe('parsePathD', () => {
	it('parses what svgPathStringFromSegments writes', () => {
		expect(parsePathD('M 0 0\nL 10 0\nC 1 2 3 4 5 6\nQ 1 1 2 2\nA 5 5 0 0 1 10 10\nZ')).toEqual([
			['M', 0, 0], ['L', 10, 0], ['C', 1, 2, 3, 4, 5, 6], ['Q', 1, 1, 2, 2], ['A', 5, 5, 0, 0, 1, 10, 10], ['Z']
		]);
	});
	it('handles H, V, exponents and implicit repeats', () => {
		expect(parsePathD('M0,0 H5 V-1e-1 L1 1 2 2')).toEqual([
			['M', 0, 0], ['L', 5, 0], ['L', 5, -0.1], ['L', 1, 1], ['L', 2, 2]
		]);
	});
	it('rejects relative commands', () => {
		expect(() => parsePathD('m 0 0 l 1 1')).toThrow();
	});
});

describe('applyMatrix', () => {
	it('maps every point', () => {
		expect(
			applyMatrix([['M', 1, 0], ['C', 1, 0, 1, 0, 1, 0], ['Z']], { a: 0, b: 1, c: -1, d: 0, e: 10, f: 0 })
		).toEqual([['M', 10, 1], ['C', 10, 1, 10, 1, 10, 1], ['Z']]);
	});
});
```

`build-lb-project.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { buildLbProject } from '../build-lb-project';

const pages = [
	{ x: 0, y: 0, width: 600, height: 600 },
	{ x: 0, y: 620, width: 600, height: 600 }
];

describe('buildLbProject', () => {
	it('makes one group per page with a T1 page rect in mm, Y up', () => {
		const p = buildLbProject({ shapes: [], pages, pageScale: 2 });
		expect(p.pages).toHaveLength(2);
		expect(p.pages[0].shapes[0]).toEqual({ kind: 'rect', cutIndex: 30, x: 0, y: 310, width: 300, height: 300 });
		expect(p.pages[1].shapes[0]).toEqual({ kind: 'rect', cutIndex: 30, x: 0, y: 0, width: 300, height: 300 });
	});

	it('scales, flips and assigns shapes to their page and layer', () => {
		const p = buildLbProject({
			shapes: [
				{ geometry: 'pattern-outline', segments: [['M', 100, 100], ['L', 200, 100]] },
				{ geometry: 'outline-gap', segments: [['M', 100, 700], ['L', 110, 700]] },
				{ geometry: 'page-outline', segments: [['M', 0, 0], ['L', 1, 1]] }
			],
			pages,
			pageScale: 2,
			layerMap: { 'outline-gap': 'C05' }
		});
		expect(p.pages[0].shapes[1]).toEqual({ kind: 'path', cutIndex: 0, segments: [['M', 50, 560], ['L', 100, 560]] });
		expect(p.pages[1].shapes[1]).toEqual({ kind: 'path', cutIndex: 5, segments: [['M', 50, 260], ['L', 55, 260]] });
		expect(p.pages[0].shapes).toHaveLength(2); // the DOM page-outline is ignored; the rect comes from page data
	});
});
```

Run: `npx jest src/lib/download src/lib/lightburn/__tests__/build-lb-project.test.ts` → FAIL.

- [ ] **Step 2: Implement `file-stamp.ts`**

```ts
const pad = (n: number) => String(n).padStart(2, '0');

/** `${name || 'untitled'} - YYYY-MM-DD HH.mm.ss` in local time, without `/`, `:` or `\` (unsafe in filenames). */
export const fileStamp = (name: string | undefined, now: Date = new Date()): string => {
	const base = (name ?? '').trim().replace(/[/:\\]/g, '-') || 'untitled';
	const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	const time = `${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
	return `${base} - ${date} ${time}`;
};
```

- [ ] **Step 3: Implement `export-frame.ts`**

```ts
import type { PageRect } from '$lib/cut-pattern/page-layout/types';

export type ExportFrame = {
	width: string;
	height: string;
	viewBox: string;
	/** Wrap all exported content in a `<g>` with this transform: maps pattern units to mm. */
	contentTransform: string;
	widthMm: number;
	heightMm: number;
};

const round = (n: number) => {
	const r = Math.round(n * 1e6) / 1e6;
	return r === 0 ? 0 : r;
};

/**
 * Root attributes that make the exported SVG's user unit one millimetre, so any
 * importer sizes it correctly whatever its DPI setting or viewBox handling.
 */
export const exportFrame = (pages: PageRect[], pageScale: number): ExportFrame => {
	if (pages.length === 0) throw new Error('exportFrame: no pages to export');
	if (!(pageScale > 0)) throw new Error(`exportFrame: invalid pageScale ${pageScale}`);
	const minX = Math.min(...pages.map((p) => p.x));
	const minY = Math.min(...pages.map((p) => p.y));
	const maxX = Math.max(...pages.map((p) => p.x + p.width));
	const maxY = Math.max(...pages.map((p) => p.y + p.height));
	const widthMm = round((maxX - minX) / pageScale);
	const heightMm = round((maxY - minY) / pageScale);
	return {
		width: `${widthMm}mm`,
		height: `${heightMm}mm`,
		viewBox: `0 0 ${widthMm} ${heightMm}`,
		contentTransform: `scale(${round(1 / pageScale)}) translate(${round(-minX)} ${round(-minY)})`,
		widthMm,
		heightMm
	};
};
```

- [ ] **Step 4: Implement `parse-path-d.ts`**

```ts
import type { PathSegment } from '$lib/types';

const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, A: 7, Z: 0 };

/**
 * Absolute-command SVG path data → PathSegment[]. Every exported DOM path is
 * written by `svgPathStringFromSegments`, which is absolute-only, so a relative
 * command means something unexpected reached the export; it throws.
 */
export const parsePathD = (d: string): PathSegment[] => {
	const tokens = d.match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
	const out: PathSegment[] = [];
	let i = 0;
	let cmd = '';
	let cur = { x: 0, y: 0 };
	let start = cur;
	while (i < tokens.length) {
		if (/[A-Za-z]/.test(tokens[i])) {
			cmd = tokens[i];
			i += 1;
			if (!(cmd in ARITY)) throw new Error(`parsePathD: unsupported command "${cmd}"`);
			if (cmd === 'Z') {
				out.push(['Z']);
				cur = start;
				continue;
			}
		}
		const n = ARITY[cmd];
		if (!cmd || !n) throw new Error(`parsePathD: stray number at token ${i}`);
		const v = tokens.slice(i, i + n).map(Number);
		if (v.length < n || v.some((x) => !Number.isFinite(x))) throw new Error('parsePathD: truncated command');
		i += n;
		switch (cmd) {
			case 'M':
				out.push(['M', v[0], v[1]]);
				cur = start = { x: v[0], y: v[1] };
				cmd = 'L'; // implicit repeats after M are lines
				break;
			case 'L':
				out.push(['L', v[0], v[1]]);
				cur = { x: v[0], y: v[1] };
				break;
			case 'H':
				out.push(['L', v[0], cur.y]);
				cur = { x: v[0], y: cur.y };
				break;
			case 'V':
				out.push(['L', cur.x, v[0]]);
				cur = { x: cur.x, y: v[0] };
				break;
			case 'C':
				out.push(['C', v[0], v[1], v[2], v[3], v[4], v[5]]);
				cur = { x: v[4], y: v[5] };
				break;
			case 'Q':
				out.push(['Q', v[0], v[1], v[2], v[3]]);
				cur = { x: v[2], y: v[3] };
				break;
			case 'A':
				out.push(['A', v[0], v[1], v[2], v[3] ? 1 : 0, v[4] ? 1 : 0, v[5], v[6]]);
				cur = { x: v[5], y: v[6] };
				break;
		}
	}
	return out;
};

export type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

/** Apply an SVG matrix to every point. Convert arcs to cubics first. */
export const applyMatrix = (segs: PathSegment[], m: Matrix): PathSegment[] => {
	const X = (x: number, y: number) => m.a * x + m.c * y + m.e;
	const Y = (x: number, y: number) => m.b * x + m.d * y + m.f;
	return segs.map((s): PathSegment => {
		switch (s[0]) {
			case 'M':
				return ['M', X(s[1], s[2]), Y(s[1], s[2])];
			case 'L':
				return ['L', X(s[1], s[2]), Y(s[1], s[2])];
			case 'C':
				return ['C', X(s[1], s[2]), Y(s[1], s[2]), X(s[3], s[4]), Y(s[3], s[4]), X(s[5], s[6]), Y(s[5], s[6])];
			case 'Q':
				return ['Q', X(s[1], s[2]), Y(s[1], s[2]), X(s[3], s[4]), Y(s[3], s[4])];
			case 'Z':
				return s;
			default:
				throw new Error('applyMatrix: convert arcs to cubics before transforming');
		}
	});
};
```

- [ ] **Step 5: Implement `build-lb-project.ts`**

```ts
import type { PathSegment } from '$lib/types';
import type { PageRect } from '$lib/cut-pattern/page-layout/types';
import type { GeometryType } from '$lib/cut-pattern/post-process-types';
import type { LbProject } from './types';
import { resolveLayer, type LayerMap } from './layers';

/** One exported drawable, already in page space (pattern units), M/L/C/Z only. */
export type ExportShape = { geometry: GeometryType; segments: PathSegment[] };

const centre = (segs: PathSegment[]) => {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const s of segs) {
		for (let i = 1; i + 1 < s.length; i += 2) {
			minX = Math.min(minX, s[i] as number);
			maxX = Math.max(maxX, s[i] as number);
			minY = Math.min(minY, s[i + 1] as number);
			maxY = Math.max(maxY, s[i + 1] as number);
		}
	}
	return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
};

const pageOf = (p: { x: number; y: number }, pages: PageRect[]) => {
	const hit = pages.findIndex(
		(r) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
	);
	if (hit >= 0) return hit;
	let best = 0;
	let bestD = Infinity;
	pages.forEach((r, i) => {
		const d = Math.hypot(p.x - (r.x + r.width / 2), p.y - (r.y + r.height / 2));
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	});
	return best;
};

/**
 * Page-space drawables → a LightBurn project in mm, Y up, one Group per page.
 * The page rect comes from layout data rather than the DOM, so DOM
 * `page-outline` shapes are skipped.
 */
export const buildLbProject = (args: {
	shapes: ExportShape[];
	pages: PageRect[];
	pageScale: number;
	layerMap?: LayerMap;
}): LbProject => {
	const { shapes, pages, pageScale, layerMap } = args;
	const minX = Math.min(...pages.map((p) => p.x));
	const maxY = Math.max(...pages.map((p) => p.y + p.height));
	const X = (x: number) => (x - minX) / pageScale;
	const Y = (y: number) => (maxY - y) / pageScale;
	const toMm = (segs: PathSegment[]): PathSegment[] =>
		segs.map((s): PathSegment => {
			switch (s[0]) {
				case 'M':
					return ['M', X(s[1]), Y(s[2])];
				case 'L':
					return ['L', X(s[1]), Y(s[2])];
				case 'C':
					return ['C', X(s[1]), Y(s[2]), X(s[3]), Y(s[4]), X(s[5]), Y(s[6])];
				case 'Z':
					return s;
				default:
					throw new Error(`buildLbProject: expected M/L/C/Z, got ${s[0]}`);
			}
		});

	const project: LbProject = {
		pages: pages.map((r) => ({
			shapes: [
				{
					kind: 'rect',
					cutIndex: resolveLayer('page-outline', layerMap).index,
					x: X(r.x),
					y: Y(r.y + r.height),
					width: r.width / pageScale,
					height: r.height / pageScale
				}
			]
		}))
	};
	for (const shape of shapes) {
		if (shape.geometry === 'page-outline' || shape.segments.length === 0) continue;
		project.pages[pageOf(centre(shape.segments), pages)].shapes.push({
			kind: 'path',
			cutIndex: resolveLayer(shape.geometry, layerMap).index,
			segments: toMm(shape.segments)
		});
	}
	return project;
};
```

- [ ] **Step 6: Run to verify pass**

Run: `npx jest src/lib/download src/lib/lightburn/__tests__/build-lb-project.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/download src/lib/lightburn/build-lb-project.ts src/lib/lightburn/__tests__/build-lb-project.test.ts
git commit -m "feat(download): file stamp, mm export frame, path parsing, LightBurn project builder"
```

---

# Wave 2 — parallel (Tasks 10–12)

Each task runs in its own worktree branched from the merged wave-1 result. The file sets are disjoint. Task 12 reads `exportPagesStore`, which Task 10 writes; the store itself already exists from Task 1.

## Task 10: Stage 3 wiring — place bands, compose, render annotations

**Files:**
- Create: `src/lib/cut-pattern/page-post-process/place-bands.ts`
- Create: `src/lib/cut-pattern/page-post-process/index.ts`
- Create: `src/components/cut-pattern/PageAnnotations.svelte`
- Modify: `src/components/cut-pattern/CutPatternRenderer.svelte`
- Test: `src/lib/cut-pattern/page-post-process/__tests__/place-bands.test.ts`, `index.test.ts`

**Interfaces:**
- Consumes: `computeDisconnects` (Task 5); `buildPageLabels`, `GlyphDict` (Task 7); `flattenPath`, `BandContourIndex` (Task 2); `TaggedPath`, `PlacedBand`, `Placement`, `PagePostProcessResult` (Task 1); stores `mergedBandPathsRaw`, `bandContourIndexes`, `mergedBandPaths`, `postProcessConfig`, `layerStrokes`, `exportPagesStore`, `superGlobuleStore`; `svgTextDictionary`, `processSvg`, `Fonts` (existing SvgText modules).
- Produces:
  ```ts
  export const toPageSpace = (p: Pt, pl: Placement): Pt;
  export const rotateDirection = (v: Pt, deg: number): Pt;
  export const placeBand = (args: { bandId: string; placement: Placement; raw: PathSegment[]; index: BandContourIndex; pieces: TaggedPath[]; pages: PageRect[] }): PlacedBand;
  export const pagePostProcess = (input: { bands: PlacedBand[]; pages: PageRect[]; pageScale: number; marginPx: number; gap: number; config: PostProcessConfig; configName: string | undefined; dict: GlyphDict | undefined }): PagePostProcessResult;
  ```
  `exportPagesStore` is set to `{ pages, pageScale }` while page layout is active and without overflow, and to `null` otherwise.

- [ ] **Step 1: Failing tests**

`place-bands.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { toPageSpace, placeBand } from '../place-bands';
import type { PathSegment } from '$lib/types';

describe('toPageSpace', () => {
	it('matches bandTransform: translate(origin) rotate(rotation, pivot)', () => {
		// rotate (2,0) by 90° about (1,0) → (1,1); then translate by (10,20)
		const p = toPageSpace({ x: 2, y: 0 }, { origin: { x: 10, y: 20 }, rotation: 90, pivot: { x: 1, y: 0 } });
		expect(p.x).toBeCloseTo(11, 9);
		expect(p.y).toBeCloseTo(21, 9);
	});
	it('is a plain translate at rotation 0', () => {
		expect(toPageSpace({ x: 2, y: 3 }, { origin: { x: 1, y: 1 }, rotation: 0, pivot: { x: 9, y: 9 } })).toEqual({ x: 3, y: 4 });
	});
});

describe('placeBand', () => {
	const raw: PathSegment[] = [
		['M', 0, 0], ['L', 10, 0], ['L', 10, 50], ['L', 0, 50], ['Z'],
		['M', 4, 4], ['L', 6, 4], ['L', 6, 6], ['Z']
	];
	const index = {
		seed: 0,
		contours: [
			{ start: 0, end: 5, kind: 'outline' as const, depth: 0, area: 500 },
			{ start: 5, end: 9, kind: 'hole' as const, depth: 1, area: 2, bandFraction: 0.1 }
		],
		ends: {
			start: { point: { x: 5, y: 0 }, outward: { x: 0, y: -1 } },
			end: { point: { x: 5, y: 50 }, outward: { x: 0, y: 1 } }
		}
	};
	const pages = [{ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 110, width: 100, height: 100 }];

	it('moves outlines, surviving holes and ends into page space and finds the page', () => {
		const placed = placeBand({
			bandId: 'b',
			placement: { origin: { x: 20, y: 130 }, rotation: 0, pivot: { x: 0, y: 0 } },
			raw,
			index,
			pieces: [{ geometry: 'pattern-hole', segments: raw.slice(5, 9), contour: 1 }],
			pages
		});
		expect(placed.page).toBe(1);
		expect(placed.outlines[0][0]).toEqual({ x: 20, y: 130 });
		expect(placed.holes).toHaveLength(1);
		expect(placed.ends!.end.point).toEqual({ x: 25, y: 180 });
		expect(placed.ends!.end.outward).toEqual({ x: 0, y: 1 });
	});

	it('drops holes that stage 2 removed', () => {
		const placed = placeBand({
			bandId: 'b',
			placement: { origin: { x: 0, y: 0 }, rotation: 0, pivot: { x: 0, y: 0 } },
			raw, index, pieces: [], pages
		});
		expect(placed.holes).toHaveLength(0);
		expect(placed.outlines).toHaveLength(1);
	});
});
```

`index.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { pagePostProcess } from '../index';
import type { PlacedBand } from '../../post-process-types';
import { DEFAULT_POST_PROCESS } from '../../hole-drop-config';

const rectPoly = (x0: number, y0: number, x1: number, y1: number) => [
	{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }
];
const band: PlacedBand = {
	bandId: 'a',
	page: 0,
	outlines: [rectPoly(45, 10, 55, 80)],
	holes: [],
	ends: {
		start: { point: { x: 50, y: 10 }, outward: { x: 0, y: -1 } },
		end: { point: { x: 50, y: 80 }, outward: { x: 0, y: 1 } }
	}
};
const base = {
	bands: [band],
	pages: [{ x: 0, y: 0, width: 100, height: 100 }],
	pageScale: 1,
	marginPx: 5,
	gap: 2,
	configName: 'shade',
	dict: { '1': { path: [['M', 0, 0], ['L', 1, 1]], width: 1 } } as never
};

describe('pagePostProcess', () => {
	it('does nothing with everything off', () => {
		expect(pagePostProcess({ ...base, config: DEFAULT_POST_PROCESS })).toEqual({ disconnects: [], pageLabels: [] });
	});
	it('emits disconnects when enabled', () => {
		const r = pagePostProcess({ ...base, config: { ...DEFAULT_POST_PROCESS, disconnectSurround: true } });
		expect(r.disconnects).toHaveLength(2);
	});
	it('skips labels without a font dictionary', () => {
		const r = pagePostProcess({
			...base,
			dict: undefined,
			config: { ...DEFAULT_POST_PROCESS, pageLabel: { pageNumber: true, configName: false, text: '' } }
		});
		expect(r.pageLabels).toEqual([]);
	});
});
```

Run: `npx jest src/lib/cut-pattern/page-post-process` → FAIL (missing modules).

- [ ] **Step 2: Implement `place-bands.ts`**

```ts
import type { PathSegment } from '$lib/types';
import type { PageRect } from '../page-layout/types';
import type { BandContourIndex } from '../contour-index';
import type { Placement, PlacedBand, Pt, TaggedPath } from '../post-process-types';
import { flattenPath } from '../path-contours';

export const rotateDirection = (v: Pt, deg: number): Pt => {
	if (!deg) return v;
	const r = (deg * Math.PI) / 180;
	return { x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r) };
};

/**
 * Band-local → page space, exactly as `bandTransform(origin, rotation, pivot)`
 * renders it: `translate(origin) rotate(rotation pivot)`, i.e. rotate about the
 * pivot, then translate.
 */
export const toPageSpace = (p: Pt, pl: Placement): Pt => {
	if (!pl.rotation) return { x: p.x + pl.origin.x, y: p.y + pl.origin.y };
	const d = rotateDirection({ x: p.x - pl.pivot.x, y: p.y - pl.pivot.y }, pl.rotation);
	return { x: pl.origin.x + pl.pivot.x + d.x, y: pl.origin.y + pl.pivot.y + d.y };
};

/**
 * One prepared band in page space. Outlines come from the RAW merged path's
 * outline contours — closed, and present even when stage 2 drops or gaps the
 * outline, because the band still occupies that paper. Holes are only those
 * stage 2 kept.
 */
export const placeBand = (args: {
	bandId: string;
	placement: Placement;
	raw: PathSegment[];
	index: BandContourIndex;
	pieces: TaggedPath[];
	pages: PageRect[];
}): PlacedBand => {
	const { bandId, placement, raw, index, pieces, pages } = args;
	const move = (runs: Pt[][]) => runs.map((run) => run.map((p) => toPageSpace(p, placement)));
	const outlines = move(
		index.contours
			.filter((c) => c.kind === 'outline')
			.flatMap((c) => flattenPath(raw.slice(c.start, c.end)))
	);
	const holes = move(pieces.filter((p) => p.geometry === 'pattern-hole').flatMap((p) => flattenPath(p.segments)));

	const pts = outlines.flat();
	const cx = pts.length ? (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2 : NaN;
	const cy = pts.length ? (Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2 : NaN;
	let page = pages.findIndex(
		(r) => cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height
	);
	if (page < 0) page = -1;

	const ends = index.ends && {
		start: {
			point: toPageSpace(index.ends.start.point, placement),
			outward: rotateDirection(index.ends.start.outward, placement.rotation)
		},
		end: {
			point: toPageSpace(index.ends.end.point, placement),
			outward: rotateDirection(index.ends.end.outward, placement.rotation)
		}
	};
	return { bandId, page, outlines, holes, ends };
};
```

(A band on no page gets `page: -1` and is ignored by stage 3.)

- [ ] **Step 3: Implement `index.ts`**

```ts
import type { PageRect } from '../page-layout/types';
import type { PostProcessConfig } from '../hole-drop-config';
import type { PagePostProcessResult, PlacedBand } from '../post-process-types';
import { computeDisconnects } from './disconnect';
import { buildPageLabels, type GlyphDict } from './page-label';

/** Stage 3: everything that depends on final page placement. Pure. */
export const pagePostProcess = (input: {
	bands: PlacedBand[];
	pages: PageRect[];
	pageScale: number;
	marginPx: number;
	gap: number;
	config: PostProcessConfig;
	configName: string | undefined;
	dict: GlyphDict | undefined;
}): PagePostProcessResult => {
	const { bands, pages, pageScale, marginPx, gap, config, configName, dict } = input;
	const disconnects = config.disconnectSurround ? computeDisconnects(bands, pages, gap) : [];
	const pageLabels = dict
		? buildPageLabels({ pages, marginPx, pageScale, bands, disconnects, config: config.pageLabel, configName, dict })
		: [];
	return { disconnects, pageLabels };
};
```

Run the tests → PASS.

- [ ] **Step 4: `PageAnnotations.svelte`**

```svelte
<script lang="ts">
	import type { PagePostProcessResult } from '$lib/cut-pattern/post-process-types';
	import { layerStrokes } from '$lib/stores';
	import SvgText from './SvgText/SvgText.svelte';

	let { result }: { result: PagePostProcessResult } = $props();
</script>

<!-- Stage 3 output, in page space: drawn outside every band group. -->
<g id="page-annotations">
	{#each result.disconnects as d, i (i)}
		<path
			d={`M ${d.a.x} ${d.a.y} L ${d.b.x} ${d.b.y}`}
			data-geometry="surround-disconnect"
			fill="none"
			stroke={$layerStrokes['surround-disconnect']}
			stroke-width={1}
		/>
	{/each}
	{#each result.pageLabels as label, i (i)}
		{#if !label.unplaced}
			<SvgText
				string={label.text}
				anchor={label.origin}
				size={label.size}
				offset={{ x: 0, y: 0 }}
				geometry="page-label"
			/>
		{/if}
	{/each}
</g>
```

- [ ] **Step 5: Wire into `CutPatternRenderer.svelte`**

Add imports: `placeBand` from `$lib/cut-pattern/page-post-process/place-bands`, `pagePostProcess` from `$lib/cut-pattern/page-post-process`, `PageAnnotations`, the stores `mergedBandPathsRaw, bandContourIndexes, mergedBandPaths, postProcessConfig, exportPagesStore, superGlobuleStore` from `$lib/stores`, `toastStore` from `$lib/stores/toastStore`, `svgTextDictionary` from `./SvgText/svg-text-store`, `processSvg` from `./SvgText/svg-text`, and `Fonts` from `./SvgText/fonts`.

After `usePageLayout` is defined, add:

```ts
	// Stage 3 needs the same font dictionary SvgText lazily builds; build it here
	// if no label has rendered yet.
	let glyphDict = $derived.by(() => {
		if (!$svgTextDictionary) {
			$svgTextDictionary = processSvg(Fonts.reliefSingleLine.keyString, Fonts.reliefSingleLine.svgString);
		}
		return $svgTextDictionary;
	});

	// Stage 3: disconnects and page labels. Only prepared bands in a page layout
	// have final placement. Memoised by $derived on its inputs; view-only changes
	// (zoom, pan) do not touch any of them.
	let stage3 = $derived.by(() => {
		if (!usePageLayout || !pageResult || !pageLayoutCfg || $mergedBandPaths.size === 0) return null;
		const config = $postProcessConfig;
		const wantsLabel = !!config.pageLabel && (config.pageLabel.pageNumber || config.pageLabel.configName || !!config.pageLabel.text);
		if (!config.disconnectSurround && !wantsLabel) return null;
		const pages = pageResult.pages;
		const bands = pageBands.flatMap(({ band }, i) => {
			const raw = $mergedBandPathsRaw.get(band.id);
			const index = $bandContourIndexes.get(band.id);
			const pieces = $mergedBandPaths.get(band.id);
			if (!raw || !index || !pieces) return [];
			return [
				placeBand({
					bandId: band.id,
					placement: {
						origin: pageResult.origins[i],
						rotation: pageResult.rotations[i] ?? 0,
						pivot: pivots.get(band) ?? { x: 0, y: 0 }
					},
					raw,
					index,
					pieces,
					pages
				})
			];
		});
		const geom = buildPageGeom(pageLayoutCfg);
		return pagePostProcess({
			bands,
			pages,
			pageScale: pageLayoutCfg.pageScale,
			marginPx: geom.marginPx,
			gap,
			config,
			configName: $superGlobuleStore.name,
			dict: glyphDict as never
		});
	});

	// Publish page rects for the exporters. Value-key guarded, as the page info above.
	let lastExportPagesKey = '';
	$effect(() => {
		const value =
			usePageLayout && pageResult && pageLayoutCfg
				? { pages: pageResult.pages, pageScale: pageLayoutCfg.pageScale }
				: null;
		const key = JSON.stringify(value);
		if (key === lastExportPagesKey) return;
		lastExportPagesKey = key;
		exportPagesStore.set(value);
	});

	// One toast per distinct set of pages whose label found no room.
	let lastUnplacedKey = '';
	$effect(() => {
		const unplaced = stage3?.pageLabels.filter((l) => l.unplaced).map((l) => l.page + 1) ?? [];
		const key = unplaced.join(',');
		if (key === lastUnplacedKey) return;
		lastUnplacedKey = key;
		if (unplaced.length)
			toastStore.add({ type: 'warning', message: `No room for the page label on page ${key}.` });
	});
```

Notes for the implementer:
- `pivots`, `pageBands`, `pageLayoutCfg`, `gap`, `buildPageGeom` already exist in this component. Check that the `pivots` map key is the `band` object, as in the existing `pivot={pivots.get(band)}` call.
- If `toastStore.add` requires fields beyond `type` and `message`, check `src/lib/stores/toastStore.ts` and pass them.
- If `Fonts.reliefSingleLine` is not the default font's key, use the key `SvgText.svelte` defaults to (`fontName = 'reliefSingleLine'`).
- Writing `$svgTextDictionary` inside `$derived` is a store write during derivation. If Svelte rejects it (`state_unsafe_mutation`), move the initialisation into a top-level statement in the script instead: `if (!get(svgTextDictionary)) svgTextDictionary.set(...)`.

In the markup, directly after the `<g id="cut-pattern">…</g>` inside `{#if usePageLayout && pageResult}`, add:

```svelte
		{#if stage3}
			<PageAnnotations result={stage3} />
		{/if}
```

- [ ] **Step 6: Check and smoke**

Run: `npx jest src/lib/cut-pattern/page-post-process` → PASS. Run `npm run check 2>&1 | tail -3`: the error count must not be above the baseline.
Restart the dev server. In the app, on `/designer2` with Voronoi and page layout, prepare the pattern. Set `postProcess.disconnectSurround = true` and `pageLabel = { pageNumber: true, configName: false, text: '' }` through the store in devtools, or through Task 11's panel if it is merged. Confirm that disconnect lines and a page label appear. If the Chrome extension is unavailable, use a scratchpad Playwright script instead (see memory: headless UI verification).

- [ ] **Step 7: Commit**

```bash
git add src/lib/cut-pattern/page-post-process/place-bands.ts src/lib/cut-pattern/page-post-process/index.ts src/lib/cut-pattern/page-post-process/__tests__/place-bands.test.ts src/lib/cut-pattern/page-post-process/__tests__/index.test.ts src/components/cut-pattern/PageAnnotations.svelte src/components/cut-pattern/CutPatternRenderer.svelte
git commit -m "feat(post-process): stage 3 wiring — disconnects and page labels on the page"
```

---

## Task 11: Post Process panel controls and LightBurn template upload

**Files:**
- Create: `src/lib/lightburn/template-status.ts`
- Test: `src/lib/lightburn/__tests__/template-status.test.ts`
- Modify: `src/components/modal/editor/PostProcess.svelte`

**Interfaces:**
- Consumes: `PostProcessConfig` fields (Task 1); `LIGHTBURN_LAYERS`, `layerOptionLabel`, `resolveLayer`, `isToolLayer`, `LayerId`, `DEFAULT_LAYER_MAP` (Task 1); `GEOMETRY_TYPES`, `GEOMETRY_TYPE_LABELS` (Task 1); `parseTemplate` (Task 8); `lightburnTemplateStore` (Task 1); `DEFAULT_CONNECT_GAP_MM` (Task 1).
- Produces:
  ```ts
  export const readTemplateUpload = (fileName: string, xml: string, now?: Date): { ok: true; template: LightburnTemplate } | { ok: false; error: string };
  export const missingTemplateLayers = (layerMap: LayerMap | undefined, templateXml: string | undefined): LayerId[];
  ```

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from '@jest/globals';
import { readTemplateUpload, missingTemplateLayers } from '../template-status';

const XML = `<LightBurnProject><CutSetting type="Cut"><index Value="0"/><name Value="Cut"/></CutSetting></LightBurnProject>`;

describe('readTemplateUpload', () => {
	it('accepts a LightBurn project with cut layers', () => {
		const r = readTemplateUpload('cutter.lbrn2', XML, new Date('2026-09-27T12:00:00Z'));
		expect(r).toEqual({ ok: true, template: { fileName: 'cutter.lbrn2', xml: XML, loadedAt: '2026-09-27T12:00:00.000Z' } });
	});
	it('rejects other files and projects with no cut layers', () => {
		expect(readTemplateUpload('x.svg', '<svg/>')).toEqual({ ok: false, error: 'Not a LightBurn project file' });
		expect(readTemplateUpload('e.lbrn2', '<LightBurnProject></LightBurnProject>')).toEqual({
			ok: false,
			error: 'The template has no cut layers'
		});
	});
});

describe('missingTemplateLayers', () => {
	it('lists mapped non-tool layers the template lacks', () => {
		// defaults use C00, C01, C02 and T1; the template has C00 only
		expect(missingTemplateLayers(undefined, XML)).toEqual(['C01', 'C02']);
		expect(missingTemplateLayers(undefined, undefined)).toEqual(['C00', 'C01', 'C02']);
	});
});
```

Run: `npx jest src/lib/lightburn/__tests__/template-status.test.ts` → FAIL.

- [ ] **Step 2: Implement `template-status.ts`**

```ts
import { GEOMETRY_TYPES } from '$lib/cut-pattern/post-process-types';
import type { LightburnTemplate } from '$lib/stores/exportStores';
import { isToolLayer, resolveLayer, type LayerId, type LayerMap } from './layers';
import { parseTemplate } from './template';

/** Validate an uploaded template. A rejected upload leaves the previous template in place. */
export const readTemplateUpload = (
	fileName: string,
	xml: string,
	now: Date = new Date()
): { ok: true; template: LightburnTemplate } | { ok: false; error: string } => {
	try {
		if (parseTemplate(xml).cutSettings.size === 0) return { ok: false, error: 'The template has no cut layers' };
		return { ok: true, template: { fileName, xml, loadedAt: now.toISOString() } };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : 'Unreadable template' };
	}
};

/** Mapped, non-tool layers with no CutSetting in the template, sorted by index. */
export const missingTemplateLayers = (layerMap: LayerMap | undefined, templateXml: string | undefined): LayerId[] => {
	let have = new Set<number>();
	try {
		if (templateXml) have = new Set(parseTemplate(templateXml).cutSettings.keys());
	} catch {
		// An unreadable stored template counts as none.
	}
	const layers = new Map(GEOMETRY_TYPES.map((t) => resolveLayer(t, layerMap)).map((l) => [l.id, l]));
	return [...layers.values()]
		.filter((l) => !isToolLayer(l) && !have.has(l.index))
		.sort((a, b) => a.index - b.index)
		.map((l) => l.id);
};
```

Run the test → PASS.

- [ ] **Step 3: Extend `PostProcess.svelte`**

Add imports:

```ts
	import { lightburnTemplateStore } from '$lib/stores';
	import { DEFAULT_CONNECT_GAP_MM, type PageLabelConfig } from '$lib/cut-pattern/hole-drop-config';
	import { GEOMETRY_TYPES, GEOMETRY_TYPE_LABELS, type GeometryType } from '$lib/cut-pattern/post-process-types';
	import { LIGHTBURN_LAYERS, layerOptionLabel, resolveLayer, type LayerId } from '$lib/lightburn/layers';
	import { readTemplateUpload, missingTemplateLayers } from '$lib/lightburn/template-status';
```

Add these helpers next to `setFlag`. Every write goes to the store, as the existing comment requires:

```ts
	const patch = (next: Partial<typeof postProcess>) => {
		$patternConfigStore.patternConfig.postProcess = { ...postProcess, ...next };
	};
	let connect = $derived(postProcess.connectSurround ?? { enabled: false, gapMm: DEFAULT_CONNECT_GAP_MM });
	let pageLabel = $derived<PageLabelConfig>(
		postProcess.pageLabel ?? { pageNumber: false, configName: false, text: '' }
	);
	const setPageLabel = (next: Partial<PageLabelConfig>) => patch({ pageLabel: { ...pageLabel, ...next } });
	const setLayer = (type: GeometryType, id: LayerId) =>
		patch({ layerMap: { ...(postProcess.layerMap ?? {}), [type]: id } });

	// Transient upload feedback; losing it on panel remount is harmless.
	let templateError = $state('');
	const onTemplate = async (e: Event & { currentTarget: HTMLInputElement }) => {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		const result = readTemplateUpload(file.name, await file.text());
		if (result.ok) {
			$lightburnTemplateStore = result.template;
			templateError = '';
		} else templateError = result.error;
		e.currentTarget.value = '';
	};
	let missing = $derived(missingTemplateLayers(postProcess.layerMap, $lightburnTemplateStore?.xml));
```

Change the `setFlag` flag type to `'dropOutline' | 'dropLabelText' | 'disconnectSurround'`.

Append this markup inside `<Container direction="column">`, after the existing `{/if}`:

```svelte
		<h4>Surround</h4>
		<LabeledControl label="Disconnect surround">
			<input
				type="checkbox"
				checked={postProcess.disconnectSurround ?? false}
				onchange={(e) => setFlag('disconnectSurround', e.currentTarget.checked)}
			/>
		</LabeledControl>
		{#if !postProcess.dropOutline}
			<LabeledControl label="Connect surround">
				<input
					type="checkbox"
					checked={connect.enabled}
					onchange={(e) => patch({ connectSurround: { ...connect, enabled: e.currentTarget.checked } })}
				/>
			</LabeledControl>
			{#if connect.enabled}
				<LabeledControl label="Gap (mm)">
					<NumberInput
						value={connect.gapMm}
						min={0.1}
						max={20}
						step={0.1}
						onChange={(gapMm: number) => patch({ connectSurround: { ...connect, gapMm } })}
					/>
				</LabeledControl>
			{/if}
		{/if}

		<h4>Page labels</h4>
		<LabeledControl label="Page number">
			<input type="checkbox" checked={pageLabel.pageNumber} onchange={(e) => setPageLabel({ pageNumber: e.currentTarget.checked })} />
		</LabeledControl>
		<LabeledControl label="Config name">
			<input type="checkbox" checked={pageLabel.configName} onchange={(e) => setPageLabel({ configName: e.currentTarget.checked })} />
		</LabeledControl>
		<LabeledControl label="Text">
			<input type="text" value={pageLabel.text} onchange={(e) => setPageLabel({ text: e.currentTarget.value.trim() })} />
		</LabeledControl>

		<h4>Layers</h4>
		{#each GEOMETRY_TYPES as type (type)}
			{@const current = resolveLayer(type, postProcess.layerMap)}
			<LabeledControl label={GEOMETRY_TYPE_LABELS[type]}>
				<span class="swatch" style="background: {current.hex}"></span>
				<select value={current.id} onchange={(e) => setLayer(type, e.currentTarget.value as LayerId)}>
					{#each LIGHTBURN_LAYERS as layer (layer.id)}
						<option value={layer.id}>{layerOptionLabel(layer)}</option>
					{/each}
				</select>
			</LabeledControl>
		{/each}

		<h4>LightBurn</h4>
		<LabeledControl label="Download as LightBurn">
			<input
				type="checkbox"
				checked={postProcess.downloadFormat === 'lbrn2'}
				onchange={(e) => patch({ downloadFormat: e.currentTarget.checked ? 'lbrn2' : 'svg' })}
			/>
		</LabeledControl>
		<LabeledControl label="Template (.lbrn2)">
			<input type="file" accept=".lbrn2" onchange={onTemplate} />
		</LabeledControl>
		{#if templateError}<p class="error">{templateError}</p>{/if}
		{#if $lightburnTemplateStore}
			<p class="hint">
				{$lightburnTemplateStore.fileName} · loaded {new Date($lightburnTemplateStore.loadedAt).toLocaleString()}
			</p>
		{:else}
			<p class="hint">No template: cut settings will use LightBurn defaults.</p>
		{/if}
		{#if missing.length}
			<p class="hint">Not in template: {missing.join(', ')}</p>
		{/if}
```

Add styles:

```css
	.swatch {
		display: inline-block;
		width: 0.8em;
		height: 0.8em;
		margin-right: 0.3em;
		border: 1px solid #888;
	}
	.error {
		color: #b00;
		font-size: 0.8em;
		margin: 0;
	}
	h4 {
		margin: 0.6em 0 0.2em;
	}
```

If `NumberInput`'s `onChange` has a different signature, follow the existing `setChance` usage in this file.

- [ ] **Step 4: Check**

Run: `npx jest src/lib/lightburn` → PASS. Run `npm run check 2>&1 | tail -3`: the error count must not be above the baseline. Open the Post Process panel in the app. Toggle each control and confirm the merge does not re-run: the prepare status stays `✓ ready`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lightburn/template-status.ts src/lib/lightburn/__tests__/template-status.test.ts src/components/modal/editor/PostProcess.svelte
git commit -m "feat(ui): post-process controls for surround, page labels, layers and LightBurn template"
```

---

## Task 12: Downloads — mm SVG, `.lbrn2`, naming, guard, auto-prepare

**Files:**
- Create: `src/lib/lightburn/collect-dom-shapes.ts`
- Modify: `src/lib/util.ts` (`generateSvgUrl`, `downloadSvg`)
- Modify: `src/components/nav-header/NavHeader.svelte` (download button, CSV filename)
- Modify: any other `downloadSvg`/`generateSvgUrl` caller found by `grep -rn "downloadSvg\|generateSvgUrl" src`
- Modify: `src/lib/__tests__/generate-svg-url.test.ts` if its expectations change

**Interfaces:**
- Consumes: `exportFrame` (Task 9), `fileStamp` (Task 9), `parsePathD`, `applyMatrix` (Task 9), `buildLbProject`, `ExportShape` (Task 9), `toCubicSegments` (Task 8), `writeLbrn2` (Task 8), `collectExportNodes`, `findUntagged`, `untaggedMessage` (Task 4), `isGeometryType` (Task 1), stores `exportPagesStore`, `lightburnTemplateStore`, `postProcessConfig`, `superGlobuleStore`, `mergedBandPaths`, `toastStore`.
- Produces:
  ```ts
  // util.ts
  export const SCREEN_ONLY_SELECTOR: string; // now exported
  export const buildExportSvg = (frame: ExportFrame): { svg: Element } | { error: string };
  export const downloadSvg = (filename: string, frame: ExportFrame): { ok: true } | { ok: false; error: string };
  // collect-dom-shapes.ts
  export const collectDomShapes = (root: SVGSVGElement): ExportShape[];
  ```

- [ ] **Step 1: Export SVG in mm, behind the guard**

In `util.ts`:
- Export `SCREEN_ONLY_SELECTOR`.
- Import `exportFrame`'s `ExportFrame` type and `collectExportNodes`, `findUntagged`, `untaggedMessage` from `$lib/cut-pattern/export-guard`.
- Replace `generateSvgUrl` and `downloadSvg` with the code below.

```ts
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A standalone export document whose user unit is the millimetre: a fresh
 * root sized by `frame`, holding a clone of the pattern content scaled from
 * pattern units to mm. The on-screen zoom/pan viewBox is not carried over.
 * Refuses when any drawable lacks a geometry tag.
 */
export const buildExportSvg = (frame: ExportFrame): { svg: Element } | { error: string } => {
	const live = document.getElementById('pattern-svg');
	if (!live) return { error: 'Nothing to export: the pattern view is not rendered.' };
	const content = document.createElementNS(SVG_NS, 'g');
	content.setAttribute('transform', frame.contentTransform);
	for (const child of Array.from(live.childNodes)) content.appendChild(child.cloneNode(true));
	content.querySelectorAll(SCREEN_ONLY_SELECTOR).forEach((node) => node.remove());
	const bad = findUntagged(collectExportNodes(content));
	if (bad.length) return { error: untaggedMessage(bad) };
	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('xmlns', SVG_NS);
	svg.setAttribute('width', frame.width);
	svg.setAttribute('height', frame.height);
	svg.setAttribute('viewBox', frame.viewBox);
	svg.appendChild(content);
	return { svg };
};

export const generateSvgUrl = (frame: ExportFrame): string | { error: string } => {
	const built = buildExportSvg(frame);
	if ('error' in built) return built;
	const blob = new Blob([new XMLSerializer().serializeToString(built.svg)], { type: 'image/svg+xml' });
	return URL.createObjectURL(blob);
};

export const downloadSvg = (
	filename: string,
	frame: ExportFrame
): { ok: true } | { ok: false; error: string } => {
	const url = generateSvgUrl(frame);
	if (typeof url !== 'string') return { ok: false, error: url.error };
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	setTimeout(() => URL.revokeObjectURL(url), 0);
	return { ok: true };
};
```

Update `src/lib/__tests__/generate-svg-url.test.ts` to the new signature. If it relies on a DOM that the node environment does not provide, keep its intent: screen-only nodes are stripped, and the live tree is untouched. Assert this on `buildExportSvg` with the same fakes the test already uses. If that is not feasible, move the assertion into the Task 13 Playwright spec, and say so in the report.

- [ ] **Step 2: Collect page-space shapes from the live DOM**

`collect-dom-shapes.ts`:

```ts
import type { PathSegment } from '$lib/types';
import { isGeometryType } from '$lib/cut-pattern/post-process-types';
import { SCREEN_ONLY_SELECTOR } from '$lib/util';
import { parsePathD, applyMatrix, type Matrix } from '$lib/download/parse-path-d';
import { toCubicSegments } from './lbrn2-path';
import type { ExportShape } from './build-lb-project';

const toMatrix = (m: DOMMatrix): Matrix => ({ a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f });

const rectSegments = (el: SVGRectElement): PathSegment[] => {
	const x = el.x.baseVal.value;
	const y = el.y.baseVal.value;
	const w = el.width.baseVal.value;
	const h = el.height.baseVal.value;
	return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
};

/**
 * Every tagged drawable under the LIVE `root` (`#pattern-svg`), in root user
 * space (pattern units, page space). Matrices come from the live layout, which
 * is why this reads the document rather than a clone: a detached clone has no
 * CTM. Screen-only subtrees and hidden elements are skipped. Call it only after
 * the untagged guard has passed.
 */
export const collectDomShapes = (root: SVGSVGElement): ExportShape[] => {
	const rootInverse = root.getScreenCTM()?.inverse();
	if (!rootInverse) return [];
	const shapes: ExportShape[] = [];
	root.querySelectorAll('path[data-geometry], rect[data-geometry]').forEach((node) => {
		const el = node as SVGGraphicsElement;
		if (el.closest(SCREEN_ONLY_SELECTOR)) return;
		const geometry = el.getAttribute('data-geometry');
		if (!isGeometryType(geometry)) return;
		const style = getComputedStyle(el);
		if (style.display === 'none' || style.visibility === 'hidden') return;
		const ctm = el.getScreenCTM();
		if (!ctm) return;
		const local =
			el.tagName.toLowerCase() === 'rect'
				? rectSegments(el as SVGRectElement)
				: parsePathD(el.getAttribute('d') ?? '');
		const segments = applyMatrix(toCubicSegments(local), toMatrix(rootInverse.multiply(ctm)));
		shapes.push({ geometry, segments });
	});
	return shapes;
};
```

If importing `$lib/util` here creates a cycle, move `SCREEN_ONLY_SELECTOR` into `src/lib/cut-pattern/export-guard.ts` and import it from there in both files.

- [ ] **Step 3: NavHeader download**

Imports:
- `tick` (already imported) and `get` (already imported)
- `exportPagesStore`, `lightburnTemplateStore`, `postProcessConfig` from `$lib/stores`
- `toastStore`
- `exportFrame` from `$lib/download/export-frame` and `fileStamp` from `$lib/download/file-stamp`
- `buildLbProject` from `$lib/lightburn/build-lb-project` and `collectDomShapes` from `$lib/lightburn/collect-dom-shapes`
- `writeLbrn2` from `$lib/lightburn/lbrn2-writer`
- `layerByIndex` from `$lib/lightburn/layers`
- `collectExportNodes`, `findUntagged`, `untaggedMessage` from `$lib/cut-pattern/export-guard`
- `SCREEN_ONLY_SELECTOR`, `downloadSvg`, `downloadTextFile` from `$lib/util`

Add:

```ts
	const handleDownload = async () => {
		// Export only ever ships prepared geometry — for BOTH pattern types.
		if (get(mergedBandPaths).size === 0) {
			if (!(await handlePrepare())) return;
			await tick();
		}
		const pages = get(exportPagesStore);
		if (!pages) {
			toastStore.add({ type: 'error', message: 'Switch the pattern view to page layout to export real-world sizes.' });
			return;
		}
		const pp = get(postProcessConfig);
		const stamp = fileStamp(get(superGlobuleStore).name);

		if (pp.downloadFormat === 'lbrn2') {
			const root = document.getElementById('pattern-svg') as SVGSVGElement | null;
			if (!root) return;
			const probe = root.cloneNode(true) as Element;
			probe.querySelectorAll(SCREEN_ONLY_SELECTOR).forEach((n) => n.remove());
			const bad = findUntagged(collectExportNodes(probe));
			if (bad.length) {
				toastStore.add({ type: 'error', message: untaggedMessage(bad) });
				return;
			}
			const project = buildLbProject({
				shapes: collectDomShapes(root),
				pages: pages.pages,
				pageScale: pages.pageScale,
				layerMap: pp.layerMap
			});
			const { xml, missingLayers } = writeLbrn2(project, get(lightburnTemplateStore)?.xml);
			if (missingLayers.length) {
				const ids = missingLayers.map((i) => layerByIndex(i)?.id ?? String(i)).join(', ');
				toastStore.add({ type: 'warning', message: `No template settings for ${ids}; LightBurn defaults apply.` });
			}
			downloadTextFile(xml, `${stamp}.lbrn2`, 'application/xml');
			return;
		}

		const result = downloadSvg(`${stamp}.svg`, exportFrame(pages.pages, pages.pageScale));
		if (!result.ok) toastStore.add({ type: 'error', message: result.error });
	};
```

Replace the existing Download SVG button with:

```svelte
			<Button disabled={prepareState === 'running'} onclick={handleDownload}>
				{$postProcessConfig.downloadFormat === 'lbrn2' ? 'Download LightBurn' : 'Download SVG'}
			</Button>
```

Change the CSV download filename (the `pattern-map ${…}.csv` string in this file) to `` `${fileStamp($superGlobuleStore.name)} pattern-map.csv` ``.

Run `grep -rn "downloadSvg(\|generateSvgUrl(" src` and update any other caller to the new signatures. Callers without page data: use `exportPagesStore`, or drop the call if it is dead code, and report it.

- [ ] **Step 4: Check**

Run `npx jest 2>&1 | tail -5`: all tests must pass. Run `npm run check 2>&1 | tail -3`: the error count must not be above the baseline.
Restart the dev server, then run a scratchpad Playwright script to check the following:
1. Download an SVG. The `download.suggestedFilename()` matches `/^.+ - \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}\.svg$/`, and the file's root has `width="<page mm>mm"`.
2. Set `downloadFormat: 'lbrn2'` and download. The file contains `<LightBurnProject` and exactly as many `<Shape Type="Group"` as there are pages.
3. **CTM sanity:** in the page, take the `page-outline` rect's transformed corners via `collectDomShapes` and compare them with `exportPagesStore`'s page rects. They must be equal within 1e-6. If they differ, the root matrix is wrong: `#pattern-svg`'s viewBox was either not included or included twice. Fix the root matrix before committing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lightburn/collect-dom-shapes.ts src/lib/util.ts src/components/nav-header/NavHeader.svelte src/lib/__tests__/generate-svg-url.test.ts
git commit -m "feat(download): millimetre SVG and LightBurn export with stamped filenames"
```

---

# Wave 3

## Task 13: End-to-end verification

**Files:**
- Create: `tests/post-process-2.spec.ts`

**Interfaces:**
- Consumes: everything above. Reuse `selectVoronoiGeometry` and `settleBandCount` from `tests/hole-drop.spec.ts`, copying them into the new spec. Read and write stores through the dynamic import of `/src/lib/stores/index.ts`, as that spec does.

- [ ] **Step 1: Write the spec**

```ts
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// copy selectVoronoiGeometry and settleBandCount from tests/hole-drop.spec.ts here

const setPostProcess = (page: Page, patch: Record<string, unknown>) =>
	page.evaluate(
		async ([specifier, p]) => {
			const stores = (await import(/* @vite-ignore */ specifier as string)) as {
				patternConfigStore: { update: (fn: (c: any) => any) => void };
			};
			stores.patternConfigStore.update((c) => {
				c.patternConfig.postProcess = { ...c.patternConfig.postProcess, ...(p as object) };
				return c;
			});
		},
		['/src/lib/stores/index.ts', patch] as const
	);

const prepare = async (page: Page) => {
	await page.getByRole('button', { name: 'Prepare Download' }).click();
	await expect(page.locator('.prepare-status.done')).toBeVisible({ timeout: 120_000 });
};

test.describe('post-processing 2', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/designer2');
		await selectVoronoiGeometry(page);
		await settleBandCount(page);
		// page layout mode: set via the Page Layout panel or config store as the existing specs do
	});

	test('tags, colors, gaps, disconnects and page labels render', async ({ page }) => {
		await prepare(page);
		await setPostProcess(page, {
			disconnectSurround: true,
			connectSurround: { enabled: true, gapMm: 1.5 },
			pageLabel: { pageNumber: true, configName: false, text: 'test' }
		});
		await expect(page.locator('[data-geometry="surround-disconnect"]').first()).toBeVisible();
		expect(await page.locator('[data-geometry="outline-gap"]').count()).toBeGreaterThan(0);
		expect(await page.locator('[data-geometry="page-label"]').count()).toBeGreaterThan(0);
		expect(await page.locator('path[data-geometry="outline-gap"]').first().getAttribute('stroke')).toBe('#0000FF');
		await expect(page.locator('.prepare-status.done')).toBeVisible(); // no re-merge
	});

	test('SVG download is millimetre-true and stamped', async ({ page }) => {
		await prepare(page);
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Download SVG' }).click()
		]);
		expect(download.suggestedFilename()).toMatch(/ - \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}\.svg$/);
		const svg = await readFile((await download.path())!, 'utf8');
		expect(svg).toMatch(/<svg[^>]*width="[\d.]+mm"/);
		expect(svg).not.toMatch(/<path(?![^>]*data-geometry)[^>]*>/);
	});

	test('LightBurn download has one group per page', async ({ page }) => {
		await prepare(page);
		await setPostProcess(page, { downloadFormat: 'lbrn2' });
		const pages = await page.locator('g.page-geometry').count();
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Download LightBurn' }).click()
		]);
		expect(download.suggestedFilename()).toMatch(/\.lbrn2$/);
		const xml = await readFile((await download.path())!, 'utf8');
		expect(xml).toContain('<LightBurnProject');
		expect((xml.match(/<Shape Type="Group"/g) ?? []).length).toBe(pages);
	});

	test('download auto-prepares an unprepared tiled pattern', async ({ page }) => {
		const [download] = await Promise.all([
			page.waitForEvent('download', { timeout: 120_000 }),
			page.getByRole('button', { name: 'Download SVG' }).click()
		]);
		expect(download.suggestedFilename()).toMatch(/\.svg$/);
	});
});
```

Complete the `beforeEach` page-layout step the same way `tests/prepare-download.spec.ts` does, if it switches layout mode. If none of the existing specs switch layout mode, set `patternViewConfig`/layout mode through the store with the same `update` pattern, and name the field you set in the report.

- [ ] **Step 2: Run the whole suite**

Restart the dev server, then run:

```bash
npx jest 2>&1 | tail -5
npm run check 2>&1 | tail -3
npx playwright test tests/post-process-2.spec.ts tests/hole-drop.spec.ts tests/prepare-download.spec.ts
```

Expected: every Jest suite passes (the baseline plus the new tests), the check count is not above the baseline, and all three Playwright specs pass.

- [ ] **Step 3: Commit**

```bash
git add tests/post-process-2.spec.ts
git commit -m "test(e2e): post-processing 2 — tags, surround, page labels, mm SVG, LightBurn"
```

- [ ] **Step 4: Manual cutter check (Ben)**

Hand this to Ben, not to an agent:
1. On the cutter, save a `.lbrn2` with your real layers configured.
2. Load it with "Template (.lbrn2)" in the Post Process panel.
3. Export a one-page pattern as LightBurn and open it on the cutter.
4. Confirm that the layers carry your settings, that the page rect sits on T1 at 300 mm, and that selecting the page group and cutting it only cuts that page.
