# Pattern Map CSV Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a downloadable CSV "pattern map" describing band assembly relationships (ring codes, adjacent partners, end partners) with two layouts chosen by the active band-sort mode, plus a two-step nav-bar button to generate and download it.

**Architecture:** A new PURE function `buildPatternCsv(index, tubes)` in `src/lib/cut-pattern/build-pattern-csv.ts` branches on `index.mode` (`tube-order` | `end-connection-tube`) to emit a header row plus relationship rows. It derives within-tube adjacency structurally (before/after neighbor bands sharing the same globule+tube in `TubeCutPattern.bands` order — the same ordering `buildTubeOrderIndex` uses) and end partners from `BandCutPattern.meta.startPartnerBand`/`endPartnerBand`. Ring codes are resolved through WS-B's `buildBandCodeMap`. The only UI glue is a nav-header button mirroring the existing two-step "Prepare Download" → "Download SVG" flow; download uses the same Blob+anchor approach as `downloadSvg`.

**Tech Stack:** SvelteKit + TypeScript + Three.js (Threlte) + Jest (unit) + Svelte 5 runes (NavHeader is `.svelte` with `$:` reactive blocks).

---

## File Structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `src/lib/cut-pattern/build-pattern-csv.ts` | **Create** | PURE `buildPatternCsv(index, tubes)`; helpers `csvCell`, `formatBandAddress`, `withinTubeAdjacentPartners`, `endPartnerAddresses`. No DOM, no stores. |
| `src/lib/cut-pattern/__tests__/build-pattern-csv.test.ts` | **Create** | Unit tests: end-connection layout, tube-order layout, CSV quoting/alignment. |
| `src/lib/util.ts` | **Modify** | Add `downloadTextFile(text, filename, mimeType)` Blob+anchor helper (mirrors `downloadSvg`), reused by the CSV button. |
| `src/components/nav-header/NavHeader.svelte` | **Modify** | Add the two-step "Make CSV" → "Download CSV" button; reset to idle when pattern/sort changes. UI glue only. |

### Contracted from WS-B (treat as existing — do NOT reimplement)

In `src/lib/cut-pattern/band-sort-index.ts`:
- `export const buildBandCodeMap = (index: BandSortIndex): Map<string, string>` — keyed by `` `${globule}-${tube}-${band}` ``, value is the group `code`.
- `export const formatGroupCode = (n: number): string => String(n).padStart(4, '0')`.
- `BandSortGroup` gains optional `code?: string`.
- `bandKey` is module-PRIVATE — **do NOT import it.** Build your own `` `${ref.globule}-${ref.tube}-${ref.band}` `` key strings (this plan defines a local `bandKey` helper inside `build-pattern-csv.ts`).

### Verified real types/APIs (do NOT redefine)

- `BandSortIndex = { mode: BandSortMode; groups: BandSortGroup[] }` — `src/lib/types.ts:31`.
- `BandSortMode = 'tube-order' | 'end-connection-tube'` — `src/lib/types.ts:22`.
- `BandSortGroup = { label: string; bands: BandRef[]; code?: string }` (`code` added by WS-B) — `src/lib/types.ts:26`.
- `BandRef = GlobuleAddress_Band` — `src/lib/types.ts:24`.
- `GlobuleAddress_Band = { globule: number; tube: number; band: number }` (intersection of `GlobuleAddress_Globule`/`_Tube`) — `src/lib/projection-geometry/types.ts:277`.
- `TubeCutPattern = { projectionType: 'patterned'; address: GlobuleAddress_Tube; bands: BandCutPattern[] }` — `src/lib/types.ts:375`.
- `BandCutPattern.address: GlobuleAddress_Band` — `src/lib/types.ts:350`.
- `BandCutPattern.meta?: { startPartnerBand: GlobuleAddress_Band; endPartnerBand: GlobuleAddress_Band; ... }` — `src/lib/types.ts:358-365`.
- `downloadSvg(id, filename?)` (Blob/anchor download precedent) — `src/lib/util.ts:94`.

---

## Key design resolutions (read before coding)

### How within-tube adjacency is derived (CRITICAL)

