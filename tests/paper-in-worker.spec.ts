import { expect, test } from '@playwright/test';

test('paper-core boolean ops run inside a Web Worker', async ({ page }) => {
	await page.goto('/sandbox-paper-worker');
	const output = page.getByTestId('probe-result');
	await expect(output).not.toHaveText('pending', { timeout: 30_000 });

	const result = JSON.parse((await output.textContent()) ?? '{}');
	expect(result.error).toBeUndefined();
	expect(result.ok).toBe(true);
	// Two squares overlapping by half union into ONE contour.
	expect(result.contours).toBe(1);
	expect(result.segments).toBeGreaterThan(3);
});
