# Tiled Pattern Editor — Phase 2: Variant Storage + Registry

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add storage and registry plumbing so user-defined `TiledPatternSpec` variants can be persisted, loaded, and dispatched alongside built-in defaults — with no editor UI yet (variants only creatable via API in this phase).

**Architecture:** Add a `kind` column to the existing `shades_configs` table. New rows with `kind: 'tile-pattern-spec'` store JSON-blob `TiledPatternSpec` data. A new variant store (`tilePatternSpecStore.ts`) hydrates these from the API on app init. A new `pattern-registry.ts` declares the editable algorithms (just shield in v1) with factory functions that turn a spec into a `PatternGenerator` entry. Default specs are registered at module load; user variants are registered when the store hydrates. Dispatch (`patterns[type]`) keeps working unchanged — variant ids are now valid keys. `TiledPattern` widens from string-literal union to `string`.

**Tech Stack:** TypeScript, SvelteKit, Drizzle ORM (Turso/SQLite), Jest. Migrations via `npm run drizzle:generate` + `npm run drizzle:migrate`.

---

## File Structure

**Create:**
- `src/lib/patterns/pattern-registry.ts` — `PatternAlgorithm` type, `algorithms` list, factory + registration functions
- `src/lib/stores/tilePatternSpecStore.ts` — reactive Svelte store; loads variants from API and registers them in the patterns map
- `drizzle/migrations/0003_*.sql` — auto-generated migration for `kind` column

**Modify:**
- `src/lib/server/schema/shadesConfig.ts` — add `kind` column with default `'project'`
- `src/routes/api/config/+server.ts` — accept `?kind=` query param to filter; include `configJson` in list response when `kind` filter is present
- `src/lib/types.ts` — loosen `TiledPattern` from string-literal union to `string`
- `src/lib/patterns/pattern-definitions.ts` — replace shield's hardcoded entry construction with registry-driven registration; add `default` branch to whatever switches on `TiledPattern`
- `src/components/controls/TilingControl.svelte` — iterate over registered algorithms instead of static `tiledPatternConfigs` dict (UI behavior unchanged for this phase: only built-in defaults render until Phase 3 lands)
- `src/lib/shades-config.ts` — fix any switch that pattern-matches on `TiledPattern` (the `default` branch handles unknown variant ids)

**No changes:** `src/lib/cut-pattern/generate-tiled-pattern.ts` and `generate-pattern.ts` continue to use `patterns[tiledPatternConfig.type]` lookup. Dispatch is identical; variants just become extra map entries.

---

## Important note on backward compatibility

Existing rows in `shades_configs` get `kind: 'project'` by the column default. Existing project configs continue loading unchanged. The existing shield pattern with `type: 'tiledShieldTesselationPattern'` continues to render — Phase 1's snapshot test still passes after Phase 2 because `defaultShieldSpec` registers under that exact key.

---

### Task 1: Add `kind` column to schema + migration

**Files:**
- Modify: `src/lib/server/schema/shadesConfig.ts`
- Create: `drizzle/migrations/0003_*.sql` (auto-generated)

- [x] **Step 1: Add `kind` column to schema**

