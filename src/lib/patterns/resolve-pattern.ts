import type { PatternGenerator } from '$lib/types';
import { algorithms } from './pattern-registry';
import { patterns } from './pattern-definitions';

const warned = new Set<string>();

export const resolvePatternEntry = (variantId: string): PatternGenerator => {
	const entry = patterns[variantId];
	if (entry) return entry;

	const fallbackId = algorithms[0]?.defaultSpec.id ?? '<none>';
	if (!warned.has(variantId)) {
		warned.add(variantId);
		console.warn(
			`resolvePatternEntry: no pattern registered for '${variantId}'; falling back to default '${fallbackId}'`
		);
	}
	const fallbackEntry = patterns[fallbackId];
	if (!fallbackEntry) {
		throw new Error(
			`resolvePatternEntry: fallback default '${fallbackId}' is also missing from patterns map`
		);
	}
	return fallbackEntry;
};
