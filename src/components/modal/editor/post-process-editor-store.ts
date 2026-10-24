/**
 * Which post-process config the Post Process editor is editing (index into
 * `postProcessList`).
 *
 * Module scope, not component `$state`: `Floater` unmounts panel content on
 * close/switch, which would reset a local selection.
 */
import { writable } from 'svelte/store';

export const selectedPostProcessIndex = writable<number>(0);
