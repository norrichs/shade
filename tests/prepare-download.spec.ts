import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end cover for "Prepare Download" on the band-merge worker pool.
 *
 * This supersedes the `paper-in-worker` spike probe: a prepare that completes
 * and publishes real merged paths is itself proof that paper.js ran inside real
 * Workers, because the pool is the only path to those paths for a job this size.
 *
 * The test must be able to FAIL when nothing merges. On a fresh `/designer2`
 * the 2D pattern pane is empty — the default `patternViewConfig.patternSource`
 * is `projection` and the default config has no projection tubes. With no bands
 * `toBandMergePayloads` returns `[]`, `runPrepare` takes the inline path,
 * publishes an empty map and still reports `✓ ready (0 ms)`. Asserting only on
 * that readout would pass having merged nothing and never started a worker. So
 * every test here first switches Geometry to Voronoi, and then asserts a real
 * band count.
 */

const BAND_FLOOR = 20; // the default Voronoi config yields 60; well clear of it

/**
 * `mergedBandPaths.size` — the non-racy proof that bands actually merged.
 *
 * Read straight out of the live store module. The dev server (pinned by
 * `playwright.config.ts`) serves the app's own module graph, so this is the
 * same singleton store instance the component writes to, not a copy.
 */
const mergedBandCount = (page: Page): Promise<number> =>
	// The specifier is a dev-server URL, not a path this project's tsconfig can
	// resolve, so it is passed in as a value rather than written as a literal
	// `import()` — a literal would be a type error here.
	page.evaluate(async (specifier: string) => {
		const stores = (await import(/* @vite-ignore */ specifier)) as {
			mergedBandPaths: {
				subscribe: (run: (paths: Map<string, unknown>) => void) => () => void;
			};
		};
		let size = -1;
		stores.mergedBandPaths.subscribe((paths) => (size = paths.size))();
		return size;
	}, '/src/lib/stores/index.ts');

/**
 * Switch the pattern source to Voronoi, which is what makes the pattern pane
 * non-empty. The control lives in the "Pattern layout" hover-sidebar floater;
 * its rail button renders its accelerator letter in a separate span
 * (`P atternl ayout`), so it is matched by substring rather than by role name.
 * An open floater swallows pointer events, hence the forced click to close it.
 */
const selectVoronoiGeometry = async (page: Page): Promise<void> => {
	const rail = page.locator('button', { hasText: /atternl/i }).first();
	await rail.click();
	await page.locator('label:has-text("Geometry") select').first().selectOption('voronoi');
	await expect(page.locator('g[id^="band-"]').first()).toBeVisible({ timeout: 60_000 });
	await rail.click({ force: true });
};

/**
 * Wait until the rendered band count stops changing, i.e. pattern generation
 * has finished. Geometry regeneration invalidates any prepared merge, so a run
 * started while one is still landing is cancelled by design.
 */
const settleBandCount = async (page: Page): Promise<number> => {
	const bands = page.locator('g[id^="band-"]');
	let previous = -1;
	for (let i = 0; i < 40; i += 1) {
		const current = await bands.count();
		if (current > 0 && current === previous) return current;
		previous = current;
		await page.waitForTimeout(500);
	}
	return previous;
};

/**
 * Widen the page and switch to page layout mode. Downloads require page
 * layout since post-processing 2 (real-world units need a page rect), so
 * this test — which downloads — needs it too. New object references
 * throughout: in-place mutation of `pageLayout` is silently ignored.
 */
const setPageLayout = (page: Page) =>
	page.evaluate(async (specifier: string) => {
		const stores = (await import(/* @vite-ignore */ specifier)) as {
			patternConfigStore: { update: (fn: (c: any) => any) => void };
		};
		stores.patternConfigStore.update((c: any) => ({
			...c,
			patternViewConfig: { ...c.patternViewConfig, patternLayoutMode: 'page' },
			patternConfig: {
				...c.patternConfig,
				pageLayout: {
					...c.patternConfig.pageLayout,
					pageSize: { width: 4000, height: 4000 },
					pageScale: 1
				}
			}
		}));
	}, '/src/lib/stores/index.ts');

