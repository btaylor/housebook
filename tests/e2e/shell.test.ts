import { expect } from '@playwright/test';
import { test } from './app';

test.beforeEach(async ({ page, app }) => {
	const response = await page.request.post('/setup', {
		form: {
			code: app.setupCode,
			houseName: 'Willow House',
			currency: 'USD',
			memberName: 'Morgan',
			email: 'morgan@example.com',
			password: 'a calm willow house'
		},
		headers: { origin: app.url, accept: 'text/html' },
		maxRedirects: 0
	});
	expect(response.status()).toBe(303);
	await page.goto('/items');
});

for (const width of [320, 393, 1280]) {
	test(`navigation remains usable without horizontal scrolling at ${width}px`, async ({
		page,
		app
	}) => {
		await page.setViewportSize({ width, height: 800 });
		const externalRequests: string[] = [];
		const errors: string[] = [];
		page.on('request', (request) => {
			if (new URL(request.url()).origin !== app.url) externalRequests.push(request.url());
		});
		page.on('pageerror', (error) => errors.push(error.message));
		const navigation = page.getByRole('navigation', { name: 'Main navigation' });
		const destinations = [
			['Items', '/items'],
			['Maintenance Log', '/maintenance-log'],
			['Contractors', '/contractors'],
			['Settings', '/settings']
		];
		for (const [label, path] of destinations) {
			const link = navigation.getByRole('link', { name: label, exact: true });
			await expect(link).toBeVisible();
			await expect(link).toBeInViewport({ ratio: 1 });
			await link.click();
			await expect(page).toHaveURL(`${app.url}${path}`);
			await expect(page.getByRole('heading', { name: label, exact: true, level: 1 })).toBeVisible();
			await expect(link).toHaveAttribute('aria-current', 'page');
			await expect
				.poll(() =>
					page.evaluate(
						() => document.documentElement.scrollWidth <= document.documentElement.clientWidth
					)
				)
				.toBe(true);
		}
		expect(externalRequests).toEqual([]);
		expect(errors).toEqual([]);
	});
}

test('follows the device color preference and restores the light palette', async ({ page }) => {
	const backgroundToken = () =>
		page.evaluate(() =>
			getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
		);
	await page.emulateMedia({ colorScheme: 'light' });
	const lightBackground = await backgroundToken();
	expect(lightBackground).not.toBe('');
	await page.emulateMedia({ colorScheme: 'dark' });
	await expect.poll(backgroundToken).not.toBe(lightBackground);
	await page.emulateMedia({ colorScheme: 'light' });
	await expect.poll(backgroundToken).toBe(lightBackground);
});
