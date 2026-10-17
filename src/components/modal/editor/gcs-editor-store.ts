/**
 * Which cross section the GCS editor is editing (index into `shapeConfigs`).
 *
 * Module scope, not component `$state`: `Floater` unmounts panel content on
 * close/switch, which would reset a local selection.
 */
import { writable } from 'svelte/store';

export const selectedGcsIndex = writable<number>(0);
