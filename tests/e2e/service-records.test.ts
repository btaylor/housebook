import { expect } from '@playwright/test';
import { test } from './app';

test('logs Contractor work on two Items and keeps every history in sync through edits and deletion', async ({
	page,
	app
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const headers = { origin: app.url, accept: 'text/html' };
	await page.request.post('/setup', {
		form: {
			code: app.setupCode,
			houseName: 'Willow House',
			currency: 'GBP',
			memberName: 'Morgan',
			email: 'morgan@example.com',
			password: 'a calm willow house'
		},
		headers
	});
	const itemUrls: string[] = [];
	for (const [name, category] of [
		['Furnace', 'HVAC'],
		['Water heater', 'plumbing']
	]) {
		const response = await page.request.post('/items/new', { form: { name, category }, headers });
		expect(response.ok()).toBe(true);
		itemUrls.push(response.url());
	}
	const contractor = await page.request.post('/contractors/new', {
		form: { name: 'Willow Plumbing' },
		headers
	});
	const contractorUrl = contractor.url();
	await page.goto(itemUrls[0]);
	await page.getByRole('link', { name: 'Log work', exact: true }).click();
	await expect(page.getByRole('checkbox', { name: 'Furnace', exact: true })).toBeChecked();
	await expect(page.getByRole('checkbox', { name: 'Water heater', exact: true })).not.toBeChecked();
	await page.getByLabel('Date', { exact: false }).fill('2026-02-01');
	await page.getByLabel('Done by').selectOption({ label: 'Willow Plumbing' });
	await page.getByLabel('Notes').fill('Annual service of furnace and water heater.');
	await page.getByLabel('Cost (GBP)').fill('123.456');
	await page.getByRole('checkbox', { name: 'Water heater', exact: true }).check();
	await page.getByRole('button', { name: 'Save Service Record' }).click();
	await expect(page.getByRole('alert')).toHaveText(
		'Enter a non-negative cost with at most two decimal places.'
	);
	await expect(page.getByRole('checkbox', { name: 'Furnace', exact: true })).toBeChecked();
	await expect(page.getByRole('checkbox', { name: 'Water heater', exact: true })).toBeChecked();
	await expect(page.getByLabel('Done by')).toHaveValue(/contractor:/);
	await page.getByLabel('Cost (GBP)').fill('123.45');
	await page.getByRole('button', { name: 'Save Service Record' }).click();
	await expect(page.getByRole('heading', { name: 'Service Record', exact: true })).toBeVisible();
	const recordUrl = page.url();
	await expect(page.getByText('£123.45', { exact: true })).toBeVisible();
	for (const [name, url] of [
		['Furnace', itemUrls[0]],
		['Water heater', itemUrls[1]]
	]) {
		await page.getByRole('link', { name, exact: true }).click();
		await expect(page).toHaveURL(url);
		await page.getByRole('link', { name: /Annual service of furnace/ }).click();
		await expect(page).toHaveURL(recordUrl);
	}
	await page.getByRole('link', { name: 'Willow Plumbing', exact: true }).click();
	await expect(page).toHaveURL(contractorUrl);
	await expect(page.getByRole('link', { name: /Annual service of furnace/ })).toBeVisible();
	await page.getByRole('button', { name: 'Archive Contractor', exact: true }).click();
	await page.goto('/maintenance-log/new');
	await expect(page.getByRole('option', { name: /Willow Plumbing/ })).toHaveCount(0);
	await page.getByLabel('Date', { exact: false }).fill('2026-02-02');
	await page.getByLabel('Done by').selectOption({ label: 'Morgan' });
	await page.getByLabel('Notes').fill('Whole House inspection.');
	await page.getByRole('button', { name: 'Save Service Record' }).click();
	await expect(page.getByText('Whole House', { exact: true })).toBeVisible();
	await expect(page.getByText('Not recorded', { exact: true })).toBeVisible();
	await page.goto('/maintenance-log');
	const records = page.locator('.service-record-list li');
	await expect(records).toHaveCount(2);
	await expect(records.first()).toContainText('2026-02-02');
	await expect(records.last()).toContainText('Willow Plumbing (Archived)');
	await page.getByRole('link', { name: /Annual service of furnace/ }).click();
	await page.getByRole('link', { name: 'Edit Service Record' }).click();
	await expect(page.getByLabel('Cost (GBP)')).toHaveValue('123.45');
	await expect(page.getByLabel('Done by')).toHaveValue(/contractor:/);
	await expect(
		page.getByRole('option', { name: 'Willow Plumbing (Archived · current)' })
	).toHaveCount(1);
	await page.getByLabel('Notes').fill('Annual service corrected.');
	await page.getByRole('checkbox', { name: 'Water heater', exact: true }).uncheck();
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByText('Annual service corrected.', { exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Willow Plumbing', exact: true })).toBeVisible();
	await page.goto(itemUrls[1]);
	await expect(page.getByRole('heading', { name: 'No Service Records yet' })).toBeVisible();
	await page.goto(recordUrl);
	for (const width of [320, 393, 1280]) {
		await page.setViewportSize({ width, height: 850 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);
	}
	await page.getByText('Delete Service Record', { exact: true }).click();
	await page.getByRole('button', { name: 'Confirm deletion' }).click();
	await expect(page).toHaveURL(/\/maintenance-log$/);
	await expect(page.getByRole('link', { name: /Annual service/ })).toHaveCount(0);
	for (const url of [itemUrls[0], contractorUrl]) {
		await page.goto(url);
		await expect(page.getByRole('heading', { name: 'No Service Records yet' })).toBeVisible();
	}
	expect((await page.goto(recordUrl))?.status()).toBe(404);
	expect((await page.goto(`${recordUrl}/edit`))?.status()).toBe(404);
	expect(errors).toEqual([]);
});

test('Service Record routes guard writes and report invalid performers and missing records', async ({
	page,
	request,
	app
}) => {
	const input = { date: '2026-01-01', notes: 'Untrusted record' };
	await page.request.post('/setup', {
		form: {
			code: app.setupCode,
			houseName: 'Willow House',
			currency: 'USD',
			memberName: 'Morgan',
			email: 'morgan@example.com',
			password: 'a calm willow house'
		},
		headers: { origin: app.url, accept: 'text/html' }
	});
	for (const path of [
		'/maintenance-log/new',
		'/maintenance-log/missing/edit',
		'/maintenance-log/missing?/document',
		'/maintenance-log/missing?/delete'
	]) {
		const response = await request.post(path, {
			form: input,
			headers: { origin: app.url, accept: 'text/html' },
			maxRedirects: 0
		});
		expect(response.status()).toBe(303);
		expect(response.headers().location).toBe('/sign-in');
	}
	expect(
		(
			await page.request.post('/maintenance-log/new', {
				form: input,
				headers: { origin: 'https://untrusted.example' }
			})
		).status()
	).toBe(403);
	const invalid = await page.request.post('/maintenance-log/new', {
		form: input,
		headers: { origin: app.url }
	});
	expect(invalid.status()).toBe(400);
	expect(await invalid.text()).toContain('Choose exactly one Contractor or Member');
	expect((await page.request.get('/maintenance-log/new?item=missing')).status()).toBe(404);
});
