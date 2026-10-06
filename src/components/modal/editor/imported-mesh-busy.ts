import { writable } from 'svelte/store';

/** True while an async imported-mesh operation (import, replace, fit, simplify) is in flight. */
export const importedMeshBusy = writable(false);
