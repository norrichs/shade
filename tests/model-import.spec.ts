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

const voronoiState = (page: Page) =>
	page.evaluate(async (specifier: string) => {
		const { superGlobuleStore } = (await import(/* @vite-ignore */ specifier)) as {
			superGlobuleStore: StoreLike<{
				voronoiResult?: { tubes: unknown[] };
				pipelineErrors?: { message: string }[];
			}>;
		};
		let value: { tubes: number; errors: string[] } = { tubes: 0, errors: [] };
		superGlobuleStore.subscribe((g) => {
			value = {
				tubes: g?.voronoiResult?.tubes.length ?? 0,
				errors: (g?.pipelineErrors ?? []).map((e) => e.message)
			};
		})();
		return value;
	}, STORES);

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
	await page.locator('button', { hasText: /urface/i }).first().dispatchEvent('click');
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

		await expect
			.poll(async () => (await voronoiState(page)).tubes, { timeout: 60_000 })
			.toBeGreaterThan(0);
		expect((await voronoiState(page)).errors).toEqual([]);

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

		await expect
			.poll(async () => (await readSurface(page)).assetId, { timeout: 30_000 })
			.toBe(imported.assetId);
		await expect
			.poll(async () => (await voronoiState(page)).errors, { timeout: 60_000 })
			.toEqual([]);
		expect((await voronoiState(page)).tubes).toBeGreaterThan(0);

		expect(errors).toEqual([]);
	});
});
