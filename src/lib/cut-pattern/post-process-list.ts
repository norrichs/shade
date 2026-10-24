/**
 * Several post-process configs, each producing its own group of pages.
 *
 * Stored as `patternConfig.postProcess` (the first) plus
 * `patternConfig.additionalPostProcesses` (the rest), so every config saved
 * before this existed already decodes to a one-entry list.
 *
 * The layer map and download format describe the export, not a group, so they
 * live on the first entry only. Every write goes through `splitPostProcessList`,
 * which re-homes them there whatever the list operation did.
 */
import { DEFAULT_POST_PROCESS, type PostProcessConfig } from './hole-drop-config';
import type { PageRect } from './page-layout/types';

type PostProcessHost = {
	postProcess?: PostProcessConfig;
	additionalPostProcesses?: PostProcessConfig[];
};

/** The export-wide fields, kept on the first entry only. */
const GLOBAL_KEYS = ['layerMap', 'downloadFormat'] as const;
type GlobalFields = Pick<PostProcessConfig, (typeof GLOBAL_KEYS)[number]>;

const withoutGlobals = (config: PostProcessConfig): PostProcessConfig => {
	const out = { ...config };
	for (const key of GLOBAL_KEYS) delete out[key];
	return out;
};

export const postProcessList = (host: PostProcessHost | undefined): PostProcessConfig[] => [
	host?.postProcess ?? DEFAULT_POST_PROCESS,
	...(host?.additionalPostProcesses ?? [])
];

/**
 * The stored form of `list`. `globals` is the first entry as it was BEFORE the
 * list operation: a move or delete can change which config is first, and the
 * export settings must not travel with it.
 */
export const splitPostProcessList = (
	list: PostProcessConfig[],
	globals: GlobalFields
): Required<PostProcessHost> => {
	const [first = DEFAULT_POST_PROCESS, ...rest] = list;
	const kept = Object.fromEntries(
		GLOBAL_KEYS.filter((key) => globals[key] !== undefined).map((key) => [key, globals[key]])
	);
	return {
		postProcess: { ...withoutGlobals(first), ...kept },
		additionalPostProcesses: rest.map(withoutGlobals)
	};
};

/** Insert a copy of `list[index]` right after it, unnamed so its label stays positional. */
export const addPostProcess = (list: PostProcessConfig[], index: number): PostProcessConfig[] => {
	const source = list[index];
	if (!source) return list;
	const copy = structuredClone(source);
	delete copy.name;
	return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)];
};

/** Remove `list[index]`; the last remaining config can't be deleted. */
export const deletePostProcess = (
	list: PostProcessConfig[],
	index: number
): PostProcessConfig[] => {
	if (list.length <= 1 || !list[index]) return list;
	return list.filter((_, i) => i !== index);
};

/** Swap with the neighbour in direction `dir`; no-op at the ends. */
export const movePostProcess = (
	list: PostProcessConfig[],
	index: number,
	dir: -1 | 1
): PostProcessConfig[] => {
	const target = index + dir;
	if (!list[index] || target < 0 || target >= list.length) return list;
	const out = [...list];
	[out[index], out[target]] = [out[target], out[index]];
	return out;
};

/** Space between page groups, as a fraction of the tallest page. */
const GROUP_GAP = 0.25;

/**
 * Stack `count` copies of one page layout vertically, one per post-process
 * config. Every group shares the layout, so group `k` is the first group moved
 * down by `k * stride`. `pages` is every group's page rects in order, which is
 * what the exporters frame and split by.
 */
export const stackPageGroups = (
	pages: PageRect[],
	count: number
): { stride: number; pages: PageRect[] } => {
	if (pages.length === 0) return { stride: 0, pages: [] };
	const top = Math.min(...pages.map((p) => p.y));
	const bottom = Math.max(...pages.map((p) => p.y + p.height));
	const tallest = Math.max(...pages.map((p) => p.height));
	const stride = bottom - top + tallest * GROUP_GAP;
	return {
		stride,
		pages: Array.from({ length: Math.max(1, count) }, (_, k) =>
			pages.map((p) => ({ ...p, y: p.y + k * stride }))
		).flat()
	};
};

export const postProcessLabel = (config: PostProcessConfig | undefined, index: number): string =>
	config?.name?.trim() || `PP${index + 1}`;
