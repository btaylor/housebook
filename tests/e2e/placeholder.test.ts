import { expect, test } from '@playwright/test';

test('serves the placeholder on a phone without external requests', async ({ page, baseURL }) => {
	const externalRequests: string[] = [];
	const errors: string[] = [];
	page.on('request', (request) => {
		if (new URL(request.url()).origin !== new URL(baseURL!).origin) {
			externalRequests.push(request.url());
		}
	});
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});

	await page.goto('/');
	await expect(page).toHaveTitle('Housebook');
	await expect(page.getByRole('heading', { name: 'Housebook', level: 1 })).toBeVisible();
	await expect(
		page.getByText('Housebook is running. Your House’s story starts here.')
	).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
		page.viewportSize()!.width
	);
	expect(externalRequests).toEqual([]);
	expect(errors).toEqual([]);
});
