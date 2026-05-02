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
