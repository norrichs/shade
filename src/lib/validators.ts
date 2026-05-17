import type { CutoutConfig } from './cut-pattern/generate-cut-pattern';
import type {
	GlobulePatternConfig,
	OutlinedPatternConfig,
	PatternLabelsConfig,
	TiledPatternConfig
} from './types';

export type Validity = {
	isValid: boolean;
	messages: string[];
};

/**
 * Migrate a legacy-shape pattern `labels` to the current shape.
 *
 * Legacy shape: `{ scale: number; angle: number }`
 * Current shape: `{ onTab?: { enabled, padding, color? }; selfTag?: { enabled, height, angle, padding? } }`
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
			onTab: { enabled: false, padding: 0.1 },
			selfTag: { enabled: true, height: 14, angle: obj.angle, padding: 10 }
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