Edit `src/lib/server/schema/shadesConfig.ts`:

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const shadesConfigs = sqliteTable('shades_configs', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	kind: text('kind').notNull().default('project'),
	configJson: text('config_json').notNull(),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(datetime('now'))`),
	updatedAt: text('updated_at')
		.notNull()
		.default(sql`(datetime('now'))`)
});
```

- [x] **Step 2: Generate migration**

```bash
npm run drizzle:generate
```

Expected: A new SQL file appears in `drizzle/migrations/` (e.g., `0003_*.sql`) containing `ALTER TABLE shades_configs ADD COLUMN kind TEXT NOT NULL DEFAULT 'project'`.

- [x] **Step 3: Apply migration**

```bash
npm run drizzle:migrate
```

Expected: migration succeeds without errors. Existing rows now have `kind = 'project'`.

- [x] **Step 4: Verify with drizzle:studio (optional)**

If you want to spot-check: `npm run drizzle:studio` and confirm existing rows have `kind = 'project'`.

- [x] **Step 5: Commit**

```bash
git add src/lib/server/schema/shadesConfig.ts drizzle/migrations/
git commit -m "Add kind column to shades_configs"
git push
```

---

### Task 2: API kind filter + configJson inclusion

**Files:**
- Modify: `src/routes/api/config/+server.ts`

- [ ] **Step 1: Update GET to filter by kind**

Edit `src/routes/api/config/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tursoClient } from '$lib/server/turso';
import { shadesConfigs } from '$lib/server/schema/shadesConfig';
import { desc, eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
	const kind = url.searchParams.get('kind');
	const includeConfigJson = url.searchParams.get('include') === 'configJson' || kind === 'tile-pattern-spec';

	const db = tursoClient();
	const baseColumns = {
		id: shadesConfigs.id,
		name: shadesConfigs.name,
		kind: shadesConfigs.kind,
		createdAt: shadesConfigs.createdAt,
		updatedAt: shadesConfigs.updatedAt
	};
	const columns = includeConfigJson
		? { ...baseColumns, configJson: shadesConfigs.configJson }
		: baseColumns;

	const query = db.select(columns).from(shadesConfigs);
	const filtered = kind ? query.where(eq(shadesConfigs.kind, kind)) : query;
	const configs = await filtered.orderBy(desc(shadesConfigs.updatedAt));

	return json(configs);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { name, configJson, kind } = body;

	if (!name || !configJson) {
		return json({ error: 'name and configJson are required' }, { status: 400 });
	}

	const db = tursoClient();
	const result = await db.insert(shadesConfigs).values({
		name,
		kind: kind || 'project',
		configJson: typeof configJson === 'string' ? configJson : JSON.stringify(configJson)
	});

	return json({ id: Number(result.lastInsertRowid), name, kind: kind || 'project' }, { status: 201 });
};
```

- [ ] **Step 2: Manual smoke test the API**

Start dev server (`npm run dev`) and exercise the API in another terminal:

```bash
# List all (existing project rows visible, new kind column populated)
curl 'http://localhost:5173/api/config' | head -200

# Filter to tile-pattern-spec (initially empty)
curl 'http://localhost:5173/api/config?kind=tile-pattern-spec'

# Create a dummy spec row
curl -X POST 'http://localhost:5173/api/config' \
  -H 'Content-Type: application/json' \
  -d '{"name":"smoke-test","kind":"tile-pattern-spec","configJson":"{\"id\":\"smoke-test\",\"name\":\"smoke\",\"algorithm\":\"shield-tesselation\",\"builtIn\":false,\"unit\":{\"width\":42,\"height\":14,\"start\":[],\"middle\":[],\"end\":[]},\"adjustments\":{\"withinBand\":[],\"acrossBands\":[],\"partner\":{\"startEnd\":[],\"endEnd\":[]},\"skipRemove\":[]}}"}'

# List again — the smoke row should appear with configJson included
curl 'http://localhost:5173/api/config?kind=tile-pattern-spec'

# Delete the smoke row (use the id from the POST response)
curl -X DELETE 'http://localhost:5173/api/config/<smoke-id>'
```

Stop the dev server when done.

- [ ] **Step 3: Run type-check**

```bash
npm run check 2>&1 | tail -3
```

Looking for new errors related to `+server.ts` (pre-existing errors elsewhere are fine).

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/config/+server.ts
git commit -m "Add kind filter and configJson inclusion to /api/config"
git push
```

---

### Task 3: Variant store

**Files:**
- Create: `src/lib/stores/tilePatternSpecStore.ts`

The store hydrates from `/api/config?kind=tile-pattern-spec` on first access. It exposes a reactive list of specs and CRUD methods.

- [ ] **Step 1: Create the store file**

Create `src/lib/stores/tilePatternSpecStore.ts`:

```ts
import { writable, derived, get } from 'svelte/store';
import type { TiledPatternSpec } from '$lib/patterns/spec-types';

type StoredVariant = TiledPatternSpec & { rowId: number };

type StoreState = {
	hydrated: boolean;
	loading: boolean;
	variants: StoredVariant[];
	error: string | null;
};

const initialState: StoreState = {
	hydrated: false,
	loading: false,
	variants: [],
	error: null
};

const internal = writable<StoreState>(initialState);

const parseRow = (row: { id: number; name: string; configJson: string }): StoredVariant | null => {
	try {
		const spec = JSON.parse(row.configJson) as TiledPatternSpec;
		return { ...spec, rowId: row.id };
	} catch (e) {
		console.warn(`tilePatternSpecStore: failed to parse row ${row.id}`, e);
		return null;
	}
};

const hydrate = async (): Promise<void> => {
	const state = get(internal);
	if (state.hydrated || state.loading) return;
	internal.update((s) => ({ ...s, loading: true, error: null }));

	try {
		const res = await fetch('/api/config?kind=tile-pattern-spec');
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const rows = (await res.json()) as { id: number; name: string; configJson: string }[];
		const variants = rows.map(parseRow).filter((v): v is StoredVariant => v !== null);
		internal.set({ hydrated: true, loading: false, variants, error: null });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		internal.update((s) => ({ ...s, loading: false, error: msg }));
		console.warn('tilePatternSpecStore.hydrate failed', e);
	}
};

const create = async (spec: TiledPatternSpec): Promise<StoredVariant | null> => {
	const res = await fetch('/api/config', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: spec.name, kind: 'tile-pattern-spec', configJson: spec })
	});
	if (!res.ok) {
		console.warn('tilePatternSpecStore.create failed', await res.text());
		return null;
	}
	const { id } = (await res.json()) as { id: number };
	const variant: StoredVariant = { ...spec, rowId: id };
	internal.update((s) => ({ ...s, variants: [...s.variants, variant] }));
	return variant;
};

