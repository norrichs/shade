import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * End-to-end cover for pattern post-processing 2: geometry tagging + layer
 * colors, connect-surround outline gaps, disconnect-surround lines, page
 * labels, and the Download button's SVG/LightBurn split.
 *
 * As in `hole-drop.spec.ts` / `prepare-download.spec.ts`, the pattern pane is
 * empty on a fresh `/designer2` (default `patternSource` is `projection` with
 * no tubes), so every test first switches Geometry to Voronoi and settles the
 * band count.
 *
 * The default page layout (12in page, 0.6562 scale) overflows the default
 * Voronoi model and hides page layout entirely, so `beforeEach` also widens
 * the page and sets `pageScale: 1` — otherwise `exportPagesStore` (which
 * gates every download, see `NavHeader.svelte`'s `handleDownload`) stays
 * null and every download attempt just toasts an error.
 */

const selectVoronoiGeometry = async (page: Page): Promise<void> => {
	const rail = page.locator('button', { hasText: /atternl/i }).first();
	await rail.click();
	await page.locator('label:has-text("Geometry") select').first().selectOption('voronoi');
	await expect(page.locator('g[id^="band-"]').first()).toBeVisible({ timeout: 60_000 });
	await rail.click({ force: true });
};

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
 * Switch pattern layout to page mode and widen the page so the default
 * Voronoi model actually fits on it. Done via the store, with new object
 * references throughout (a known pre-existing reactivity quirk ignores
 * in-place mutation of `pageLayout`).
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

const setPostProcess = (page: Page, patch: Record<string, unknown>) =>
	page.evaluate(
		async ([specifier, p]) => {
			const stores = (await import(/* @vite-ignore */ specifier as string)) as {
				patternConfigStore: { update: (fn: (c: any) => any) => void };
			};
			stores.patternConfigStore.update((c: any) => ({
				...c,
				patternConfig: {
					...c.patternConfig,
					postProcess: { ...c.patternConfig.postProcess, ...(p as object) }
				}
			}));
		},
		['/src/lib/stores/index.ts', patch] as const
	);

const prepare = async (page: Page) => {
	await page.getByRole('button', { name: 'Prepare Download' }).click();
	await expect(page.locator('.prepare-status.done')).toBeVisible({ timeout: 120_000 });
};

test.describe('post-processing 2', () => {
	test.setTimeout(240_000);

	test.beforeEach(async ({ page }) => {
		await page.goto('/designer2');
		await selectVoronoiGeometry(page);
		await settleBandCount(page);
		await setPageLayout(page);
	});

	test('tags, colors, gaps, disconnects and page labels render', async ({ page }) => {
		await prepare(page);
		await setPostProcess(page, {
			disconnectSurround: true,
			connectSurround: { enabled: true, gapMm: 1.5 },
			pageLabel: { pageNumber: true, configName: false, text: 'test' }
		});
		await expect(page.locator('[data-geometry="surround-disconnect"]').first()).toBeVisible();
		expect(await page.locator('[data-geometry="outline-gap"]').count()).toBeGreaterThan(0);
		expect(await page.locator('[data-geometry="page-label"]').count()).toBeGreaterThan(0);
		expect(
			await page.locator('path[data-geometry="outline-gap"]').first().getAttribute('stroke')
		).toBe('#0000FF');
		await expect(page.locator('.prepare-status.done')).toBeVisible(); // no re-merge
	});

	test('SVG download is millimetre-true and stamped', async ({ page }) => {
		await prepare(page);
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Download SVG' }).click()
		]);
		expect(download.suggestedFilename()).toMatch(/ - \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}\.svg$/);
		const svg = await readFile((await download.path())!, 'utf8');
		expect(svg).toMatch(/<svg[^>]*width="[\d.]+mm"/);
		expect(svg).not.toMatch(/<path(?![^>]*data-geometry)[^>]*>/);
	});

	test('LightBurn download has one group per page', async ({ page }) => {
		await prepare(page);
		await setPostProcess(page, { downloadFormat: 'lbrn2' });
		const pages = await page.locator('g.page-geometry').count();
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Download LightBurn' }).click()
		]);
		expect(download.suggestedFilename()).toMatch(/\.lbrn2$/);
		const xml = await readFile((await download.path())!, 'utf8');
		expect(xml).toContain('<LightBurnProject');
		expect((xml.match(/<Shape Type="Group"/g) ?? []).length).toBe(pages);
	});

	test('download auto-prepares an unprepared tiled pattern', async ({ page }) => {
		const [download] = await Promise.all([
			page.waitForEvent('download', { timeout: 120_000 }),
			page.getByRole('button', { name: 'Download SVG' }).click()
		]);
		expect(download.suggestedFilename()).toMatch(/\.svg$/);
	});
});
