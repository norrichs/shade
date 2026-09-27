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
