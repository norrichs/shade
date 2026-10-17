import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	AGENT_CMD_EVENT,
	AGENT_HTTP_PATH,
	AGENT_RESULT_EVENT,
	type AgentCommand,
	type AgentResult
} from './protocol.ts';

const DEFAULT_TIMEOUT_MS = 120_000;
export const AGENT_IMAGE_DIR = join(tmpdir(), 'shades-agent');

type Pending = {
	expected: number;
	answered: number;
	sawDisabled: boolean;
	resolve: (result: AgentResult | { timeout: true; answered: number }) => void;
};

const readBody = (req: IncomingMessage): Promise<string> =>
	new Promise((resolve, reject) => {
		let body = '';
		req.on('data', (chunk) => (body += chunk));
		req.on('end', () => resolve(body));
		req.on('error', reject);
	});

const send = (res: ServerResponse, status: number, body: unknown) => {
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json');
	res.end(JSON.stringify(body, null, 1));
};

/** Write data-URL images to disk and replace them with file paths Claude can Read. */
const materializeImages = (result: AgentResult) => {
	if (!result.images?.length) return result;
	mkdirSync(AGENT_IMAGE_DIR, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const imagePaths = result.images.map(({ name, dataUrl }) => {
		const path = join(AGENT_IMAGE_DIR, `${stamp}-${name}.png`);
		writeFileSync(path, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
		return path;
	});
	const { images: _images, ...rest } = result;
	return { ...rest, imagePaths };
};

/**
 * Dev-only bridge that lets Claude Code drive the open designer2 tab.
 *
 * `POST /__shades/agent {op, args, timeoutMs?}` is relayed to every connected
 * page over Vite's HMR socket; the first tab with the bridge switched on that
 * answers wins. Tabs with it switched off answer `disabled`, which is only
 * reported once every tab has answered that way.
 */
export const agentBridgePlugin = (): Plugin => ({
	name: 'shades-agent-bridge',
	apply: 'serve',
	configureServer(server: ViteDevServer) {
		const pending = new Map<string, Pending>();
		let seq = 0;

		server.ws.on(AGENT_RESULT_EVENT, (data: AgentResult) => {
			const entry = pending.get(data?.id);
			if (!entry) return;
			entry.answered += 1;
			if (data.disabled) {
				entry.sawDisabled = true;
				if (entry.answered >= entry.expected) entry.resolve(data);
				return;
			}
			entry.resolve(data);
		});

		server.middlewares.use(AGENT_HTTP_PATH, async (req, res) => {
			if (req.method !== 'POST') {
				send(res, 405, { ok: false, error: `POST {op, args} to ${AGENT_HTTP_PATH}` });
				return;
			}
			let parsed: { op?: string; args?: Record<string, unknown>; timeoutMs?: number };
			try {
				parsed = JSON.parse((await readBody(req)) || '{}');
			} catch {
				send(res, 400, { ok: false, error: 'Body is not valid JSON' });
				return;
			}
			if (!parsed.op) {
				send(res, 400, { ok: false, error: 'Missing "op". Try {"op":"help"}.' });
				return;
			}
			const expected = server.ws.clients.size;
			if (expected === 0) {
				send(res, 503, {
					ok: false,
					error: 'No browser tab is connected to the dev server. Open /designer2.'
				});
				return;
			}

			const id = `${Date.now()}-${++seq}`;
			const command: AgentCommand = { id, op: parsed.op, args: parsed.args ?? {} };
			const outcome = await new Promise<AgentResult | { timeout: true; answered: number }>(
				(resolve) => {
					const timer = setTimeout(
						() => resolve({ timeout: true, answered: pending.get(id)?.answered ?? 0 }),
						parsed.timeoutMs ?? DEFAULT_TIMEOUT_MS
					);
					pending.set(id, {
						expected,
						answered: 0,
						sawDisabled: false,
						resolve: (r) => {
							clearTimeout(timer);
							resolve(r);
						}
					});
					server.ws.send({ type: 'custom', event: AGENT_CMD_EVENT, data: command });
				}
			);
			const entry = pending.get(id);
			pending.delete(id);

			if ('timeout' in outcome) {
				send(res, 504, {
					ok: false,
					error: entry?.sawDisabled
						? 'The agent bridge is switched off. Ask Ben to click the red dot in the designer2 navbar.'
						: 'No designer2 tab answered in time. Is /designer2 open (not just another route)?'
				});
				return;
			}
			if (outcome.disabled) {
				send(res, 423, {
					ok: false,
					disabled: true,
					error:
						'The agent bridge is switched off. Ask Ben to click the red dot in the designer2 navbar.'
				});
				return;
			}
			send(res, outcome.ok ? 200 : 422, materializeImages(outcome));
		});
	}
});
