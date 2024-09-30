import { writable } from 'svelte/store';

export const activeControl = writable<{ sgIndex: number; tIndex: number } | undefined>(undefined);
