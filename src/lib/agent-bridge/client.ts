import { get } from 'svelte/store';
import { agentBridgeActivity, agentBridgeEnabled } from './enabled';
import {
	AGENT_CMD_EVENT,
	AGENT_RESULT_EVENT,
	type AgentCommand,
	type AgentResult
} from './protocol';

/**
 * Connect this tab to the dev server's agent bridge. A no-op outside `vite dev`
 * (no HMR socket). Commands are answered `disabled` while the navbar switch is
 * off, so nothing here runs against the stores unless Ben has opted in.
 */
export const installAgentBridge = (): (() => void) => {
	const hot = import.meta.hot;
	if (!hot) return () => {};

	const reply = (result: AgentResult) => hot.send(AGENT_RESULT_EVENT, result);

	const handle = async (command: AgentCommand) => {
		if (!get(agentBridgeEnabled)) {
			reply({ id: command.id, ok: false, disabled: true });
			return;
		}
		agentBridgeActivity.update((n) => n + 1);
		try {
			// Loaded lazily so the ops' store graph stays out of the page's initial chunk.
			const { runOp } = await import('./ops');
			const { result, images } = await runOp(command.op, command.args ?? {});
			reply({
				id: command.id,
				ok: true,
				result: JSON.parse(JSON.stringify(result ?? null)),
				images
			});
		} catch (error) {
			reply({
				id: command.id,
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	};

	hot.on(AGENT_CMD_EVENT, handle);
	return () => hot.off(AGENT_CMD_EVENT, handle);
};
