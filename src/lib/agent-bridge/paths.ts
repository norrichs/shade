/**
 * Dotted-path helpers for the agent bridge. Paths use plain keys and array
 * indexes: `subGlobuleConfigs.0.globuleConfig.levelConfig`. An empty path is
 * the root.
 */

const splitPath = (path: string | undefined): string[] =>
	path ? path.split('.').filter((part) => part.length > 0) : [];

const isIndex = (key: string) => /^\d+$/.test(key);

export const getAtPath = (root: unknown, path?: string): unknown => {
	let node: unknown = root;
	for (const key of splitPath(path)) {
		if (node === null || typeof node !== 'object' || !(key in (node as object))) {
			throw new Error(`Path "${path}" does not exist (failed at "${key}")`);
		}
		node = (node as Record<string, unknown>)[key];
	}
	return node;
};

/**
 * Returns a copy of `root` with `value` at `path`, copying only the containers
 * along the path so untouched branches keep their identity (derived stores
 * compare by reference). Refuses to invent intermediate containers: a typo
 * should fail loudly rather than grow a stray key the app ignores.
 */
export const setAtPath = <T>(root: T, path: string, value: unknown): T => {
	const keys = splitPath(path);
	if (keys.length === 0) return value as T;
	const write = (node: unknown, depth: number): unknown => {
		const key = keys[depth];
		if (node === null || typeof node !== 'object') {
			throw new Error(`Path "${path}" does not exist (failed at "${key}")`);
		}
		const isLast = depth === keys.length - 1;
		if (!isLast && !(key in (node as object))) {
			throw new Error(`Path "${path}" does not exist (failed at "${key}")`);
		}
		const next = isLast ? value : write((node as Record<string, unknown>)[key], depth + 1);
		if (Array.isArray(node)) {
			if (!isIndex(key) || Number(key) > node.length) {
				throw new Error(
					`Path "${path}": "${key}" is not a valid index into an array of ${node.length}`
				);
			}
			const copy = node.slice();
			copy[Number(key)] = next;
			return copy;
		}
		return { ...(node as object), [key]: next };
	};
	return write(root, 0) as T;
};

/**
 * A size-bounded view of a value: containers below `depth` collapse to a
 * one-line description, and long arrays are elided after `maxItems`. Keeps a
 * config read from flooding the agent's context with bezier point arrays.
 */
export const summarize = (value: unknown, depth = 3, maxItems = 12): unknown => {
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) {
		if (depth <= 0) return `[Array(${value.length})]`;
		const items = value.slice(0, maxItems).map((item) => summarize(item, depth - 1, maxItems));
		if (value.length > maxItems) items.push(`… ${value.length - maxItems} more`);
		return items;
	}
	const entries = Object.entries(value as Record<string, unknown>);
	if (depth <= 0) {
		const keys = entries.map(([k]) => k);
		return `{${keys.slice(0, 8).join(', ')}${keys.length > 8 ? ', …' : ''}}`;
	}
	return Object.fromEntries(entries.map(([k, v]) => [k, summarize(v, depth - 1, maxItems)]));
};
