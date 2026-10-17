import { writable } from 'svelte/store';
import { persistable } from '#lib/persistable.js';

const AGENT_BRIDGE_KEY = 'agent-bridge';

/**
 * Whether the dev-only agent bridge may act on this tab. Off by default, and
 * always persisted to localStorage (the last argument bypasses the global
 * `OVERRIDE_PERSISTENCE` switch, which only governs config stores).
 */
export const agentBridgeEnabled = persistable<boolean>(false, 'enabled', AGENT_BRIDGE_KEY, true);

/** Bumped on every command the bridge runs, so the navbar dot can flash. */
export const agentBridgeActivity = writable(0);