const update = async (rowId: number, spec: TiledPatternSpec): Promise<boolean> => {
	const res = await fetch(`/api/config/${rowId}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: spec.name, configJson: spec })
	});
	if (!res.ok) {
		console.warn('tilePatternSpecStore.update failed', await res.text());
		return false;
	}
	internal.update((s) => ({
		...s,
		variants: s.variants.map((v) => (v.rowId === rowId ? { ...spec, rowId } : v))
	}));
	return true;
};

const remove = async (rowId: number): Promise<boolean> => {
	const res = await fetch(`/api/config/${rowId}`, { method: 'DELETE' });
	if (!res.ok) {
		console.warn('tilePatternSpecStore.remove failed', await res.text());
		return false;
	}
	internal.update((s) => ({
		...s,
		variants: s.variants.filter((v) => v.rowId !== rowId)
	}));
	return true;
};

export const tilePatternSpecStore = {
	subscribe: derived(internal, (s) => s).subscribe,
	hydrate,
	create,
	update,
	remove
};
```

- [ ] **Step 2: Run type-check**

```bash
npm run check 2>&1 | tail -3
```

Looking for new errors. The `$lib/patterns/spec-types` import was created in Phase 1; it's available.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/tilePatternSpecStore.ts
git commit -m "Add tilePatternSpecStore for variant CRUD"
git push
```

---

### Task 4: Pattern registry

**Files:**
- Create: `src/lib/patterns/pattern-registry.ts`

The registry declares which algorithms support spec-driven editing and provides a factory that turns a spec into a `PatternGenerator` entry (the existing `patterns[type]` map shape).

- [ ] **Step 1: Create the registry file**

Create `src/lib/patterns/pattern-registry.ts`:

```ts
import type { Band, GridVariant, Quadrilateral } from '$lib/types';
import type { PatternGenerator } from '$lib/types';
import type { TiledPatternSpec } from './spec-types';
import {
	adjustShieldTesselation,
	defaultShieldSpec,
	generateShieldTesselationTile
} from './tesselation/shield';

export type PatternAlgorithm = {
	algorithmId: string;
	displayName: string;
	defaultSpec: TiledPatternSpec;
	supportsEditing: boolean;
	createPatternsEntry: (spec: TiledPatternSpec) => PatternGenerator;
};

const shieldAlgorithm: PatternAlgorithm = {
	algorithmId: 'shield-tesselation',
	displayName: 'Shield',
	defaultSpec: defaultShieldSpec,
	supportsEditing: true,
	createPatternsEntry: (spec) => ({
		getPattern: (
			rows: number,
			columns: number,
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			_quadBand: Quadrilateral[] | undefined = undefined,
			variant: GridVariant | undefined = 'rect',
			sideOrientation: Band['sideOrientation']
		) => generateShieldTesselationTile(spec, { size: 1, rows, columns, variant, sideOrientation }),
		tagAnchor: { facetIndex: 0, segmentIndex: 3 },
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		adjustAfterTiling: (bands: any, tiledPatternConfig: any, tubes: any) =>
			adjustShieldTesselation(bands, tiledPatternConfig, tubes, spec)
	})
};

export const algorithms: PatternAlgorithm[] = [shieldAlgorithm];

export const findAlgorithm = (algorithmId: string): PatternAlgorithm | undefined =>
	algorithms.find((a) => a.algorithmId === algorithmId);
```

- [ ] **Step 2: Run type-check**

```bash
npm run check 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/patterns/pattern-registry.ts
git commit -m "Add pattern-registry for editable tiled algorithms"
git push
```

---

### Task 5: Loosen TiledPattern type to string

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/shades-config.ts` (only if a switch on TiledPattern needs a default)

`TiledPattern` is currently a string-literal union of 9 values. With variants becoming first-class, `TiledPattern` widens to `string`.

- [ ] **Step 1: Update types.ts**

In `src/lib/types.ts`, find lines 538–548 (the `TiledPattern` definition):

```ts
export type TiledPattern =
	| 'tiledHexPattern-1'
	| 'tiledGridPattern-0'
	| 'tiledPanelPattern-0'
	| 'tiledBoxPattern-0'
	| 'tiledBowtiePattern-0'
	| 'tiledCarnationPattern-0'
	| 'tiledCarnationPattern-1'
	| 'tiledTriStarPattern-1'
	| 'tiledShieldTesselationPattern'
	| 'bandedBranchedPattern-0';
```

Replace with:

```ts
export type TiledPattern = string;
```

- [ ] **Step 2: Run type-check to find broken switches**

```bash
npm run check 2>&1 | grep -E "TiledPattern|Type 'string'" | head -20
```

Look for errors involving `TiledPattern` or string-narrowing failures. Fix each by adding a `default:` branch to the relevant switch, returning a sensible fallback (e.g., the shield default, or `undefined` if the call site handles it).

If the only references are in type aliases / config files (no runtime switches), no changes needed beyond Step 1.

- [ ] **Step 3: Run full test suite**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: 29 pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/shades-config.ts
git commit -m "Loosen TiledPattern to string for variant id support"
git push
```

(Add only files actually modified — drop `shades-config.ts` if it didn't change.)

---

### Task 6: Replace pattern-definitions shield entry with registry-driven construction

**Files:**
- Modify: `src/lib/patterns/pattern-definitions.ts`

The existing shield entry in `pattern-definitions.ts` hardcodes the spec wiring. Replace it with a call to the registry's factory so the same construction logic is used for variants in Task 7.

- [ ] **Step 1: Update pattern-definitions.ts**

In `src/lib/patterns/pattern-definitions.ts`, find the shield import block (currently around lines 24–28):

```ts
import {
	adjustShieldTesselation,
	defaultShieldSpec,
	generateShieldTesselationTile
} from './tesselation/shield';
```

Replace with:

```ts
import { algorithms } from './pattern-registry';
```

Find the `tiledShieldTesselationPattern` entry (currently around lines 116–140) and replace it with a call to the registry factory. Place this code at the top of the file, BEFORE the `patterns` object literal:

```ts
const builtInPatternsEntries: { [key: string]: PatternGenerator } = {};
for (const algorithm of algorithms) {
	builtInPatternsEntries[algorithm.defaultSpec.id] = algorithm.createPatternsEntry(algorithm.defaultSpec);
}
```

Then change the `patterns` object so it spreads `builtInPatternsEntries` and removes the now-redundant `tiledShieldTesselationPattern` entry:

```ts
export const patterns: { [key: string]: PatternGenerator } = {
	...builtInPatternsEntries,
	'tiledHexPattern-1': {
		// ...existing entry unchanged
	},
	// ...remaining existing entries unchanged, MINUS tiledShieldTesselationPattern
};
```

(The other 8 entries — hex, box, bowtie, carnation, tristar, grid, panel, bandedBranched — stay exactly as they are.)

- [ ] **Step 2: Verify by running snapshot test**

```bash
npm run test:unit -- src/lib/patterns/tesselation/shield/__tests__/snapshot.test.ts 2>&1 | tail -5
```

Expected: 16/16 pass. The shield output is identical because the registry's factory uses the same `generateShieldTesselationTile(defaultShieldSpec, ...)` call.

- [ ] **Step 3: Run type-check**

```bash
npm run check 2>&1 | tail -3
```

Expected: no new errors. The existing import of `BandCutPattern`, `TubeCutPattern`, `PathSegment`, etc. in `pattern-definitions.ts` may become unused after this change — remove unused imports.

- [ ] **Step 4: Run full test suite**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: 29/29 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/patterns/pattern-definitions.ts
git commit -m "Drive shield patterns entry from pattern-registry"
git push
```

---

### Task 7: Variant store registers loaded variants into patterns map

**Files:**
- Modify: `src/lib/stores/tilePatternSpecStore.ts`
- Modify: `src/lib/patterns/pattern-definitions.ts` (export the patterns map mutably)

When the variant store hydrates from the API, each loaded spec needs to be registered as an entry in the `patterns` map so dispatch (`patterns[variantId]`) works without any additional resolver logic.

- [ ] **Step 1: Make patterns map mutable**

The `patterns` export in `pattern-definitions.ts` is already a regular object; mutation works. No code change needed if the export is just `export const patterns = { ... }`. Skip to Step 2 unless the file uses some other declaration.

- [ ] **Step 2: Update tilePatternSpecStore to register variants**

Edit `src/lib/stores/tilePatternSpecStore.ts`. Add imports at the top:

```ts
import { algorithms, findAlgorithm } from '$lib/patterns/pattern-registry';
import { patterns } from '$lib/patterns/pattern-definitions';
import type { TiledPatternSpec } from '$lib/patterns/spec-types';
```

Add a helper after the `parseRow` function:

```ts
const registerVariant = (spec: TiledPatternSpec): void => {
	const algorithm = findAlgorithm(spec.algorithm);
	if (!algorithm) {
		console.warn(
			`tilePatternSpecStore: variant ${spec.id} references unknown algorithm '${spec.algorithm}'; skipping registration`
		);
		return;
	}
	patterns[spec.id] = algorithm.createPatternsEntry(spec);
};

const unregisterVariant = (variantId: string): void => {
	delete patterns[variantId];
};
```

Update `hydrate` to register each variant after parsing:

```ts
const hydrate = async (): Promise<void> => {
	const state = get(internal);
	if (state.hydrated || state.loading) return;
	internal.update((s) => ({ ...s, loading: true, error: null }));

	try {
		const res = await fetch('/api/config?kind=tile-pattern-spec');
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const rows = (await res.json()) as { id: number; name: string; configJson: string }[];
		const variants = rows.map(parseRow).filter((v): v is StoredVariant => v !== null);
		for (const v of variants) registerVariant(v);
		internal.set({ hydrated: true, loading: false, variants, error: null });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		internal.update((s) => ({ ...s, loading: false, error: msg }));
		console.warn('tilePatternSpecStore.hydrate failed', e);
	}
};
```

Update `create`, `update`, `remove` to keep registrations in sync:

```ts
const create = async (spec: TiledPatternSpec): Promise<StoredVariant | null> => {
	const res = await fetch('/api/config', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: spec.name, kind: 'tile-pattern-spec', configJson: spec })
	});
	if (!res.ok) {
		console.warn('tilePatternSpecStore.create failed', await res.text());
		return null;
	}
	const { id } = (await res.json()) as { id: number };
	const variant: StoredVariant = { ...spec, rowId: id };
	registerVariant(variant);
	internal.update((s) => ({ ...s, variants: [...s.variants, variant] }));
	return variant;
};

const update = async (rowId: number, spec: TiledPatternSpec): Promise<boolean> => {
	const res = await fetch(`/api/config/${rowId}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: spec.name, configJson: spec })
	});
	if (!res.ok) {
		console.warn('tilePatternSpecStore.update failed', await res.text());
		return false;
	}
	const updated: StoredVariant = { ...spec, rowId };
	registerVariant(updated);
	internal.update((s) => ({
		...s,
		variants: s.variants.map((v) => (v.rowId === rowId ? updated : v))
	}));
	return true;
};