const openDesigner = async (page: Page): Promise<string[]> => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/designer2');
	await expect(page.getByRole('button', { name: 'Prepare Download' })).toBeVisible({
		timeout: 60_000
	});
	await selectVoronoiGeometry(page);
	await settleBandCount(page);
	return errors;
};

test.describe('Prepare Download', () => {
	test.setTimeout(240_000);

	test('merges every band on the worker pool and reports progress', async ({ page }) => {
		const errors = await openDesigner(page);

		await page.getByRole('button', { name: 'Prepare Download' }).click();

		// Capture the band total out of the running readout. The pool path is
		// taken for anything over 2 bands, and a 60-band run lasts well over a
		// second, so this poll is not racing the completion.
		const status = page.locator('.prepare-status');
		const done = page.locator('.prepare-status.done');
		let reportedTotal = 0;
		while ((await done.count()) === 0) {
			const text = (await status.count()) > 0 ? await status.first().innerText() : '';
			const match = /preparing (\d+) \/ (\d+) bands/.exec(text);
			if (match) reportedTotal = Math.max(reportedTotal, Number(match[2]));
			if (reportedTotal > 0) break;
		}

		await expect(done).toBeVisible({ timeout: 180_000 });
		await expect(done).toContainText('ready');

		// The discriminating assertions: a run that merged nothing fails both.
		expect(reportedTotal).toBeGreaterThanOrEqual(BAND_FLOOR);
		expect(await mergedBandCount(page)).toBeGreaterThanOrEqual(BAND_FLOOR);

		expect(errors).toEqual([]);
	});

	test('Cancel stops a run in flight and publishes nothing', async ({ page }) => {
		const errors = await openDesigner(page);

		await page.getByRole('button', { name: 'Prepare Download' }).click();
		const cancel = page.getByRole('button', { name: 'Cancel' });
		await expect(cancel).toBeVisible({ timeout: 60_000 });
		await cancel.click();

		// Back to idle, with no readout and nothing published. The wait covers the
		// window in which a cancel that lost its race with the run's final
		// response could still have tried to land a result.
		await expect(page.getByRole('button', { name: 'Prepare Download' })).toBeEnabled();
		await expect(page.locator('.prepare-status')).toHaveCount(0);
		await page.waitForTimeout(5_000);
		await expect(page.locator('.prepare-status')).toHaveCount(0);
		expect(await mergedBandCount(page)).toBe(0);

		expect(errors).toEqual([]);
	});

	test('Download SVG auto-preps for the outlined pattern type', async ({ page }) => {
		const errors = await openDesigner(page);

		// The auto-prep branch is gated on `patternTypeConfig.type === 'outlined'`;
		// the default config is tiled. Switching type also invalidates, which is
		// what leaves `mergedBandPaths` empty for the branch to fire on.
		//
		// These two clicks must be forced: the hover-sidebar rail
		// (`.hover-button-container`) overlays the right-hand pane's tab bar and
		// permanently intercepts pointer events, so an ordinary click retries
		// until it times out rather than ever landing.
		await page.getByRole('button', { name: 'Pattern', exact: true }).click({ force: true });
		await page.getByRole('button', { name: 'Outlined', exact: true }).click({ force: true });
		await expect(page.locator('g[id^="band-"]').first()).toBeVisible({ timeout: 60_000 });

		// Let the pattern settle before prepping. A regeneration landing mid-run
		// invalidates, which cancels the auto-prep and correctly suppresses the
		// export — right behaviour, but it would make this test flaky.
		await settleBandCount(page);
		expect(await mergedBandCount(page)).toBe(0);

		await setPageLayout(page);

		// The handler awaits the prepare before exporting, so the download only
		// fires once the merge has landed.
		const download = page.waitForEvent('download', { timeout: 180_000 });
		await page.getByRole('button', { name: 'Download SVG' }).click();
		await download;

		expect(await mergedBandCount(page)).toBeGreaterThanOrEqual(BAND_FLOOR);
		expect(errors).toEqual([]);
	});
});
