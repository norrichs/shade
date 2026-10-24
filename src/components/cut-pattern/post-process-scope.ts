/**
 * Which post-process config a subtree of the pattern view renders.
 *
 * Page layout draws one group of pages per post-process config (see
 * `post-process-list.ts`), each a full copy of the bands. The band components
 * read their prepared paths and label-text flag from this scope rather than
 * the global stores, so each copy shows its own config. Outside any scope —
 * the non-page layouts — they fall back to the first config, which is what the
 * global stores hold.
 */
import { getContext, setContext } from 'svelte';
import { derived, type Readable } from 'svelte/store';
import {
	dropLabelText,
	dropLabelTextList,
	mergedBandPaths,
	mergedBandPathsList
} from '#lib/stores/index.js';
import type { TaggedPath } from '#lib/cut-pattern/post-process-types.js';

export type PostProcessScope = {
	mergedBandPaths: Readable<Map<string, TaggedPath[]>>;
	dropLabelText: Readable<boolean>;
};

const KEY = Symbol('post-process-scope');
const FIRST: PostProcessScope = { mergedBandPaths, dropLabelText };
const EMPTY = new Map<string, TaggedPath[]>();

/** Call during component init. Index 0 reuses the global stores. */
export const setPostProcessScope = (index: number): PostProcessScope =>
	setContext(
		KEY,
		index === 0
			? FIRST
			: {
					mergedBandPaths: derived(mergedBandPathsList, (list) => list[index] ?? EMPTY),
					dropLabelText: derived(dropLabelTextList, (list) => list[index] ?? false)
				}
	);

/** Call during component init. */
export const getPostProcessScope = (): PostProcessScope =>
	getContext<PostProcessScope | undefined>(KEY) ?? FIRST;
