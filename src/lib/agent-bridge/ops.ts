import { get, type Readable, type Writable } from 'svelte/store';
import {
	superConfigStore,
	patternConfigStore,
	viewControlStore,
	superGlobuleStore,
	collatedTubesStore,
	pageLayoutInfoStore,
	loadedConfigStore,
	workerError,
	model3dBoundsStore,
	patternSourceStore
} from '$lib/stores';
import {
	isGenerating,
	triggerManualRegeneration,
	PATTERN_DEBOUNCE_MS
} from '$lib/stores/superGlobuleStores';
import { computationMode, isManualMode, designerPanels } from '$lib/stores/uiStores';
import { cameraDirection } from '$lib/stores/selectionStores';
import { tilePatternSpecStore } from '$lib/stores/tilePatternSpecStore';
import {
	buildSavedConfig,
	parseSavedConfig,
	collectReferencedTilePatternSpecs
} from '$lib/saved-config';
import { concatAddress } from '$lib/util';
import type { BandCutPattern, SuperGlobule } from '$lib/types';
import { getAtPath, setAtPath, summarize } from './paths';
import { captureModel, capturePattern } from './capture';
import type { AgentImage } from './protocol';
import { openSidebarPanel } from '$lib/stores/sidebarStore';
import { projectionConfigs } from '../../components/modal/sidebar-definitions';

/** designer2's sidebar panels, matched by key, title or short title. */
const findPanel = (query: string) => {
	const q = query.trim().toLowerCase();
	for (const [key, floater] of projectionConfigs) {
		const titles = [key, floater.shortTitle, floater.title].flat();
		if (titles.some((t) => t.toLowerCase() === q)) return key;
	}
	const names = [...projectionConfigs].map(([k, f]) => `${k} (${f.shortTitle})`).join(', ');
	throw new Error(`No sidebar panel "${query}". Panels: ${names}`);
};

export type OpOutput = { result: unknown; images?: AgentImage[] };
type Args = Record<string, unknown>;
type Op = { describe: string; args?: string; run: (args: Args) => Promise<OpOutput> | OpOutput };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Stores the agent may read and patch, addressed by name.

const configStores = {
	super: superConfigStore,
	pattern: patternConfigStore,
	view: viewControlStore
} as const;

// `ui` is a virtual store: its first path segment names a real store.
const uiStores = { computationMode, isManualMode, designerPanels } as const;

type StoreName = keyof typeof configStores | 'ui';

const storeName = (value: unknown): StoreName => {
	if (value === 'super' || value === 'pattern' || value === 'view' || value === 'ui') return value;
	throw new Error(
		`"store" must be one of super | pattern | view | ui (got ${JSON.stringify(value)})`
	);
};

const readStore = (name: StoreName): unknown =>
	name === 'ui'
		? Object.fromEntries(Object.entries(uiStores).map(([k, s]) => [k, get(s as Readable<unknown>)]))
		: get(configStores[name] as Readable<unknown>);

type Patch = { path: string; value: unknown };

/**
 * Apply every patch to a draft, then write each touched store once, so coupled
 * values (a min/max pair, a type and its config) never reach generation half
 * applied, and a bad path leaves every store untouched.
 */
const writePatches = (name: StoreName, patches: Patch[]) => {
	const drafts = new Map<Writable<unknown>, unknown>();
	for (const { path, value } of patches) {
		let store: Writable<unknown>;
		let storePath = asString(path, 'path');
		if (name === 'ui') {
			const [head, ...rest] = storePath.split('.');
			const ui = uiStores[head as keyof typeof uiStores] as Writable<unknown> | undefined;
			if (!ui)
				throw new Error(`ui path must start with one of ${Object.keys(uiStores).join(', ')}`);
			store = ui;
			storePath = rest.join('.');
		} else {
			store = configStores[name] as Writable<unknown>;
		}
		const base = drafts.has(store) ? drafts.get(store) : get(store);
		drafts.set(store, setAtPath(base, storePath, value));
	}
	for (const [store, value] of drafts) store.set(value);
};

