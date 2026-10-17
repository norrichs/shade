import { writable } from 'svelte/store';
import type { FloaterContent } from '../../components/modal/sidebar-definitions';

/**
 * Key (in the page's `SidebarDefinition`) of the sidebar floater that is open,
 * or null. A module store rather than HoverSidebar state so the agent bridge
 * can open and close panels; HoverSidebar clears it on unmount, so a panel
 * never reopens on another route.
 */
export const openSidebarPanel = writable<FloaterContent['title'] | null>(null);
