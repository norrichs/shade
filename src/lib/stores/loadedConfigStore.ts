import { derived, writable } from 'svelte/store';

/**
 * The saved config the user currently has loaded, if any. `snapshot` is the
 * serialized `SavedConfig` captured at load (or last overwrite) time; comparing
 * it to the live serialization tells us whether the working config has been
 * modified since.
 *
 * This lives at module scope (not in ConfigManager's component state) because
 * the Configs panel unmounts whenever the user closes it or switches to another
 * panel to edit — component-local state would be lost the moment they navigate
 * away to make an edit, dropping the "loaded" link and its Save button.
 */
export type LoadedConfig = {
	id: number;
	name: string;
	snapshot: string;
};

export const loadedConfigStore = writable<LoadedConfig | null>(null);

/**
 * The name the user saved the current config under — what downloads and page
 * labels call "config name". Undefined when no saved config is loaded; the
 * super-globule's own `name` is a generated default, not a config name.
 */
export const loadedConfigName = derived(loadedConfigStore, (config) => config?.name);