const remove = async (rowId: number): Promise<boolean> => {
	const state = get(internal);
	const variant = state.variants.find((v) => v.rowId === rowId);

	const res = await fetch(`/api/config/${rowId}`, { method: 'DELETE' });
	if (!res.ok) {
		console.warn('tilePatternSpecStore.remove failed', await res.text());
		return false;
	}
	if (variant) unregisterVariant(variant.id);
	internal.update((s) => ({
		...s,
		variants: s.variants.filter((v) => v.rowId !== rowId)
	}));
	return true;
};
```

- [ ] **Step 3: Run type-check**

```bash
npm run check 2>&1 | tail -3
```

- [ ] **Step 4: Run full test suite**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: 29/29 pass. (No new tests; the registration is integration-tested manually in Step 5.)

- [ ] **Step 5: Manual smoke test the registration flow**

```bash
npm run dev
```

In another terminal:

```bash
# Create a variant via API
curl -X POST 'http://localhost:5173/api/config' \
  -H 'Content-Type: application/json' \
  -d '{"name":"smoke-shield","kind":"tile-pattern-spec","configJson":{"id":"smoke-shield-id","name":"Smoke Shield","algorithm":"shield-tesselation","builtIn":false,"unit":{"width":42,"height":14,"start":[],"middle":[],"end":[]},"adjustments":{"withinBand":[],"acrossBands":[],"partner":{"startEnd":[],"endEnd":[]},"skipRemove":[]}}}'
