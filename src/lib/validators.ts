import type { CutoutConfig } from './cut-pattern/generate-cut-pattern';
import type {
	GlobulePatternConfig,
	OutlinedPatternConfig,
	PatternLabelsConfig,
	ProceduralFillConfig,
	TiledPatternConfig
} from './types';
import { GEOMETRY_TYPES } from '$lib/cut-pattern/post-process-types';
import { isLayerId } from '$lib/lightburn/layers';
import { DEFAULT_CONNECT_GAP_MM } from '$lib/cut-pattern/hole-drop-config';

export type Validity = {
	isValid: boolean;
	messages: string[];
};

/**
 * Migrate a legacy-shape pattern `labels` to the current shape.
 *
 * Legacy shape: `{ scale: number; angle: number }`
 * Current shape: `{ onTab?: { enabled, padding, color? }; selfTag?: { enabled, height, angle, padding?, stemLength?, stemWidth? } }`
 *
 * NOTE: the legacy `scale` value is dropped — the new pipeline sizes the label by an
 * explicit pixel `height` rather than scaling the whole path, so the prior value has
 * no equivalent. Migrated configs land on the default height/padding.
 *
 * Applies to both `TiledPatternConfig.labels` and `OutlinedPatternConfig.labels`.
 *
 * Returns a new labels object if migration was needed; otherwise returns the input unchanged.
 * Configs that lack `selfTag` are left untouched — the renderer handles `undefined` gracefully.
 */
const migratePatternLabels = (labels: unknown): PatternLabelsConfig | undefined => {
	if (!labels || typeof labels !== 'object') return undefined;
	const obj = labels as Record<string, unknown>;
	// Already new shape: has onTab or selfTag keys
	if ('onTab' in obj || 'selfTag' in obj) {
		return obj as PatternLabelsConfig;
	}
	// Legacy shape: flat scale/angle — retarget at selfTag (the new self-only callout).
	// `scale` is intentionally discarded: the new selfTag uses a pixel `height` and
	// `padding` rather than scaling the whole path, so the old value has no mapping.
	if (typeof obj.scale === 'number' && typeof obj.angle === 'number') {
		return {
			onTab: { enabled: false, padding: 1 },
			selfTag: {
				enabled: true,
				height: 14,
				angle: obj.angle,
				padding: 10,
				stemLength: 20,
				stemWidth: 4
			}
		};
	}
	return obj as PatternLabelsConfig;
};

/**
 * Normalize a persisted `GlobulePatternConfig` at the load boundary, migrating
 * any legacy shapes to the current types. Mutates and returns the input.
 */
export const migrateGlobulePatternConfig = <T extends Partial<GlobulePatternConfig>>(
	config: T
): T => {
	if (!config || typeof config !== 'object') return config;
	const patternTypeConfig = config.patternTypeConfig as
		| ((TiledPatternConfig | OutlinedPatternConfig) & { labels?: unknown })
		| undefined;
	if (patternTypeConfig && patternTypeConfig.labels) {
		const migrated = migratePatternLabels(patternTypeConfig.labels);
		if (migrated) {
			patternTypeConfig.labels = migrated;
		}
	}
	const pvc = config.patternViewConfig as
		| { lineWrap?: boolean; patternLayoutMode?: string }
		| undefined;
	if (pvc && pvc.patternLayoutMode === undefined) {
		pvc.patternLayoutMode = pvc.lineWrap ? 'line-wrap' : 'linear';
	}
	const pc = config.patternConfig as { pageLayout?: Record<string, unknown> } | undefined;
	if (pc && pc.pageLayout === undefined) {
		pc.pageLayout = {
			pageSize: { width: 304.8, height: 304.8 },
			pageScale: 0.6562,
			margin: 12.7,
			gap: 20,
			displayUnit: 'inch',
			algorithm: 'flex-wrap',
			reorderWindow: 8,
			allowRotation: false,
			keepConnected: 0
		};
	} else if (pc && pc.pageLayout) {
		const pl = pc.pageLayout;
		if (pl.reorderWindow === undefined) pl.reorderWindow = 8;
		if (pl.allowRotation === undefined) pl.allowRotation = false;
		if (pl.algorithm === undefined) pl.algorithm = 'flex-wrap';
		if (pl.keepConnected === undefined) pl.keepConnected = 0;
	}

	// Hole-drop post-processing. Absent decodes to "drop nothing", so this
	// backfill is for the editor panel's convenience rather than correctness —
	// but a malformed block would reach the cut file, so it is repaired here.
	const ppHost = config.patternConfig as { postProcess?: Record<string, unknown> } | undefined;
	if (ppHost) {
		const pp = ppHost.postProcess;
		if (!pp || typeof pp !== 'object') {
			ppHost.postProcess = { dropHoles: { mode: 'none' }, runSeed: 0 };
		} else {
			if (typeof pp.runSeed !== 'number' || !Number.isFinite(pp.runSeed)) pp.runSeed = 0;
			// Optional flags: absent means false, so only a malformed value is removed.
			for (const flag of ['dropOutline', 'dropLabelText', 'disconnectSurround'] as const) {
				if (flag in pp && typeof pp[flag] !== 'boolean') delete pp[flag];
			}
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
			const drop = pp.dropHoles as { mode?: string; chance?: number } | undefined;
			const mode = drop?.mode;
			if (
				!drop ||
				(mode !== 'none' && mode !== 'all' && mode !== 'random' && mode !== 'variable')
			) {
				pp.dropHoles = { mode: 'none' };
			} else if (mode === 'random') {
				const chance = typeof drop.chance === 'number' ? drop.chance : 0;
				drop.chance = chance < 0 ? 0 : chance > 1 ? 1 : chance;
			}
		}
	}
	return config;
};

export const validateCutoutConfig = (config: CutoutConfig): Validity => {
	const validity: Validity = { isValid: true, messages: [] };
	if (
		['each-facet', 'alternating-facet'].includes(config.tilePattern.type) &&
		config.holeConfigs.flat().some((hole) => hole.type === 'HoleConfigSquare')
	) {
		validity.isValid = false;
		validity.messages.push('hole pattern tiling is triangular, but some hole configs are square');
	}
	if (
		config.tilePattern.type === 'each-rectangle' &&
		config.holeConfigs.flat().some((hole) => hole.type === 'HoleConfigTriangle')
	) {
		validity.isValid = false;
		validity.messages.push(
			'hole pattern tiling is rectangular, but some hole configs are triangular'
		);
	}

	if (!validity.isValid) {
		validity.messages.forEach((message) => console.error(message));
	}

	return validity;
};

/**
 * Validate a procedural fill config.
 *
 * A bad combination does not throw — the packer degrades to producing nothing —
 * but it silently yields an empty band, so surface the reason instead.
 */
export const validateProceduralFillConfig = (config: ProceduralFillConfig): Validity => {
	const validity: Validity = { isValid: true, messages: [] };
	const fail = (message: string) => {
		validity.isValid = false;
		validity.messages.push(message);
	};

	if (!(config.density > 0)) fail('density must be greater than 0');
	if (!(config.minRadius > 0)) fail('minRadius must be greater than 0');
	if (!(config.maxRadius > 0)) fail('maxRadius must be greater than 0');
	if (config.minRadius > config.maxRadius) fail('minRadius must not exceed maxRadius');
	if (config.margin < 0) fail('margin must not be negative');
	if (config.spacing < 0) fail('spacing must not be negative');

	return validity;
};
