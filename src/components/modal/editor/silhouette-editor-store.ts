/**
 * Which curve the Silhouette editor is showing.
 *
 * Module scope, not component `$state`: `Floater` tears its panel content down
 * whenever the floater is closed or switched, so a local tab would snap back to
 * Silhouette every time the user looked at another panel.
 */
import { writable } from 'svelte/store';

export type SilhouetteTab = 'silhouette' | 'depth';

export const silhouetteTab = writable<SilhouetteTab>('silhouette');