```

In the browser console, after the page loads, run:

```js
import('/src/lib/stores/tilePatternSpecStore.ts').then(m => m.tilePatternSpecStore.hydrate());
import('/src/lib/patterns/pattern-definitions.ts').then(m => console.log(Object.keys(m.patterns)));
```

Expected output: the `patterns` object's keys include `'smoke-shield-id'` after hydration.

Clean up the smoke row:

```bash
curl -X DELETE 'http://localhost:5173/api/config/<smoke-id>'
```

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stores/tilePatternSpecStore.ts
git commit -m "Register loaded variants into patterns map on hydrate"
git push
```

---

### Task 8: Hydrate variants on app init

**Files:**
- Modify: `src/routes/designer2/+page.svelte` (or whichever top-level route hosts the designer; check first)

The variant store needs to hydrate at app init so dispatched calls like `patterns[variantId]` find the variant before any pattern rendering kicks off.

- [ ] **Step 1: Find the right hydration point**

Grep for an existing app-init pattern:

```bash
grep -rn "onMount\|hydrate" src/routes/designer2/+page.svelte src/routes/+layout.svelte 2>/dev/null | head -10
```

If the designer route already has an `onMount`, hydrate the variant store there. Otherwise hydrate from a `+layout.svelte` so it runs once per session.

- [ ] **Step 2: Add hydration call**

In whichever file you chose, add:

