import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Model import end to end: pick a GLB in the Surface editor, confirm the
 * Voronoi pipeline produces bands on it, then simulate loading a saved config
 * after a reload (superConfigStore itself is not persisted across reloads —
 * see persistable.ts OVERRIDE_PERSISTENCE) and confirm the mesh comes back
 * from IndexedDB.
 */

const FIXTURE = fileURLToPath(new URL('./fixtures/deformed-icosphere.glb', import.meta.url));
const STORES = '/src/lib/stores/index.ts';
const ASSET_STORE = '/src/lib/mesh-import/asset-store.ts';

type StoreLike<T> = { subscribe: (run: (v: T) => void) => () => void; set: (v: T) => void };

const readSurface = (page: Page) =>
	page.evaluate(async (specifier: string) => {
		const { superConfigStore } = (await import(/* @vite-ignore */ specifier)) as {
			superConfigStore: StoreLike<{ projectionConfigs: { surfaceConfig: unknown }[] }>;
		};
		let value: unknown;
		superConfigStore.subscribe((c) => (value = c.projectionConfigs[0].surfaceConfig))();
		return value as { type: string; assetId: string; fileName: string };
	}, STORES);

const FIXTURE_TRIANGLES = 5120; // the generator's output; cleaning must not change it

/**
 * What the pipeline currently holds. `hasImportedMesh` is the load-bearing
 * signal: superGlobuleStore keeps serving the previous (default-surface) result
 * until the worker replies, so tube counts and an empty error list alone cannot
 * show that the imported mesh was generated on. Only a result whose rebuilt
 * surface mesh has the fixture's triangle count can.
 */
const pipelineState = (page: Page, assetId?: string) =>
	page.evaluate(
		async ([stores, assets, id]: [string, string, string | undefined]) => {
			const s = (await import(/* @vite-ignore */ stores)) as {
				superGlobuleStore: StoreLike<{
					voronoiResult?: {
						tubes: unknown[];
						surface: { traverse: (cb: (o: unknown) => void) => void };
					};
					pipelineErrors?: { message: string }[];
				}>;
				isWorking: StoreLike<boolean>;
				workerError: StoreLike<string | null>;
			};
			const a = (await import(/* @vite-ignore */ assets)) as {
				assetStatus: StoreLike<Record<string, string>>;
			};
			const read = <T>(store: StoreLike<T>) => {
				let value!: T;
				store.subscribe((v) => (value = v))();
				return value;
			};
			const g = read(s.superGlobuleStore);
			const triangleCounts: number[] = [];
			g?.voronoiResult?.surface.traverse((o) => {
				const geometry = (
					o as {
						geometry?: {
							index: { count: number } | null;
							getAttribute: (n: string) => { count: number };
						};
					}
				).geometry;
				if (!geometry) return;
				triangleCounts.push(
					(geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3
				);
			});
			return {
				triangleCounts,
				working: read(s.isWorking),
				workerError: read(s.workerError),
				tubes: g?.voronoiResult?.tubes.length ?? 0,
				errors: (g?.pipelineErrors ?? []).map((e) => e.message),
				assetStatus: id ? (read(a.assetStatus)[id] ?? null) : null
			};
		},
		[STORES, ASSET_STORE, assetId] as [string, string, string | undefined]
	);

/** Wait until the imported mesh has been generated on, then assert the run was clean. */
const expectImportedGenerated = async (page: Page, assetId: string) => {
	await expect
		.poll(
			async () => {
				const st = await pipelineState(page, assetId);
				return st.triangleCounts.includes(FIXTURE_TRIANGLES) && !st.working;
			},
			{ timeout: 90_000 }
		)
		.toBe(true);
	const st = await pipelineState(page, assetId);
	expect(st.assetStatus).toBe('loaded');
	expect(st.workerError).toBeNull();
	expect(st.errors).toEqual([]);
	expect(st.tubes).toBeGreaterThan(0);
};

const openDesigner = async (page: Page) => {
	await page.goto('/designer2');
	await expect(page.getByRole('button', { name: 'Prepare Download' })).toBeVisible({
		timeout: 60_000
	});
};

const selectVoronoiGeometry = async (page: Page) => {
	const rail = page.locator('button', { hasText: /atternl/i }).first();
	await rail.click();
	await page.locator('label:has-text("Geometry") select').first().selectOption('voronoi');
	await expect(page.locator('g[id^="band-"]').first()).toBeVisible({ timeout: 60_000 });
	await rail.click({ force: true });
};

const openSurfacePanel = async (page: Page) => {
	// Rail buttons render an accelerator letter in a separate span; match the rest.
	// The rail is a vertically centred column taller than the viewport, so the
	// Surface button can sit off-screen: dispatch the click instead of scrolling.
	await page
		.locator('button', { hasText: /urface/i })
		.first()
		.dispatchEvent('click');
	await expect(page.locator('[data-testid="model-file-input"]')).toBeAttached();
};

test.describe('model import', () => {
	test.setTimeout(240_000);

	test('imports a GLB as the Voronoi surface and restores it from IndexedDB', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(e.message));

		await openDesigner(page);
		await selectVoronoiGeometry(page);
		await openSurfacePanel(page);

		await page.setInputFiles('[data-testid="model-file-input"]', FIXTURE);
		await expect
			.poll(async () => (await readSurface(page)).type, { timeout: 30_000 })
			.toBe('ImportedMeshConfig');
		const imported = await readSurface(page);
		expect(imported.fileName).toBe('deformed-icosphere.glb');

		await expectImportedGenerated(page, imported.assetId);

		// Capture the config as a saved config would hold it, reload, and load it back.
		const saved = await page.evaluate(async (specifier: string) => {
			const { superConfigStore } = (await import(/* @vite-ignore */ specifier)) as {
				superConfigStore: StoreLike<unknown>;
			};
			let value: unknown;
			superConfigStore.subscribe((c) => (value = c))();
			return JSON.parse(JSON.stringify(value));
		}, STORES);

		await page.reload();
		await openDesigner(page);
		await selectVoronoiGeometry(page);
		await page.evaluate(
			async ([specifier, config]) => {
				const { superConfigStore } = (await import(/* @vite-ignore */ specifier as string)) as {
					superConfigStore: StoreLike<unknown>;
				};
				superConfigStore.set(config);
			},
			[STORES, saved] as const
		);

		await expectImportedGenerated(page, imported.assetId);

		expect(errors).toEqual([]);
	});
});
