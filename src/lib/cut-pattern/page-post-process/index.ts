import type { PageRect } from '../page-layout/types';
import type { PostProcessConfig } from '../hole-drop-config';
import type { PagePostProcessResult, PlacedBand } from '../post-process-types';
import { computeDisconnects } from './disconnect';
import { buildPageLabels, type GlyphDict } from './page-label';

/** Stage 3: everything that depends on final page placement. Pure. */
export const pagePostProcess = (input: {
	bands: PlacedBand[];
	pages: PageRect[];
	pageScale: number;
	marginPx: number;
	gap: number;
	config: PostProcessConfig;
	configName: string | undefined;
	dict: GlyphDict | undefined;
}): PagePostProcessResult => {
	const { bands, pages, pageScale, marginPx, gap, config, configName, dict } = input;
	const disconnects = config.disconnectSurround ? computeDisconnects(bands, pages, gap) : [];
	const pageLabels = dict
		? buildPageLabels({ pages, marginPx, pageScale, bands, disconnects, config: config.pageLabel, configName, dict })
		: [];
	return { disconnects, pageLabels };
};