```ts
import { tilePatternSpecStore } from '$lib/stores/tilePatternSpecStore';
import { onMount } from 'svelte';

onMount(() => {
	tilePatternSpecStore.hydrate();
});
```

(If the file already uses Svelte 5 runes, use `$effect` instead — `$effect(() => { tilePatternSpecStore.hydrate(); });`. Match the file's existing style.)

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```

Open the designer page in your browser. In the dev console, you should see no `tilePatternSpecStore.hydrate failed` warning. If you POST'd a variant in Task 7's smoke test (and didn't delete it), `Object.keys(m.patterns)` should include the variant id.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add <the file you modified>
git commit -m "Hydrate tilePatternSpecStore on app init"
git push
```

---

### Task 9: Fallback at dispatch sites (missing variant id → default)

**Files:**
- Create: `src/lib/patterns/resolve-pattern.ts`
- Modify: `src/lib/cut-pattern/generate-tiled-pattern.ts` (lines 114, 169)
- Modify: `src/lib/cut-pattern/generate-pattern.ts` (line 142)
- Modify: `src/components/pattern-editor/PatternEditor.svelte` (line 254)

If a saved project references a variant id that no longer exists (e.g., the variant was deleted), `patterns[type]` is `undefined` and the destructure `const { getPattern } = patterns[type]` throws. The fallback returns the first registered algorithm's default entry and logs a warning.

- [ ] **Step 1: Create the resolver helper**

Create `src/lib/patterns/resolve-pattern.ts`:

```ts
import type { PatternGenerator } from '$lib/types';
import { algorithms } from './pattern-registry';
import { patterns } from './pattern-definitions';

const warned = new Set<string>();

/**
 * Look up a pattern entry by variant id. Falls back to the first registered algorithm's
 * default and warns once per missing id. Use this at every dispatch site that previously
 * did `patterns[type]` directly.
 */
export const resolvePatternEntry = (variantId: string): PatternGenerator => {
	const entry = patterns[variantId];
	if (entry) return entry;

	if (!warned.has(variantId)) {
		warned.add(variantId);
		console.warn(
			`resolvePatternEntry: no pattern registered for '${variantId}'; falling back to default '${algorithms[0].defaultSpec.id}'`
		);
	}
	const fallbackEntry = patterns[algorithms[0].defaultSpec.id];
	if (!fallbackEntry) {
		throw new Error(
			`resolvePatternEntry: fallback default '${algorithms[0].defaultSpec.id}' is also missing from patterns map`
		);
	}
	return fallbackEntry;
};
```

- [ ] **Step 2: Update generate-tiled-pattern.ts dispatch sites**

In `src/lib/cut-pattern/generate-tiled-pattern.ts`, find line 114:

```ts
const { adjustAfterTiling } = patterns[tiledPatternConfig.type];
```

Replace with:

```ts
const { adjustAfterTiling } = resolvePatternEntry(tiledPatternConfig.type);
```

Find line 169:

```ts
const { getPattern, tagAnchor, adjustAfterMapping } = patterns[tiledPatternConfig.type];
```

Replace with:

```ts
const { getPattern, tagAnchor, adjustAfterMapping } = resolvePatternEntry(tiledPatternConfig.type);
```

Add the import near the top of the file:

```ts
import { resolvePatternEntry } from '$lib/patterns/resolve-pattern';
```

- [ ] **Step 3: Update generate-pattern.ts dispatch site**

In `src/lib/cut-pattern/generate-pattern.ts`, find line 142:

```ts
const { adjustAfterTiling } = patterns[tiledPatternConfig.type];
```

Replace with:

```ts
const { adjustAfterTiling } = resolvePatternEntry(tiledPatternConfig.type);
```

Add the import near the top of the file:

```ts
import { resolvePatternEntry } from '$lib/patterns/resolve-pattern';
```

- [ ] **Step 4: Update PatternEditor.svelte dispatch site**

In `src/components/pattern-editor/PatternEditor.svelte`, find line 254:

```ts
let { adjustAfterTiling } = patterns[tiledPatternConfig.type];
```

Replace with:

```ts
let { adjustAfterTiling } = resolvePatternEntry(tiledPatternConfig.type);
```

Add the import near the top of the file:

```ts
import { resolvePatternEntry } from '$lib/patterns/resolve-pattern';
```

- [ ] **Step 5: Run snapshot test**

```bash
npm run test:unit -- src/lib/patterns/tesselation/shield/__tests__/snapshot.test.ts 2>&1 | tail -5
```

Expected: 16/16 pass. The resolver returns the same entry for known variant ids; output is unchanged.

- [ ] **Step 6: Run full test suite**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: 29/29 pass.

- [ ] **Step 7: Manual smoke for fallback**

```bash
npm run dev
```

In the browser console:

```js
const { resolvePatternEntry } = await import('/src/lib/patterns/resolve-pattern.ts');
const fallback = resolvePatternEntry('definitely-not-a-real-id');
console.log('fallback entry exists:', !!fallback);
// Expect: console warning printed once + truthy result
```

Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add src/lib/patterns/resolve-pattern.ts \
        src/lib/cut-pattern/generate-tiled-pattern.ts \
        src/lib/cut-pattern/generate-pattern.ts \
        src/components/pattern-editor/PatternEditor.svelte
git commit -m "Add resolvePatternEntry fallback for missing variant ids"
git push
```

---

### Task 10: TilingControl picker iterates registry

**Files:**
- Modify: `src/components/controls/TilingControl.svelte`

The picker currently iterates over the static `tiledPatternConfigs` dict in `shades-config.ts`. After Phase 2 it iterates over `algorithms` from the registry plus user variants from the store. Visually unchanged for the user (no variants yet → only built-in defaults render).

- [ ] **Step 1: Read the relevant region**

```bash
sed -n '50,60p;150,155p' src/components/controls/TilingControl.svelte
```

You should see the `getTiles` helper and the `{#each getTiles(tiledPatternConfigs) as config}` loop.

- [ ] **Step 2: Update imports**

Find the existing imports near the top of `TilingControl.svelte`. Add:

```ts
import { algorithms } from '$lib/patterns/pattern-registry';
import { tilePatternSpecStore } from '$lib/stores/tilePatternSpecStore';
```

- [ ] **Step 3: Replace getTiles with a registry-driven version**

Replace the `getTiles` function (around line 51) with:

```ts
$: variantList = $tilePatternSpecStore.variants;

const getTiles = (
	configs: { [key: string]: TiledPatternConfig },
	variants: TiledPatternSpec[]
): { type: string; tiling: TilingBasis }[] => {
	const builtInIds = new Set(algorithms.map((a) => a.defaultSpec.id));
	const builtInTiles = algorithms.map((a) => ({ type: a.defaultSpec.id, tiling: 'quadrilateral' as const }));
	const variantTiles = variants
		.filter((v) => !builtInIds.has(v.id))
		.map((v) => ({ type: v.id, tiling: 'quadrilateral' as const }));
	const legacyTiles = ['quadrilateral', 'triangle', 'band']
		.flatMap((tilingBasis) =>
			Object.values(configs).filter((c) => c.tiling === tilingBasis && !builtInIds.has(c.type))
		)
		.map((c) => ({ type: c.type, tiling: c.tiling }));
	return [...legacyTiles, ...builtInTiles, ...variantTiles];
};
```

Add the type import for `TiledPatternSpec` to the existing type imports:

```ts
import type { GridVariant, TiledPatternConfig, TabShape, TabEdgeOption, TilingBasis } from '$lib/types';
import type { TiledPatternSpec } from '$lib/patterns/spec-types';
```

- [ ] **Step 4: Update the loop**

Find the each block (around line 151):

```svelte
{#each getTiles(tiledPatternConfigs) as config}
	<PatternTileButton size={45} patternType={config.type} tilingBasis={config.tiling} />
{/each}
```

Replace with:

```svelte
{#each getTiles(tiledPatternConfigs, variantList) as tile}
	<PatternTileButton size={45} patternType={tile.type} tilingBasis={tile.tiling} />
{/each}
```

- [ ] **Step 5: Manual smoke test**

```bash
npm run dev
```

Open the designer; switch to the tiled pattern picker. Confirm:
- Same set of pattern tiles appears as before (8 legacy patterns + 1 shield default = 9 total).
- Clicking the shield tile selects it and the rendering still works.

If you have a smoke variant from Task 7's API test still in the DB, it should appear as an additional tile. Remove it via API after testing.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/controls/TilingControl.svelte
git commit -m "Drive TilingControl picker from registry + variant store"
git push
```

---

### Task 11: PatternTileButton handles variant ids that aren't in shades-config

**Files:**
- Modify: `src/components/pattern/PatternTileButton.svelte`

Currently `PatternTileButton.svelte` looks up `tiledPatternConfigs[patternType]` to set the active config when clicked. For variant ids that aren't in the static dict, this would fail. We need to construct a config on the fly.

- [ ] **Step 1: Read the current file**

```bash
cat src/components/pattern/PatternTileButton.svelte
```

The current onclick body is:

```ts
if (patterns[patternType]) {
	$patternConfigStore.patternTypeConfig = tiledPatternConfigs[patternType];
}
```

For variants, `patterns[patternType]` exists (registered via the store) but `tiledPatternConfigs[patternType]` is undefined. We construct a fallback config from a known template.

- [ ] **Step 2: Update the onclick**

Edit `src/components/pattern/PatternTileButton.svelte`:

Replace the import block:

```ts
import { patternConfigStore } from '$lib/stores';
import PatternTile from './PatternTile.svelte';
import { tiledPatternConfigs } from '$lib/shades-config';
import { patterns } from '$lib/patterns';
import type { TilingBasis } from '$lib/types';
```

with:

```ts
import { patternConfigStore } from '$lib/stores';
import PatternTile from './PatternTile.svelte';
import { tiledPatternConfigs } from '$lib/shades-config';
import { patterns } from '$lib/patterns';
import type { TilingBasis, TiledPatternConfig } from '$lib/types';
```

Replace the `<button onclick=...>` body:

```svelte
<button
	onclick={() => {
		if (!patterns[patternType]) return;
		const baseConfig = tiledPatternConfigs[patternType];
		if (baseConfig) {
			$patternConfigStore.patternTypeConfig = baseConfig;
			return;
		}
		// Variant id without a static config — use shield's default config shape, swap in the variant id.
		const fallback: TiledPatternConfig = {
			...tiledPatternConfigs['tiledShieldTesselationPattern'],
			type: patternType
		};
		$patternConfigStore.patternTypeConfig = fallback;
	}}
>
```

- [ ] **Step 3: Run type-check**

```bash
npm run check 2>&1 | tail -3
```

- [ ] **Step 4: Manual smoke**

If you have a smoke variant in the DB, click its tile in the picker and confirm:
- The pattern config switches to it (no errors in console).
- The 3D render uses the variant's spec data (for an empty smoke spec, the rendered pattern will be empty — that's expected).

- [ ] **Step 5: Commit**

```bash
git add src/components/pattern/PatternTileButton.svelte
git commit -m "PatternTileButton handles variant ids without a static config"
git push
```

---

### Task 12: End-to-end verification

- [ ] **Step 1: Run full test suite**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: 29/29 pass.

- [ ] **Step 2: Run type-check**

```bash
npm run check 2>&1 | tail -3
```

Expected: no significant new error count vs baseline (~427).

- [ ] **Step 3: Manual end-to-end smoke**

```bash
npm run dev
```

In the browser:
- Open `/designer2`
- Default shield pattern renders correctly
- Switch between several patterns in the picker; each renders correctly
- No console errors related to patterns map / variants

Then via API:
- Create a tile-pattern-spec variant (shield algorithm, valid spec)
- Refresh page
- The new variant appears as a tile in the picker
- Selecting it works (uses the variant's spec data for rendering)
- Delete the variant via API
- Refresh page
- Variant tile is gone

Stop dev server.

- [ ] **Step 4: Update plan checkboxes**

Edit `docs/superpowers/plans/2026-05-02-tiled-pattern-editor-phase-2.md` and mark Task 12's three steps `[x]`. Note: Step 3 manual smoke test is the only one a human needs to drive — mark `[x]` only after performing it; otherwise note as deferred.

- [ ] **Step 5: Commit + push**

```bash
git add docs/superpowers/plans/2026-05-02-tiled-pattern-editor-phase-2.md
git commit -m "Mark Phase 2 verification complete"
git push
```

---

## What's NOT in Phase 2 (deferred to Phase 3+)

- Editor UI (Phase 3): SegmentPathEditor, TileEditor floater, Unit mode editing.
- Adjustment-rule editing UX (Phase 4): multi-mode viewport, ghost units, drag-line interaction.
- Pattern picker grouping by algorithm (visual hierarchy in TilingControl) — current Phase 2 picker is flat; grouping is a Phase 4 concern when there are many variants.
- Hex/carnation/box/etc. forks (each future phase fork): the registry only has shield in v1.
- Validation of variant specs (structural integrity checks, segment count rules, etc.).
- Conflict resolution if the variant id matches a built-in id (currently last-write-wins via the `patterns` map; consider id collision check in Phase 3+).

## Risk register

| Risk | Mitigation |
|---|---|
| Migration adds `kind` column with default `'project'`; if production DB has rows that should be other kinds, they get mislabeled | Phase 2 is the first introduction of `kind`; all existing rows ARE projects. Future kinds register with their own discriminators. |
| `TiledPattern = string` widens the type; any code that did `switch (type) { case 'tiledHexPattern-1': ... }` needs a `default` branch | Task 5 Step 2 surfaces these via type-check; fix each by adding a `default` branch. |
| Race: pattern dispatch runs before variant store hydrates → `patterns[variantId]` is undefined | Task 8 hydrates on app init; pattern rendering happens after onMount. Worst case: first render uses default; subsequent re-render after hydration uses variant. |
| `pattern-definitions.ts` and `pattern-registry.ts` both touch the patterns map; circular import risk | Registry imports from `tesselation/shield` only; pattern-definitions imports from registry. No circular. |
| `shadesConfigs.kind` column added without an index — list filtering scans full table | Acceptable for single-user dataset; if performance matters, add index in a follow-up migration. |
