import { expect } from '@playwright/test';
import { test } from './app';

test('phone Settings edits account, password and House and signs out every device', async ({
	page,
	browser,
	context,
	app
}) => {
	const password = 'a calm willow house';
	const replacement = 'a new cedar house password';
	const errors: string[] = [];
	const externalRequests: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('request', (request) => {
		if (new URL(request.url()).origin !== app.url) externalRequests.push(request.url());
	});
	await page.request.post('/setup', {
		form: {
			code: app.setupCode,
			houseName: 'Willow House',
			currency: 'USD',
			memberName: 'Morgan',
			email: 'morgan@example.com',
			password
		},
		headers: { origin: app.url }
	});
	const other = await browser.newContext();
	try {
		await other.request.post(`${app.url}/sign-in`, {
			form: { email: 'morgan@example.com', password },
			headers: { origin: app.url }
		});
		await page.goto('/settings');
		await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
		const account = page.getByRole('region', { name: 'My account' });
		const security = page.getByRole('region', { name: 'Change password' });
		const sessions = page.getByRole('region', { name: 'My sessions' });
		const house = page.getByRole('region', { name: 'House', exact: true });
		await expect(account.getByText('Email not verified.', { exact: false })).toBeVisible();
		await expect(sessions.getByRole('listitem')).toHaveCount(2);
		await expect(sessions.getByText('This device', { exact: true })).toHaveCount(1);
		await expect(sessions.getByText('Last seen', { exact: false }).first()).toBeVisible();
		await expect(sessions.getByText('Chrome · Android').first()).toBeVisible();
		const rejected = await page.request.post('/settings?/profile', {
			form: { name: 'Intruder', email: 'intruder@example.com' },
			headers: { origin: 'https://untrusted.example' }
		});
		expect(rejected.status()).toBe(403);

		await account.getByLabel('Your name').fill('Morgan Taylor');
		await account.getByLabel('Email', { exact: true }).fill('NEW@EXAMPLE.COM');
		await account.getByRole('button', { name: 'Save account' }).click();
		await expect(account.getByRole('status')).toHaveText('Account saved.');
		await expect(account.getByLabel('Email', { exact: true })).toHaveValue('new@example.com');
		await expect(page.locator('.member-name')).toHaveText('Morgan Taylor');
		await page.reload();
		await expect(account.getByLabel('Your name')).toHaveValue('Morgan Taylor');

		await security.getByLabel('Current password', { exact: true }).fill('incorrect');
		await security.getByLabel('New password', { exact: true }).fill(replacement);
		await security.getByRole('button', { name: 'Change password' }).click();
		await expect(security.getByRole('alert')).toHaveText('Current password is incorrect.');
		await expect(security.getByRole('alert')).toBeInViewport();
		await expect(security.getByLabel('Current password', { exact: true })).toHaveValue('');
		await expect(security.getByLabel('New password', { exact: true })).toHaveValue('');
		await security.getByLabel('Current password', { exact: true }).fill(password);
		await security.getByLabel('New password', { exact: true }).fill('short');
		await security.getByRole('button', { name: 'Change password' }).click();
		await expect(security.getByRole('alert')).toHaveText(
			'Use a password with at least 12 characters.'
		);
		await security.getByLabel('Current password', { exact: true }).fill(password);
		await security.getByLabel('New password', { exact: true }).fill(replacement);
		await security.getByRole('button', { name: 'Change password' }).click();
		await expect(security.getByRole('status')).toHaveText('Password changed.');
		await expect(security.getByRole('status')).toBeInViewport();
		await expect(security.getByLabel('New password', { exact: true })).toHaveValue('');

		await house.getByLabel('House name').fill('Cedar House');
		await house.getByRole('button', { name: 'Save House name' }).click();
		await expect(house.getByRole('status')).toHaveText('House name saved.');
		await expect(house.getByRole('status')).toBeInViewport();
		await expect(page.locator('.house-name')).toHaveText('Cedar House');
		await page.reload();
		await expect(house.getByLabel('House name')).toHaveValue('Cedar House');
		for (const width of [320, 393]) {
			await page.setViewportSize({ width, height: 851 });
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
				width
			);
		}
		await sessions.getByRole('button', { name: 'Sign out all devices' }).click();
		await expect(page).toHaveURL(/\/sign-in$/);
		expect(
			(await context.cookies()).find((cookie) => cookie.name === 'housebook_session')
		).toBeUndefined();
		const otherVisit = await other.request.get(`${app.url}/settings`, { maxRedirects: 0 });
		expect(otherVisit.headers().location).toBe('/sign-in');

		await page.getByLabel('Email', { exact: true }).fill('new@example.com');
		await page.getByLabel('Password', { exact: true }).fill(password);
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
		await page.getByLabel('Password', { exact: true }).fill(replacement);
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await expect(page).toHaveURL(/\/items$/);
		await page.goto('/settings');
		await expect(sessions.getByRole('listitem')).toHaveCount(1);
		expect(externalRequests).toEqual([]);
		expect(errors).toEqual([]);
	} finally {
		await other.close();
	}
});
