import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end cover for dropping internal holes.
 *
 * The claim under test is the one the whole two-stage split exists for: a
 * change to the hole-drop config re-renders WITHOUT re-running the merge. So
 * every assertion here is a pair — the rendered paths must change while the raw
 * merge behind them stays byte-identical and the prepared readout never returns
 * to idle.
 *
 * As in `prepare-download.spec.ts`, the pattern pane is empty on a fresh
 * `/designer2`, so each test first switches Geometry to Voronoi and waits for
 * real bands.
 */

const BAND_FLOOR = 20; // the default Voronoi config yields 60

/** Total segment counts of both stores, read from the live module graph. */
const segmentTotals = (page: Page): Promise<{ raw: number; rendered: number; bands: number }> =>
	page.evaluate(async (specifier: string) => {
		const stores = (await import(/* @vite-ignore */ specifier)) as {
			mergedBandPaths: { subscribe: (run: (p: Map<string, unknown[]>) => void) => () => void };
			mergedBandPathsRaw: { subscribe: (run: (p: Map<string, unknown[]>) => void) => () => void };
		};
		const readTotal = (store: {
			subscribe: (run: (p: Map<string, unknown[]>) => void) => () => void;
		}) => {
			let total = -1;
			let bands = -1;
			store.subscribe((paths) => {
				bands = paths.size;
				total = 0;
				for (const path of paths.values()) total += path.length;
			})();
			return { total, bands };
		};
		const rendered = readTotal(stores.mergedBandPaths);
		const raw = readTotal(stores.mergedBandPathsRaw);
		return { raw: raw.total, rendered: rendered.total, bands: rendered.bands };
	}, '/src/lib/stores/index.ts');

const selectVoronoiGeometry = async (page: Page): Promise<void> => {
	const rail = page.locator('button', { hasText: /atternl/i }).first();
	await rail.click();
	await page.locator('label:has-text("Geometry") select').first().selectOption('voronoi');
	await expect(page.locator('g[id^="band-"]').first()).toBeVisible({ timeout: 60_000 });
	await rail.click({ force: true });
};

/** Wait until pattern generation settles, so a prepare is not cancelled. */
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

/** Open the Post Process floater and return its mode select. */
const openPostProcess = async (page: Page) => {
	// The rail button renders its accelerator letter in a separate span, so it is
	// matched by a substring of the remainder rather than by exact name.
	await page
		.locator('button', { hasText: /rocess/i })
		.first()
		.click();
	return page.locator('.labeled-control', { hasText: 'Drop internal holes' }).locator('select');
};

const prepare = async (page: Page) => {
	await page.getByRole('button', { name: 'Prepare Download' }).click();
	const done = page.locator('.prepare-status.done');
	await expect(done).toBeVisible({ timeout: 180_000 });
	await expect(done).toContainText('ready');
	return done;
};

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

test.describe('dropping internal holes', () => {
	test.setTimeout(240_000);

	test('drop all removes geometry without re-running the merge', async ({ page }) => {
		const errors = await openDesigner(page);
		const done = await prepare(page);

		const before = await segmentTotals(page);
		expect(before.bands).toBeGreaterThanOrEqual(BAND_FLOOR);
		expect(before.rendered).toBe(before.raw);

		const mode = await openPostProcess(page);
		await mode.selectOption('all');

		// Rendered paths shrink; the raw merge behind them is untouched; and the
		// prepared readout never went back to idle, so no re-prepare happened.
		await expect
			.poll(async () => (await segmentTotals(page)).rendered, { timeout: 30_000 })
			.toBeLessThan(before.rendered);
		const after = await segmentTotals(page);
		expect(after.raw).toBe(before.raw);
		expect(after.bands).toBe(before.bands);
		await expect(done).toBeVisible();
		await expect(done).toContainText('ready');

		expect(errors).toEqual([]);
	});

	test('reroll changes the drop without re-running the merge', async ({ page }) => {
		const errors = await openDesigner(page);
		const done = await prepare(page);

		const before = await segmentTotals(page);
		const mode = await openPostProcess(page);
		await mode.selectOption('random');

		await expect
			.poll(async () => (await segmentTotals(page)).rendered, { timeout: 30_000 })
			.toBeLessThan(before.rendered);
		const randomised = await segmentTotals(page);

		await page.getByRole('button', { name: 'Reroll' }).click();

		// A different arrangement of the same band set, off the same raw merge.
		await expect
			.poll(async () => (await segmentTotals(page)).rendered, { timeout: 30_000 })
			.not.toBe(randomised.rendered);
		const rerolled = await segmentTotals(page);
		expect(rerolled.raw).toBe(before.raw);
		await expect(done).toContainText('ready');

		expect(errors).toEqual([]);
	});

	test('returning to none restores the merged paths exactly', async ({ page }) => {
		const errors = await openDesigner(page);
		await prepare(page);

		const before = await segmentTotals(page);
		const mode = await openPostProcess(page);
		await mode.selectOption('all');
		await expect
			.poll(async () => (await segmentTotals(page)).rendered, { timeout: 30_000 })
			.toBeLessThan(before.rendered);

		await mode.selectOption('none');
		await expect
			.poll(async () => (await segmentTotals(page)).rendered, { timeout: 30_000 })
			.toBe(before.rendered);

		expect(errors).toEqual([]);
	});
});
