/**
 * User-placed two-point measurements on the 3D model.
 *
 * Points are snapped to model vertices, and vertex identity is not stable
 * across a geometry regeneration — so these must be cleared whenever the
 * geometry changes. This module is deliberately dependency-free (see the note
 * at the bottom of the file for why) — the geometry-clearing subscription
 * lives elsewhere, wired to `clearMeasurements()`. They deliberately survive
 * pattern and pattern-layout parameter changes, and are not persisted: they
 * do not survive a reload.
 */
import { derived, writable, type Readable } from 'svelte/store';
import type { Vector3 } from 'three';

export type Measurement = {
	id: string;
	a: Vector3;
	/** null while this point is still waiting for its partner (rendered magenta). */
	b: Vector3 | null;
};

const store = writable<Measurement[]>([]);

export const measurements: Readable<Measurement[]> = derived(store, ($m) => $m);

let nextId = 0;
const makeId = () => `measurement-${nextId++}`;

/**
 * Place a point. The first click opens a measurement; the next click closes it.
 * There is at most one open measurement and it is always last.
 */
export const addMeasurementPoint = (point: Vector3): void => {
	store.update((list) => {
		const open = list[list.length - 1];
		if (open && open.b === null) {
			return [...list.slice(0, -1), { ...open, b: point }];
		}
		return [...list, { id: makeId(), a: point, b: null }];
	});
};

export const removeMeasurement = (id: string): void =>
	store.update((list) => list.filter((m) => m.id !== id));

export const clearMeasurements = (): void => store.set([]);

/*
 * Geometry-change subscription note:
 *
 * The natural place to wire "clear measurements when geometry regenerates"
 * would be a module-scope `superGlobuleStore.subscribe(...)` right here.
 * That was attempted and reverted: `superGlobuleStores.ts` transitively
 * imports `$lib/projection-geometry/meta-info.ts`, which imports the
 * `./index` stores barrel, which re-exports `selectionStores.ts` — and once
 * `measurementStore` is also added to that same barrel (as this task does),
 * importing `superGlobuleStore` here closes a cycle:
 *
 *   measurementStore -> superGlobuleStores -> meta-info -> stores/index
 *     -> selectionStores -> (back to superGlobuleStores' exports)
 *
 * In practice this surfaced as `derived() expects stores as input, got a
 * falsy value` thrown from `selectionStores.ts` while running this module's
 * own tests — a store read as `undefined` mid-cycle at import time.
 *
 * So this module stays dependency-free. The subscription that calls
 * `clearMeasurements()` on geometry regeneration must instead live in
 * `Scene.svelte` (or another component already downstream of both stores),
 * e.g. as an `$effect` keyed on `$superGlobuleStore` that skips its first run.
 */
