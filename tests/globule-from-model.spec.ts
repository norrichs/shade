import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Globule cross sections from a model, end to end: import a GLB in the GCS
 * editor's From model section, snapshot, and confirm the globule list holds one
 * asymmetric GCS per silhouette level and the globule pipeline generates on it.
 */

const FIXTURE = fileURLToPath(new URL('./fixtures/deformed-icosphere.glb', import.meta.url));
const STORES = '/src/lib/stores/index.ts';
const VIEW_CONTROLS = '/src/lib/stores/viewControlStore.ts';

type StoreLike<T> = { subscribe: (run: (v: T) => void) => () => void; set: (v: T) => void };

type GlobuleSnapshot = {
	divisions: number;
	symmetries: string[];
	modelFile: string | null;
};

const readGlobule = (page: Page) =>
	page.evaluate(async (specifier: string) => {
		const { superConfigStore } = (await import(/* @vite-ignore */ specifier)) as {
			superConfigStore: StoreLike<{
				subGlobuleConfigs: {
					globuleConfig: {
						levelConfig: { silhouetteSampleMethod: { divisions: number } };
						shapeConfigs: { symmetry: string }[];
						modelSource?: { fileName: string };
					};
				}[];
			}>;
		};
		let value!: GlobuleSnapshot;
		superConfigStore.subscribe((c) => {
			const g = c.subGlobuleConfigs[0].globuleConfig;
			value = {
				divisions: g.levelConfig.silhouetteSampleMethod.divisions,
				symmetries: g.shapeConfigs.map((s) => s.symmetry),
				modelFile: g.modelSource?.fileName ?? null
			};
		})();
		return value;
	}, STORES);

const pipelineState = (page: Page) =>
	page.evaluate(async (specifier: string) => {
		const s = (await import(/* @vite-ignore */ specifier)) as {
			superGlobuleStore: StoreLike<{
				globuleTubes: { bands: unknown[] }[];
				pipelineErrors?: { message: string }[];
			}>;
			isWorking: StoreLike<boolean>;
			workerError: StoreLike<string | null>;
		};
		const read = <T>(store: StoreLike<T>) => {
			let value!: T;
			store.subscribe((v) => (value = v))();
			return value;
		};
		const g = read(s.superGlobuleStore);
		return {
			bands: (g?.globuleTubes ?? []).reduce((sum, t) => sum + t.bands.length, 0),
			working: read(s.isWorking),
			workerError: read(s.workerError),
			errors: (g?.pipelineErrors ?? []).map((e) => e.message)
		};
	}, STORES);

const showGlobuleTubes = (page: Page) =>
	page.evaluate(async (specifier: string) => {
		const { viewControlStore } = (await import(/* @vite-ignore */ specifier)) as {
			viewControlStore: StoreLike<{ showGlobuleTubeGeometry: { any: boolean } }>;
		};
		let value!: { showGlobuleTubeGeometry: { any: boolean } };
		viewControlStore.subscribe((v) => (value = v))();
		viewControlStore.set({
			...value,
			showGlobuleTubeGeometry: { ...value.showGlobuleTubeGeometry, any: true }
		});
	}, VIEW_CONTROLS);

const openDesigner = async (page: Page) => {
	await page.goto('/designer2');
	await expect(page.getByRole('button', { name: 'Prepare Download' })).toBeVisible({
		timeout: 60_000
	});
};

const openGcsPanel = async (page: Page) => {
	// Rail buttons render an accelerator letter in a separate span ("G lobule C ross
	// S ection"), and the rail can run off-screen: match the rest, dispatch the click.
	await page.locator('button', { hasText: /ross/ }).first().dispatchEvent('click');
	await expect(page.locator('[data-testid="from-model-file-input"]')).toBeAttached();
};

test.describe('globule from model', () => {
	test.setTimeout(240_000);

	test('snapshots globule cross sections from an imported GLB', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(e.message));
		page.on('dialog', (dialog) => dialog.accept());

		await openDesigner(page);
		await showGlobuleTubes(page);
		await openGcsPanel(page);

		await page.setInputFiles('[data-testid="from-model-file-input"]', FIXTURE);
		await expect
			.poll(async () => (await readGlobule(page)).modelFile, { timeout: 30_000 })
			.toBe('deformed-icosphere.glb');

		await page.locator('summary', { hasText: 'From model' }).click();
		await page.locator('[data-testid="from-model-snapshot"]').click();

		await expect
			.poll(
				async () => {
					const g = await readGlobule(page);
					return (
						g.symmetries.length === g.divisions + 1 && g.symmetries.every((s) => s === 'asymmetric')
					);
				},
				{ timeout: 30_000 }
			)
			.toBe(true);

		await expect
			.poll(
				async () => {
					const st = await pipelineState(page);
					return st.bands > 0 && !st.working;
				},
				{ timeout: 90_000 }
			)
			.toBe(true);
		const st = await pipelineState(page);
		expect(st.workerError).toBeNull();
		expect(st.errors).toEqual([]);
		await expect(page.locator('.from-model .error')).toHaveCount(0);

		expect(errors).toEqual([]);
	});
});