// ---------------------------------------------------------------------------
// Undo: every mutating op snapshots the three config stores first.

type Snapshot = { super: unknown; pattern: unknown; view: unknown; label: string };
const undoStack: Snapshot[] = [];
const UNDO_LIMIT = 30;

const snapshot = (label: string) => {
	undoStack.push({
		super: get(superConfigStore),
		pattern: get(patternConfigStore),
		view: get(viewControlStore),
		label
	});
	if (undoStack.length > UNDO_LIMIT) undoStack.shift();
};

const writePatchesWithSnapshot = (name: StoreName, patches: Patch[]) => {
	snapshot(`patch ${name}: ${patches.map((p) => p.path).join(', ')}`);
	try {
		writePatches(name, patches);
	} catch (error) {
		undoStack.pop();
		throw error;
	}
};

// ---------------------------------------------------------------------------
// Generation

/**
 * Resolves once geometry and pattern generation have been idle for a while.
 * Store writes reach the worker through debounced derivations, so `isGenerating`
 * can still be false right after a write: require a sustained quiet period.
 */
const waitForIdle = async (timeoutMs = 120_000) => {
	const start = performance.now();
	const quietMs = PATTERN_DEBOUNCE_MS + 250;
	let quietSince = performance.now();
	await sleep(50);
	while (performance.now() - quietSince < quietMs) {
		if (performance.now() - start > timeoutMs) {
			throw new Error(`Generation still running after ${timeoutMs} ms`);
		}
		if (get(isGenerating)) quietSince = performance.now();
		await sleep(50);
	}
	return { generationMs: Math.round(performance.now() - start - quietMs) };
};

const afterMutation = async (args: Args) => {
	if (args.regenerate !== false && get(isManualMode)) triggerManualRegeneration();
	if (args.wait === false) return { waited: false };
	const timing = await waitForIdle(typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined);
	return { ...timing, workerError: get(workerError), summary: summarizeModel() };
};

// ---------------------------------------------------------------------------
// Model inspection

const bandAddress = (band: BandCutPattern) => concatAddress(band.address, 'gtb');

type Tube = SuperGlobule['globuleTubes'][number];

const countTubes = (tubes: Tube[] | undefined) => ({
	tubes: tubes?.length ?? 0,
	bands: tubes?.reduce((n, t) => n + t.bands.length, 0) ?? 0,
	facets: tubes?.reduce((n, t) => n + t.bands.reduce((m, b) => m + b.facets.length, 0), 0) ?? 0
});

const round = (n: number | undefined, places = 2) =>
	n === undefined || !Number.isFinite(n) ? n : Math.round(n * 10 ** places) / 10 ** places;

const summarizeModel = () => {
	const sg = get(superGlobuleStore);
	const tubes = get(collatedTubesStore);
	const bands = tubes.flatMap((t) => t.bands);
	const errors = bands
		.filter((b) => b.error)
		.map((b) => ({ band: bandAddress(b), error: b.error }));
	// Box3 of the geometry rendered for the active pattern source; empty (±Infinity)
	// when nothing for that source is rendered.
	const box = get(model3dBoundsStore);
	const bounds =
		box && !box.isEmpty()
			? {
					min: box.min.toArray().map((n) => round(n)),
					max: box.max.toArray().map((n) => round(n))
				}
			: null;
	const pattern = get(patternConfigStore);
	return {
		loadedConfig: get(loadedConfigStore)?.name ?? null,
		geometry3d: {
			globuleTubes: countTubes(sg.globuleTubes),
			projections: sg.projections.map((p) => ({
				tubes: countTubes(p.tubes),
				surfaceProjectionTubes: countTubes(p.surfaceProjectionTubes)
			})),
			voronoi: sg.voronoiResult
				? {
						tubes: countTubes(sg.voronoiResult.tubes),
						surfaceProjectionTubes: countTubes(sg.voronoiResult.surfaceProjectionTubes)
					}
				: null,
			bounds
		},
		pattern: {
			source: get(patternSourceStore),
			type: pattern.patternTypeConfig.type,
			tubes: tubes.length,
			bands: bands.length,
			facets: bands.reduce((n, b) => n + b.facets.length, 0),
			bandErrors: errors.slice(0, 20),
			bandErrorCount: errors.length,
			pages: get(pageLayoutInfoStore)
		},
		workerError: get(workerError),
		isGenerating: get(isGenerating)
	};
};

