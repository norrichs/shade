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