The facet-level `meta.ab.partner` / `meta.ac.partner` referenced in `generate-outlined-pattern.ts:327-336` and `:485-494` lives on the **`Facet`** type (`src/lib/types.ts:722+`, the *input* to outlined generation). It is **NOT present** on the `CutPattern` facets stored in the final `BandCutPattern.facets` (that `CutPattern.meta` only has `originalPath`/`prevBandPath` — `src/lib/types.ts:218-221`). By the time we hold `TubeCutPattern[]`, the only band-relationship metadata preserved is `BandCutPattern.meta.startPartnerBand` / `endPartnerBand` (populated at `generate-outlined-pattern.ts:485-494` from that facet `ab.partner` data).

Therefore **within-tube adjacency is derived structurally, not from facet partner meta**: a band's adjacent partners are its **before/after neighbor bands in the same tube** — i.e. the entries at index `i-1` and `i+1` within the same `TubeCutPattern.bands` array (same `globule` + `tube`). This is exactly the ordering `buildTubeOrderIndex` uses (`band-sort-index.ts:5-11`), so it stays consistent with the rest of the system. End partners (cross-tube, the `meta.*PartnerBand` joins) are kept distinct from adjacency, matching `generate-outlined-pattern.ts`'s "end partner" notion.

`withinTubeAdjacentPartners(addr, tubes)` returns up to two `GlobuleAddress_Band`s: the neighbors at `i±1` in the band's own tube. First band has only an "after" neighbor; last band only a "before"; a singleton band has none.

### CSV quoting rule (RFC 4180-aligned, fixed)