const bandRow = (band: BandCutPattern, tubeIndex: number) => ({
	address: bandAddress(band),
	id: band.id,
	tube: tubeIndex,
	facets: band.facets.length,
	quadCount: band.quadCount,
	bounds: band.bounds && {
		left: round(band.bounds.left),
		top: round(band.bounds.top),
		width: round(band.bounds.width),
		height: round(band.bounds.height)
	},
	sideOrientation: band.sideOrientation,
	error: band.error
});

const findBand = (address: string) => {
	const tubes = get(collatedTubesStore);
	for (let t = 0; t < tubes.length; t++) {
		const band = tubes[t].bands.find((b) => bandAddress(b) === address);
		if (band) return { band, tubeIndex: t };
	}
	throw new Error(`No band "${address}" in the current pattern. Use the "bands" op to list them.`);
};

// ---------------------------------------------------------------------------
// Saved configs (the same flow as ConfigManager.svelte)

const captureCurrentConfig = () => {
	const patternConfig = get(patternConfigStore);
	const specs = collectReferencedTilePatternSpecs(
		patternConfig,
		get(tilePatternSpecStore).variants
	);
	return JSON.stringify(
		buildSavedConfig(get(superConfigStore), patternConfig, get(viewControlStore), specs)
	);
};

const fetchJson = async (url: string, init?: RequestInit) => {
	const res = await fetch(url, init);
	if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} failed: ${res.status}`);
	return res.json();
};

// ---------------------------------------------------------------------------

const asString = (v: unknown, name: string) => {
	if (typeof v !== 'string') throw new Error(`"${name}" must be a string`);
	return v;
};

export const ops: Record<string, Op> = {
	help: {
		describe: 'List every op with its arguments.',
		run: () => ({
			result: Object.fromEntries(
				Object.entries(ops).map(([name, op]) => [name, { describe: op.describe, args: op.args }])
			)
		})
	},

	status: {
		describe: 'Generation state, modes, active pattern source and gates.',
		run: () => ({
			result: {
				isGenerating: get(isGenerating),
				workerError: get(workerError),
				computationMode: get(computationMode),
				isManualMode: get(isManualMode),
				patternSource: get(patternSourceStore),
				patternType: get(patternConfigStore).patternTypeConfig.type,
				pipelineGates: Object.fromEntries(
					Object.entries(get(viewControlStore)).map(([k, v]) => [k, v.any])
				),
				loadedConfig: get(loadedConfigStore)?.name ?? null,
				undoDepth: undoStack.length
			}
		})
	},

	getConfig: {
		describe: 'Read a store, or a subtree of it, size-bounded by depth.',
		args: '{store: super|pattern|view|ui, path?: "a.0.b", depth?: 3, maxItems?: 12}',
		run: (args) => {
			const value = getAtPath(readStore(storeName(args.store)), args.path as string | undefined);
			const depth = typeof args.depth === 'number' ? args.depth : 3;
			const maxItems = typeof args.maxItems === 'number' ? args.maxItems : 12;
			return { result: summarize(value, depth, maxItems) };
		}
	},

	patchConfig: {
		describe:
			'Set values at dotted paths, then wait for generation and return a model summary. Undoable.',
		args: '{store, path, value} | {store, patches: [{path, value}]}, wait?: true, regenerate?: true, timeoutMs?',
		run: async (args) => {
			const name = storeName(args.store);
			const patches = Array.isArray(args.patches)
				? (args.patches as Patch[])
				: [{ path: asString(args.path, 'path'), value: args.value }];
			// Throws before any store is written, so a bad path needs no rollback.
			writePatchesWithSnapshot(name, patches);
			return { result: { applied: patches.length, ...(await afterMutation(args)) } };
		}
	},

	undo: {
		describe: 'Restore super/pattern/view as they were before the last mutating op.',
		args: '{wait?: true}',
		run: async (args) => {
			const restored = undo();
			return { result: { restored, remaining: undoStack.length, ...(await afterMutation(args)) } };
		}
	},

	regenerate: {
		describe: 'Force a regeneration (needed in manual mode) and wait for it.',
		run: async (args) => {
			triggerManualRegeneration();
			return { result: await afterMutation({ ...args, regenerate: false }) };
		}
	},

	waitForIdle: {
		describe: 'Wait until geometry and pattern generation are idle.',
		args: '{timeoutMs?: 120000}',
		run: async (args) => ({
			result: await waitForIdle(typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined)
		})
	},

	summary: {
		describe: '3D geometry counts, pattern band/facet counts, band errors, pages.',
		run: () => ({ result: summarizeModel() })
	},

	bands: {
		describe: 'List pattern bands (address, facets, flattened bounds, errors).',
		args: '{tube?: number, offset?: 0, limit?: 200, errorsOnly?: false}',
		run: (args) => {
			const tubes = get(collatedTubesStore);
			let rows = tubes.flatMap((t, ti) => t.bands.map((b) => bandRow(b, ti)));
			if (typeof args.tube === 'number') rows = rows.filter((r) => r.tube === args.tube);
			if (args.errorsOnly) rows = rows.filter((r) => r.error);
			const offset = typeof args.offset === 'number' ? args.offset : 0;
			const limit = typeof args.limit === 'number' ? args.limit : 200;
			return { result: { total: rows.length, offset, bands: rows.slice(offset, offset + limit) } };
		}
	},

	band: {
		describe: 'Details for one band: partners, tabs, facet labels, bounds.',
		args: '{address: "g0t3b7" | "g0t3b7p1", facets?: false}',
		run: (args) => {
			const { band, tubeIndex } = findBand(asString(args.address, 'address'));
			const partner = (a: unknown) => (a ? concatAddress(a as never, 'gtb') : undefined);
			return {
				result: {
					...bandRow(band, tubeIndex),
					leftPartnerBand: band.leftPartnerBand,
					startPartner: partner(band.meta?.startPartnerBand),
					endPartner: partner(band.meta?.endPartnerBand),
					parentQuadOffset: band.parentQuadOffset,
					tabs: band.tabs?.map((t) => ({ position: t.position, side: t.side, quad: t.quad })),
					tagAngle: band.tagAngle,
					facetDetails: args.facets
						? band.facets.map((f, i) => ({ i, label: f.label, strokeWidth: round(f.strokeWidth) }))
						: undefined
				}
			};
		}
	},

	setCamera: {
		describe: 'Point the 3D camera at the origin from a direction (normalized for you).',
		args: '{x, y, z}',
		run: async (args) => {
			const [x, y, z] = [args.x, args.y, args.z].map(Number);
			const len = Math.hypot(x, y, z);
			if (!len) throw new Error('x, y, z must be a non-zero direction');
			// Nudge so repeating a direction still re-applies after the user orbits.
			cameraDirection.set(null);
			await sleep(0);
			cameraDirection.set({ x: x / len, y: y / len, z: z / len });
			await sleep(100);
			return { result: { direction: get(cameraDirection) } };
		}
	},

	screenshot: {
		describe:
			'PNG of the 3D model and/or pattern. annotate draws band addresses on the pattern. Returns file paths.',
		args: '{view?: model|pattern|both, annotate?: false, width?: 1600, bands?: ["g0t3b7"], crop?: true}',
		run: async (args) => {
			const view = (args.view as string) ?? 'both';
			const images: AgentImage[] = [];
			const notes: Record<string, unknown> = {};
			if (view === 'model' || view === 'both') {
				try {
					images.push({ name: 'model', dataUrl: await captureModel(args.crop !== false) });
				} catch (error) {
					notes.model = (error as Error).message;
				}
			}
			if (view === 'pattern' || view === 'both') {
				try {
					const shot = await capturePattern({
						annotate: args.annotate === true,
						width: typeof args.width === 'number' ? args.width : undefined,
						bands: Array.isArray(args.bands) ? (args.bands as string[]) : undefined
					});
					images.push({
						name: args.annotate ? 'pattern-annotated' : 'pattern',
						dataUrl: shot.dataUrl
					});
					notes.pattern = { bandsCaptured: shot.bands };
				} catch (error) {
					notes.pattern = (error as Error).message;
				}
			}
			if (images.length === 0) throw new Error(`Nothing captured: ${JSON.stringify(notes)}`);
			return { result: notes, images };
		}
	},

	panels: {
		describe: 'List the sidebar editor panels and which one is open.',
		run: () => ({
			result: {
				open: get(openSidebarPanel),
				panels: [...projectionConfigs].map(([key, f]) => ({ key, shortTitle: f.shortTitle }))
			}
		})
	},

	openPanel: {
		describe: 'Open a sidebar editor panel for Ben (by key, title or short title like "GCS").',
		args: '{panel: "GCS" | "Globule Cross Section" | ...}',
		run: async (args) => {
			const key = findPanel(asString(args.panel, 'panel'));
			openSidebarPanel.set(key);
			await sleep(50);
			return { result: { open: key } };
		}
	},

	closePanel: {
		describe: 'Close the open sidebar panel.',
		run: () => {
			openSidebarPanel.set(null);
			return { result: { open: null } };
		}
	},

	listConfigs: {
		describe: 'Saved configs in the database (id, name).',
		run: async () => {
			const rows = (await fetchJson('/api/config')) as { id: number; name: string }[];
			return { result: rows.map(({ id, name }) => ({ id, name })) };
		}
	},

	loadConfig: {
		describe: 'Load a saved config by id (replaces super/pattern/view). Undoable.',
		args: '{id: number, wait?: true}',
		run: async (args) => {
			const id = Number(args.id);
			const data = await fetchJson(`/api/config/${id}`);
			const parsed = parseSavedConfig(data.configJson);
			snapshot(`load config ${id}`);
			tilePatternSpecStore.ensureRegistered(parsed.tilePatternSpecs);
			superConfigStore.set(parsed.superGlobuleConfig);
			if (parsed.globulePatternConfig) patternConfigStore.set(parsed.globulePatternConfig);
			if (parsed.viewControls) viewControlStore.set(parsed.viewControls);
			loadedConfigStore.set({ id, name: data.name, snapshot: captureCurrentConfig() });
			return { result: { loaded: data.name, ...(await afterMutation(args)) } };
		}
	},

	saveConfig: {
		describe: 'Save the current state as a NEW named config. Never overwrites.',
		args: '{name: string}',
		run: async (args) => {
			const name = asString(args.name, 'name').trim();
			if (!name) throw new Error('"name" must not be empty');
			const configJson = captureCurrentConfig();
			const { id } = await fetchJson('/api/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, configJson })
			});
			if (typeof id === 'number') loadedConfigStore.set({ id, name, snapshot: configJson });
			return { result: { id, name } };
		}
	}
};

function undo(): string {
	const last = undoStack.pop();
	if (!last) throw new Error('Nothing to undo');
	superConfigStore.set(last.super as never);
	patternConfigStore.set(last.pattern as never);
	viewControlStore.set(last.view as never);
	return last.label;
}

export const runOp = async (op: string, args: Args): Promise<OpOutput> => {
	const handler = ops[op];
	if (!handler) throw new Error(`Unknown op "${op}". Ops: ${Object.keys(ops).join(', ')}`);
	return handler.run(args);
};
