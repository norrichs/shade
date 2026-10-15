/**
 * Wire format for the dev-only agent bridge: Claude Code → HTTP → Vite dev
 * server → HMR WebSocket → the designer2 tab, and back. Shared by the Vite
 * plugin (Node) and the browser module, so it must stay dependency-free.
 */

export const AGENT_CMD_EVENT = 'shades:agent-cmd';
export const AGENT_RESULT_EVENT = 'shades:agent-result';
export const AGENT_HTTP_PATH = '/__shades/agent';

export type AgentCommand = {
	id: string;
	op: string;
	args?: Record<string, unknown>;
};

/** An image the page produced; the plugin writes it to disk and swaps in a path. */
export type AgentImage = { name: string; dataUrl: string };

export type AgentResult = {
	id: string;
	ok: boolean;
	/** Set when the tab answered but the bridge is switched off in its navbar. */
	disabled?: boolean;
	result?: unknown;
	error?: string;
	images?: AgentImage[];
};