- Fields are comma-separated. Row column count may vary (it's a map, not a rectangular table).
- **Multi-value cells use a single field whose values are joined by a space** (`' '`). The whole cell is then run through `csvCell`, which wraps the field in double-quotes iff it contains a comma, double-quote, space, newline, or carriage return, and doubles any embedded `"`. Because every multi-value cell contains spaces, it is always quoted — so the space-separated list stays inside ONE column and never breaks alignment.
- Empty multi-value cells emit an empty field (`''`, unquoted) so columns stay positionally stable.
- Rows are joined with `'\n'`. No trailing newline.

### Header rows (per mode)

- `tube-order`: `band,adjacent,endPartners`
- `end-connection-tube`: `ringCode,partnerRingCodes,members`

### Address / member formatting

- Band address (tube-order col 1, ring members): `formatBandAddress(addr) = `t${addr.tube}/b${addr.band}``.
  (Globule is omitted in display per the spec's `t{tube}/b{band}` format; the lookup key still includes globule.)

---

## Task 1: Pure CSV builder — `tube-order` mode

**Files:**
- Create: `src/lib/cut-pattern/build-pattern-csv.ts`
- Test: `src/lib/cut-pattern/__tests__/build-pattern-csv.test.ts`

Implements address column, within-tube adjacency column, end-partner column, and the `csvCell` quoting helper. (`end-connection-tube` mode added in Task 2.)

- [ ] Write a FAILING test file `src/lib/cut-pattern/__tests__/build-pattern-csv.test.ts` (REAL code):

```ts
import { buildPatternCsv } from '../build-pattern-csv';
import type { BandSortIndex, TubeCutPattern, GlobuleAddress_Band } from '$lib/types';

const addr = (tube: number, band: number): GlobuleAddress_Band => ({ globule: 0, tube, band });

// Minimal TubeCutPattern fixtures: only `address`, `bands[].address`, and
// `bands[].meta` matter to buildPatternCsv. Cast through unknown to satisfy
// the wider type without supplying geometry-heavy fields.
const band = (
	a: GlobuleAddress_Band,
	meta?: { startPartnerBand: GlobuleAddress_Band; endPartnerBand: GlobuleAddress_Band }
) => ({ address: a, meta }) as unknown as TubeCutPattern['bands'][number];

const tube = (t: number, bands: TubeCutPattern['bands']): TubeCutPattern =>
	({ projectionType: 'patterned', address: { globule: 0, tube: t }, bands }) as TubeCutPattern;

describe('buildPatternCsv — tube-order', () => {
	test('emits header + one row per band with adjacency and end partners', () => {
		// Tube 0: b0, b1, b2 (b1 is adjacent to b0 and b2).
		// b1 has an end-partner join to t1/b0.
		const tubes: TubeCutPattern[] = [
			tube(0, [
				band(addr(0, 0)),
				band(addr(0, 1), { startPartnerBand: addr(1, 0), endPartnerBand: addr(1, 0) }),
				band(addr(0, 2))
			]),
			tube(1, [band(addr(1, 0))])
		];
		const index: BandSortIndex = { mode: 'tube-order', groups: [] };

		const csv = buildPatternCsv(index, tubes);
		const rows = csv.split('\n');

		expect(rows[0]).toBe('band,adjacent,endPartners');
		// b0: only an "after" neighbor (b1); no end partners.
		expect(rows[1]).toBe('t0/b0,t0/b1,');
		// b1: before+after neighbors quoted as one cell; end partner t1/b0 (deduped to one).
		expect(rows[2]).toBe('t0/b1,"t0/b0 t0/b2",t1/b0');
		// b2: only a "before" neighbor (b1); no end partners.
		expect(rows[3]).toBe('t0/b2,t0/b1,');
		// t1/b0: singleton tube — no adjacency, no end partners.
		expect(rows[4]).toBe('t1/b0,,');
	});

	test('multi-value cell with a space is wrapped in one quoted field', () => {
		const tubes: TubeCutPattern[] = [
			tube(0, [band(addr(0, 0)), band(addr(0, 1)), band(addr(0, 2))])
		];
		const csv = buildPatternCsv({ mode: 'tube-order', groups: [] }, tubes);
		const rows = csv.split('\n');
		// Middle band has two adjacents joined by a space inside ONE quoted field.
		expect(rows[2]).toBe('t0/b1,"t0/b0 t0/b2",');
		// Quoted field => exactly 3 comma-top-level columns (split is naive but
		// the quote keeps the space-list intact for any RFC4180 parser).
		expect(rows[2].split('"').length).toBe(3); // one quoted segment
	});
});
```

- [ ] Run (expected FAIL — module does not exist):
  `npm run test:unit -- src/lib/cut-pattern/__tests__/build-pattern-csv.test.ts`
  Expect: `Cannot find module '../build-pattern-csv'`.

- [ ] Create `src/lib/cut-pattern/build-pattern-csv.ts` with the MINIMAL real implementation (tube-order only):

```ts
import type { BandSortIndex, TubeCutPattern, GlobuleAddress_Band } from '$lib/types';

/** Local key builder. WS-B's `bandKey` is module-private; we mirror its shape. */
const bandKey = (a: GlobuleAddress_Band): string => `${a.globule}-${a.tube}-${a.band}`;

/** Display form for an address. Globule omitted per spec `t{tube}/b{band}`. */
const formatBandAddress = (a: GlobuleAddress_Band): string => `t${a.tube}/b${a.band}`;

/**
 * RFC 4180-aligned cell encoder. Quotes the field iff it contains a comma,
 * double-quote, space, or line break; doubles embedded quotes. Multi-value
 * cells (joined by spaces) are therefore always quoted, keeping the list in
 * one column.
 */
const csvCell = (value: string): string => {
	if (/[",\s]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
};

/** Join multiple display values into one space-separated cell. */
const multiCell = (values: string[]): string => csvCell(values.join(' '));

/**
 * Within-tube adjacency: the before/after neighbor bands in the SAME tube
 * (index +/- 1 of the band's position in `TubeCutPattern.bands`). This matches
 * `buildTubeOrderIndex` ordering. The facet-level `meta.ab/ac.partner` data is
 * not present on `BandCutPattern`, so adjacency is structural by design.
 */
const withinTubeAdjacentPartners = (
	address: GlobuleAddress_Band,
	tubes: TubeCutPattern[]
): GlobuleAddress_Band[] => {
	const tube = tubes.find(
		(t) => t.address.globule === address.globule && t.address.tube === address.tube
	);
	if (!tube) return [];
	const i = tube.bands.findIndex((b) => bandKey(b.address) === bandKey(address));
	if (i < 0) return [];
	const out: GlobuleAddress_Band[] = [];
	if (i - 1 >= 0) out.push(tube.bands[i - 1].address);
	if (i + 1 < tube.bands.length) out.push(tube.bands[i + 1].address);
	return out;
};

/**
 * End-partner addresses from `meta.startPartnerBand`/`endPartnerBand`,
 * deduped, missing entries omitted.
 */
const endPartnerAddresses = (
	band: TubeCutPattern['bands'][number]
): GlobuleAddress_Band[] => {
	const partners: GlobuleAddress_Band[] = [];
	if (band.meta?.startPartnerBand) partners.push(band.meta.startPartnerBand);
	if (band.meta?.endPartnerBand) partners.push(band.meta.endPartnerBand);
	const seen = new Set<string>();
	return partners.filter((p) => {
		const k = bandKey(p);
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
};

const buildTubeOrderCsv = (tubes: TubeCutPattern[]): string => {
	const rows: string[] = ['band,adjacent,endPartners'];
	for (const tube of tubes) {
		for (const band of tube.bands) {
			const self = csvCell(formatBandAddress(band.address));
			const adjacent = multiCell(
				withinTubeAdjacentPartners(band.address, tubes).map(formatBandAddress)
			);
			const ends = multiCell(endPartnerAddresses(band).map(formatBandAddress));
			rows.push(`${self},${adjacent},${ends}`);
		}
	}
	return rows.join('\n');
};

/** PURE: build a relationship-map CSV string for the active sort mode. */
export const buildPatternCsv = (index: BandSortIndex, tubes: TubeCutPattern[]): string => {
	switch (index.mode) {
		case 'tube-order':
			return buildTubeOrderCsv(tubes);
		case 'end-connection-tube':
			// Implemented in Task 2.
			return buildTubeOrderCsv(tubes);
	}
};
```

- [ ] Run (expected PASS):
  `npm run test:unit -- src/lib/cut-pattern/__tests__/build-pattern-csv.test.ts`
  Expect: both `tube-order` tests green.

- [ ] Commit:
```bash
git add src/lib/cut-pattern/build-pattern-csv.ts src/lib/cut-pattern/__tests__/build-pattern-csv.test.ts
git commit -m "feat(csv): pure buildPatternCsv tube-order mode

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Pure CSV builder — `end-connection-tube` mode

**Files:**
- Modify: `src/lib/cut-pattern/build-pattern-csv.ts` (add `buildEndConnectionCsv`, wire the switch case)
- Test: `src/lib/cut-pattern/__tests__/build-pattern-csv.test.ts` (add `end-connection` describe block)

Row per ring group: ring code, deduped partner ring codes (self excluded), then one member column per member.

- [ ] Add a FAILING `end-connection` test block to `build-pattern-csv.test.ts` (REAL code). Append after the existing `describe`:

```ts
import { buildBandCodeMap } from '../band-sort-index';

describe('buildPatternCsv — end-connection-tube', () => {
	test('row per ring: code, deduped partner codes (self excluded), member columns', () => {
		// Three tubes, each a single band; the three bands form one ring via
		// end-partner joins. Each band's within-tube adjacency is empty (singleton
		// tubes), so to exercise partner-code collection we give each tube TWO bands
		// where the ring member is adjacent to a sibling that belongs to another ring.
		//
		// Layout:
		//   tube0: b0 (ringA member), b1 (ringB member)  -> b0 adj b1
		//   tube1: b0 (ringA member), b1 (ringB member)  -> b0 adj b1
		//   tube2: b0 (ringA member), b1 (ringB member)  -> b0 adj b1
		// ringA = {t0/b0, t1/b0, t2/b0}, ringB = {t0/b1, t1/b1, t2/b1}
		const a = (tube: number, b: number): GlobuleAddress_Band => ({ globule: 0, tube, band: b });
		const mkBand = (
			adr: GlobuleAddress_Band,
			meta?: { startPartnerBand: GlobuleAddress_Band; endPartnerBand: GlobuleAddress_Band }
		) => ({ address: adr, meta }) as unknown as TubeCutPattern['bands'][number];
		const mkTube = (t: number, bands: TubeCutPattern['bands']): TubeCutPattern =>
			({ projectionType: 'patterned', address: { globule: 0, tube: t }, bands }) as TubeCutPattern;

		const tubes: TubeCutPattern[] = [
			mkTube(0, [
				mkBand(a(0, 0), { startPartnerBand: a(2, 0), endPartnerBand: a(1, 0) }),
				mkBand(a(0, 1), { startPartnerBand: a(2, 1), endPartnerBand: a(1, 1) })
			]),
			mkTube(1, [
				mkBand(a(1, 0), { startPartnerBand: a(0, 0), endPartnerBand: a(2, 0) }),
				mkBand(a(1, 1), { startPartnerBand: a(0, 1), endPartnerBand: a(2, 1) })
			]),
			mkTube(2, [
				mkBand(a(2, 0), { startPartnerBand: a(1, 0), endPartnerBand: a(0, 0) }),
				mkBand(a(2, 1), { startPartnerBand: a(1, 1), endPartnerBand: a(0, 1) })
			])
		];

		// Construct an end-connection index with WS-B codes assigned.
		const index: BandSortIndex = {
			mode: 'end-connection-tube',
			groups: [
				{ label: 'Ring 0', code: '0000', bands: [a(0, 0), a(1, 0), a(2, 0)] },
				{ label: 'Ring 1', code: '0001', bands: [a(0, 1), a(1, 1), a(2, 1)] }
			]
		};

		const codeMap = buildBandCodeMap(index); // sanity: WS-B contract present
		expect(codeMap.get('0-0-0')).toBe('0000');

		const csv = buildPatternCsv(index, tubes);
		const rows = csv.split('\n');

		expect(rows[0]).toBe('ringCode,partnerRingCodes,members');
		// Ring 0 members each adjacent to a Ring 1 member => partner code 0001
		// (deduped across 3 members; self 0000 excluded). Members in group order.
		expect(rows[1]).toBe('0000,0001,t0/b0,t1/b0,t2/b0');
		// Ring 1 symmetric: partner code 0000.
		expect(rows[2]).toBe('0001,0000,t0/b1,t1/b1,t2/b1');
	});

	test('ring with no cross-ring adjacency emits empty partner cell', () => {
		const a = (tube: number, b: number): GlobuleAddress_Band => ({ globule: 0, tube, band: b });
		const mkBand = (adr: GlobuleAddress_Band) =>
			({ address: adr, meta: undefined }) as unknown as TubeCutPattern['bands'][number];
		const mkTube = (t: number, bands: TubeCutPattern['bands']): TubeCutPattern =>
			({ projectionType: 'patterned', address: { globule: 0, tube: t }, bands }) as TubeCutPattern;
		const tubes: TubeCutPattern[] = [mkTube(0, [mkBand(a(0, 0))])];
		const index: BandSortIndex = {
			mode: 'end-connection-tube',
			groups: [{ label: 'Ring 0', code: '0000', bands: [a(0, 0)] }]
		};
		const csv = buildPatternCsv(index, tubes);
		const rows = csv.split('\n');
		expect(rows[1]).toBe('0000,,t0/b0');
	});
});
```

- [ ] Run (expected FAIL — current `end-connection-tube` case falls through to tube-order, wrong header/shape):
  `npm run test:unit -- src/lib/cut-pattern/__tests__/build-pattern-csv.test.ts`
  Expect: `end-connection-tube` tests fail on header `ringCode,...` mismatch.

- [ ] Add `buildEndConnectionCsv` and wire the switch in `build-pattern-csv.ts` (REAL code). Add the import of `buildBandCodeMap` at the top:

```ts
import { buildBandCodeMap } from './band-sort-index';
```

Add the function (above `buildPatternCsv`):

```ts
const buildEndConnectionCsv = (index: BandSortIndex, tubes: TubeCutPattern[]): string => {
	const codeMap = buildBandCodeMap(index);
	const rows: string[] = ['ringCode,partnerRingCodes,members'];

	for (const group of index.groups) {
		const ringCode = group.code ?? '';

		// Collect partner ring codes: for every member, find its within-tube
		// adjacent partners, map each to its ring code via codeMap, dedupe, and
		// exclude this ring's own code.
		const partnerCodes = new Set<string>();
		for (const member of group.bands) {
			for (const adj of withinTubeAdjacentPartners(member, tubes)) {
				const code = codeMap.get(bandKey(adj));
				if (code && code !== ringCode) partnerCodes.add(code);
			}
		}

		const members = group.bands.map((b) => csvCell(formatBandAddress(b)));
		const cells = [
			csvCell(ringCode),
			multiCell([...partnerCodes]),
			...members
		];
		rows.push(cells.join(','));
	}

	return rows.join('\n');
};
```

Update the switch case:

```ts
		case 'end-connection-tube':
			return buildEndConnectionCsv(index, tubes);
```

- [ ] Run (expected PASS): all four tests green.
  `npm run test:unit -- src/lib/cut-pattern/__tests__/build-pattern-csv.test.ts`

- [ ] Run type check (expected PASS):
  `npm run check`

- [ ] Commit:
```bash
git add src/lib/cut-pattern/build-pattern-csv.ts src/lib/cut-pattern/__tests__/build-pattern-csv.test.ts
git commit -m "feat(csv): buildPatternCsv end-connection-tube ring map

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `downloadTextFile` helper in `util.ts`

**Files:**
- Modify: `src/lib/util.ts` (add `downloadTextFile` after `downloadSvg`, around line 104)
- Test: `src/lib/cut-pattern/__tests__/build-pattern-csv.test.ts` is NOT extended (this helper touches the DOM). Add a small focused test file instead: `src/lib/__tests__/download-text-file.test.ts`.

A reusable Blob+anchor download (CSV uses it; mirrors `downloadSvg`'s anchor approach but takes content directly).

- [ ] Write a FAILING test `src/lib/__tests__/download-text-file.test.ts` (REAL code). (Verify the `src/lib/__tests__/` dir glob is covered — Jest config matches `**/__tests__/**/*.test.ts`.)

```ts
import { downloadTextFile } from '../util';

describe('downloadTextFile', () => {
	test('creates an anchor with download attr and clicks it', () => {
		const createObjectURL = jest.fn(() => 'blob:mock');
		const revokeObjectURL = jest.fn();
		// jsdom lacks URL.createObjectURL; stub it.
		(URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
		(URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;

		const click = jest.fn();
		const realCreate = document.createElement.bind(document);
		const spy = jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
			const el = realCreate(tag) as HTMLAnchorElement;
			if (tag === 'a') el.click = click;
			return el;
		});

		downloadTextFile('a,b\n1,2', 'map.csv', 'text/csv');

		expect(createObjectURL).toHaveBeenCalledTimes(1);
		expect(click).toHaveBeenCalledTimes(1);
		spy.mockRestore();
	});
});
```

- [ ] Run (expected FAIL — `downloadTextFile` not exported):
  `npm run test:unit -- src/lib/__tests__/download-text-file.test.ts`
  Expect: `downloadTextFile is not a function` / import undefined.

- [ ] Add `downloadTextFile` to `src/lib/util.ts` immediately after `downloadSvg` (ends at line 104) (REAL code):

```ts
export const downloadTextFile = (
	text: string,
	filename: string,
	mimeType: string = 'text/plain'
) => {
	const blob = new Blob([text], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
};
```

- [ ] Run (expected PASS):
  `npm run test:unit -- src/lib/__tests__/download-text-file.test.ts`

- [ ] Commit:
```bash
git add src/lib/util.ts src/lib/__tests__/download-text-file.test.ts
git commit -m "feat(util): downloadTextFile Blob+anchor helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: NavHeader "Make CSV" → "Download CSV" button (UI glue only)

**Files:**
- Modify: `src/components/nav-header/NavHeader.svelte`
  - imports block (~`:1-22`)
  - reactive invalidation block (~`:29-37`)
  - script logic (add after `runPrepare`, ~`:86`)
  - button-group markup (after "Download SVG", ~`:171`)

No new unit test (DOM/store glue). Acceptance = `npm run check` clean + the manual cycle described below. Mirror the existing two-step "Prepare Download" → "Download SVG" pattern (`:159-171`) and reuse `collateTubes` (already imported) + `buildBandSortIndex` + `buildPatternCsv` + `downloadTextFile`.

- [ ] Add imports to the top `import` block of `NavHeader.svelte`:

```ts
	import { buildBandSortIndex } from '$lib/cut-pattern/band-sort-index';
	import { buildPatternCsv } from '$lib/cut-pattern/build-pattern-csv';
	import { downloadTextFile } from '$lib/util';
```

  (`collateTubes`, `get`, `patternConfigStore`, `superGlobulePatternStore`, `viewControlStore`, `superGlobuleStore` are already imported — verified at `:2-22`.)

- [ ] Add local state + handlers after `runPrepare` (which ends at `:86`):

```ts
	type CsvState = 'idle' | 'ready';
	let csvState: CsvState = 'idle';
	let csvText = '';

	const buildTubesForCsv = () => {
		const patternState = get(superGlobulePatternStore) as any;
		const config = get(patternConfigStore);
		const view = get(viewControlStore);
		return collateTubes({
			globuleTubePattern: patternState.globuleTubePattern,
			projectionPattern: patternState.projectionPattern,
			surfaceProjectionPattern: patternState.surfaceProjectionPattern,
			voronoiPattern: patternState.voronoiPattern,
			voronoiSurfacePattern: patternState.voronoiSurfacePattern,
			showGlobuleTubeGeometry: view.showGlobuleTubeGeometry,
			showProjectionGeometry: view.showProjectionGeometry,
			patternSource: config.patternViewConfig.patternSource ?? 'projection'
		});
	};

	const handleCsvClick = () => {
		if (csvState === 'idle') {
			const config = get(patternConfigStore);
			const mode = config.patternViewConfig.bandSortMode ?? 'tube-order';
			const tubes = buildTubesForCsv();
			const index = buildBandSortIndex(tubes, mode);
			csvText = buildPatternCsv(index, tubes);
			csvState = 'ready';
		} else {
			downloadTextFile(
				csvText,
				`pattern-map ${get(superGlobuleStore).name}.csv`,
				'text/csv'
			);
		}
	};
```

- [ ] Reset CSV state to idle when the pattern/sort changes. Extend the existing invalidation reactive block (`:29-37`) — after `mergedBandPaths.set(new Map());` add a reference to the sort mode and reset:

```ts
		void $patternConfigStore.patternViewConfig.bandSortMode;
		csvState = 'idle';
		csvText = '';
```

  (This block already references `$superGlobulePatternStore`, so any geometry change re-runs it and resets the CSV — matching the SVG invalidation behavior.)

- [ ] Add the button after the "Download SVG" `<Button>` (closing tag at `:171`):

```svelte
				<Button onclick={handleCsvClick}>
					{csvState === 'idle' ? 'Make CSV' : 'Download CSV'}
				</Button>
```

- [ ] Run type check (expected PASS):
  `npm run check`

- [ ] Manual verification (described check; no automated test for UI glue):
  - `npm run dev`, open `/designer2`.
  - Generate a pattern. In CutPatternControl set band-sort mode to `tube-order`; click **Make CSV** → label flips to **Download CSV**; click → a `pattern-map *.csv` downloads and opens in a spreadsheet with header `band,adjacent,endPartners` and stable columns (multi-value cells stay in one column).
  - Switch band-sort mode to end-connection; the button resets to **Make CSV**; regenerate; click Make → Download; CSV header is `ringCode,partnerRingCodes,members`, one row per ring, member columns populated, partner ring codes deduped with self excluded.
  - Modify geometry → button resets to **Make CSV** (invalidation works).

- [ ] Commit:
```bash
git add src/components/nav-header/NavHeader.svelte
git commit -m "feat(csv): NavHeader Make CSV / Download CSV button

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review checklist (run before declaring done)

- [ ] **Spec coverage:** two modes (tube-order row-per-band; end-connection row-per-ring), partner ring codes deduped + self-excluded, member columns in group order, end partners from `meta.*PartnerBand` deduped/omitted-when-missing, header row per mode, two-step nav button, reset-on-change. ✔ mapped to Tasks 1-4.
- [ ] **Placeholder scan:** no `TODO`/`FIXME`/`...`/`any`-typed public signatures left in shipped code (the `as any`/`as unknown` casts are confined to test fixtures and the existing NavHeader store-read pattern, matching `runPrepare`).
- [ ] **Type consistency:** every referenced type verified in repo (`BandSortIndex`, `BandSortGroup.code`, `TubeCutPattern`, `BandCutPattern.meta`, `GlobuleAddress_Band`) or contracted by WS-B (`buildBandCodeMap`, `formatGroupCode`, `code`). `bandKey` is re-implemented locally (NOT imported) per the WS-B note.
- [ ] **PURE builder:** `buildPatternCsv` has no DOM/store/IO; all side effects live in `downloadTextFile` (Task 3) and NavHeader (Task 4).
- [ ] **Adjacency consistency:** within-tube adjacency derived structurally from `TubeCutPattern.bands` neighbors (same globule+tube, index ±1) — consistent with `buildTubeOrderIndex`; end partners kept distinct, sourced from `meta.startPartnerBand`/`endPartnerBand` exactly as populated at `generate-outlined-pattern.ts:485-494`.
- [ ] All Jest tests green: `npm run test:unit -- src/lib/cut-pattern/__tests__/build-pattern-csv.test.ts src/lib/__tests__/download-text-file.test.ts`
- [ ] `npm run check` clean.
