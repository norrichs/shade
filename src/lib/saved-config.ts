import type { SuperGlobuleConfig, GlobulePatternConfig } from '$lib/types';
import type { ViewControls } from '$lib/stores/viewControlStore';
import type { TiledPatternSpec } from '$lib/patterns/spec-types';
import { normalizeVoronoiConfig } from '$lib/voronoi/migrate-voronoi-config';
import { migrateGlobulePatternConfig } from '$lib/validators';

/**
 * Versioned envelope persisted as a saved config's `configJson`.
 *
 * v1 (legacy): the stored JSON was a bare `SuperGlobuleConfig` (no envelope).
 * v2: this envelope, bundling the geometry config together with the pattern
 *     config and the view-control toggles so loading restores the full scene.
 * v3: additionally embeds any custom tile-pattern specs the pattern config
 *     references. Those specs otherwise live in a separate DB table and are
 *     referenced by id only (`patternTypeConfig.type`), so a v2 config that used
 *     a custom pattern would silently fall back to the default if loaded where
 *     the spec was absent. Embedding makes a saved config self-contained.
 *
 * `parseSavedConfig` reads all shapes; `buildSavedConfig` always writes v3.
 */
export const SAVED_CONFIG_VERSION = 3;

export type SavedConfigEnvelope = {
	type: 'SavedConfig';
	version: number;
	superGlobuleConfig: SuperGlobuleConfig;
	globulePatternConfig: GlobulePatternConfig;
	viewControls: ViewControls;
	/** Custom tile-pattern specs referenced by the pattern config (v3+). */
	tilePatternSpecs: TiledPatternSpec[];
};

export type ParsedSavedConfig = {
	superGlobuleConfig: SuperGlobuleConfig;
	/** Absent only for legacy (v1) rows that predate bundling. */
	globulePatternConfig?: GlobulePatternConfig;
	/** Absent only for legacy (v1) rows that predate bundling. */
	viewControls?: ViewControls;
	/** Embedded custom specs to re-register on load; `[]` for v1/v2 rows. */
	tilePatternSpecs: TiledPatternSpec[];
};

/**
 * The custom tile-pattern specs from `available` that `cfg` actually references.
 * The reference point is `patternTypeConfig.type` (a variant id that resolves
 * via the `patterns` registry). Built-in specs are excluded — they always exist
 * in `pattern-definitions.ts`, so only custom specs need embedding.
 */
export const collectReferencedTilePatternSpecs = (
	cfg: GlobulePatternConfig,
	available: TiledPatternSpec[]
): TiledPatternSpec[] => {
	const referenced = new Set<string>();
	const ptc = cfg.patternTypeConfig;
	// OutlinedPatternConfig uses the literal 'outlined'; any other `type` is a
	// tiled-pattern variant id.
	if (ptc && ptc.type !== 'outlined') referenced.add(ptc.type);

	const seen = new Set<string>();
	const out: TiledPatternSpec[] = [];
	for (const spec of available) {
		if (spec.builtIn) continue;
		if (!referenced.has(spec.id) || seen.has(spec.id)) continue;
		seen.add(spec.id);
		// Strip any non-spec fields (e.g. `rowId` on stored variants).
		const { id, name, algorithm, builtIn, unit, adjustments } = spec;
		out.push({ id, name, algorithm, builtIn, unit, adjustments });
	}
	return out;
};

/** Build the v3 envelope to serialize into `configJson`. */
export const buildSavedConfig = (
	superGlobuleConfig: SuperGlobuleConfig,
	globulePatternConfig: GlobulePatternConfig,
	viewControls: ViewControls,
	tilePatternSpecs: TiledPatternSpec[] = []
): SavedConfigEnvelope => ({
	type: 'SavedConfig',
	version: SAVED_CONFIG_VERSION,
	superGlobuleConfig,
	globulePatternConfig,
	viewControls,
	tilePatternSpecs
});

/**
 * Parse stored `configJson` into the configs to apply, normalizing/migrating at
 * the load boundary exactly as the store bootstraps do. Supports the v3 and v2
 * envelopes and legacy v1 rows (a bare `SuperGlobuleConfig`), in which case the
 * pattern config and view controls are left untouched (undefined). Embedded
 * tile-pattern specs default to `[]` for pre-v3 rows.
 */
export const parseSavedConfig = (raw: string): ParsedSavedConfig => {
	const parsed = JSON.parse(raw);

	// Legacy v1: the row itself is a SuperGlobuleConfig.
	if (parsed?.type === 'SuperGlobuleConfig') {
		return {
			superGlobuleConfig: normalizeVoronoiConfig(parsed as SuperGlobuleConfig),
			tilePatternSpecs: []
		};
	}

	// v2 / v3 envelope.
	const envelope = parsed as SavedConfigEnvelope;
	return {
		superGlobuleConfig: normalizeVoronoiConfig(envelope.superGlobuleConfig),
		globulePatternConfig: envelope.globulePatternConfig
			? migrateGlobulePatternConfig(envelope.globulePatternConfig)
			: undefined,
		viewControls: envelope.viewControls,
		tilePatternSpecs: envelope.tilePatternSpecs ?? []
	};
};
