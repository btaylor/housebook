import { expect } from '@playwright/test';
import { test } from './app';

const setup = {
	houseName: 'Willow House',
	currency: 'USD',
	memberName: 'Morgan',
	email: 'morgan@example.com',
	password: 'a calm willow house'
};

test('phone Item journey adds every field, finds by search and category, opens and edits', async ({
	page,
	app
}) => {
	const errors: string[] = [];
	const externalRequests: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('request', (request) => {
		if (new URL(request.url()).origin !== app.url) externalRequests.push(request.url());
	});
	await page.request.post('/setup', {
		form: { ...setup, code: app.setupCode },
		headers: { origin: app.url }
	});
	await page.goto('/items');
	await expect(page.getByText('Your House’s story starts here.')).toBeVisible();
	await page.getByRole('link', { name: 'Add Item', exact: true }).click();
	await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('required', '');
	await expect(page.getByLabel('Category', { exact: true })).toHaveAttribute('required', '');
	expect((await page.getByLabel('Notes', { exact: true }).boundingBox())!.width).toBe(
		(await page.getByLabel('Name', { exact: true }).boundingBox())!.width
	);
	const initial = {
		Name: 'Water heater',
		Location: 'Utility room',
		Make: 'Rheem',
		Model: 'XE50',
		'Serial number': 'WH-001',
		'Install date': '2024-02-29',
		'Warranty end date': '2099-02-28',
		Notes: 'Shutoff valve is above the tank.\nKeep access clear.'
	};
	for (const [label, value] of Object.entries(initial)) {
		await page.getByLabel(label, { exact: true }).fill(value);
	}
	await page.getByLabel('Category', { exact: true }).selectOption('plumbing');
	await page.getByRole('button', { name: 'Add Item', exact: true }).click();
	await expect(page.getByRole('heading', { name: initial.Name, exact: true })).toBeVisible();
	const itemUrl = page.url();
	await expect(page.getByText('Warranty active', { exact: true })).toBeVisible();
	await expect(page.locator('time')).toHaveAttribute('datetime', initial['Warranty end date']);
	await expect(
		page.getByRole('navigation').getByRole('link', { name: 'Items', exact: true })
	).toHaveAttribute('aria-current', 'page');
	await page.getByRole('link', { name: '← Items', exact: true }).click();
	await page.getByLabel('Search by name').fill('WATER');
	await page.getByLabel('Category', { exact: true }).selectOption('HVAC');
	await page.getByRole('button', { name: 'Find Items' }).click();
	await expect(page.getByText('No matching Items.')).toBeVisible();
	await page.getByLabel('Category', { exact: true }).selectOption('plumbing');
	await page.getByRole('button', { name: 'Find Items' }).click();
	await expect(page.getByRole('status')).toHaveText('1 Item');
	await page.getByRole('link', { name: 'Water heater plumbing · Utility room' }).click();
	await expect(page).toHaveURL(itemUrl);
	await page.getByRole('link', { name: 'Edit Item', exact: true }).click();
	for (const [label, value] of Object.entries(initial)) {
		await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
	}
	const edited = {
		Name: 'Kitchen dishwasher',
		Location: 'Kitchen',
		Make: 'Bosch',
		Model: '800',
		'Serial number': 'DW-002',
		'Install date': '2025-03-09',
		'Warranty end date': '2025-11-02',
		Notes: 'Use the eco cycle.\nClean the filter monthly.'
	};
	for (const [label, value] of Object.entries(edited)) {
		await page.getByLabel(label, { exact: true }).fill(value);
	}
	await page.getByLabel('Category', { exact: true }).selectOption('appliance');
	await page.getByRole('button', { name: 'Save Item', exact: true }).click();
	await expect(page).toHaveURL(itemUrl);
	await page.reload();
	await expect(page.getByRole('heading', { name: edited.Name, exact: true })).toBeVisible();
	await expect(page.getByText('Warranty ended', { exact: true })).toBeVisible();
	for (const value of [
		edited.Make,
		edited.Model,
		edited['Serial number'],
		edited['Install date']
	]) {
		await expect(page.getByText(value, { exact: true })).toBeVisible();
	}
	await expect(page.getByText(edited.Notes, { exact: true })).toBeVisible();
	await expect(page.locator('time')).toHaveText(edited['Warranty end date']);
	for (const width of [320, 393, 1280]) {
		await page.setViewportSize({ width, height: 851 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);
	}
	expect(errors).toEqual([]);
	expect(externalRequests).toEqual([]);
});

test('Item forms preserve invalid submissions, allow clearing optional fields and guard writes', async ({
	page,
	browser,
	app
}) => {
	await page.request.post('/setup', {
		form: { ...setup, code: app.setupCode },
		headers: { origin: app.url }
	});
	const outsider = await browser.newContext();
	try {
		for (const path of ['/items/new', '/items/missing', '/items/missing/edit']) {
			const response = await outsider.request.post(`${app.url}${path}`, {
				form: { name: 'Untrusted Item', category: 'other' },
				headers: { origin: app.url, accept: 'text/html' },
				maxRedirects: 0
			});
			expect(response.status()).toBe(303);
			expect(response.headers().location).toBe('/sign-in');
		}
	} finally {
		await outsider.close();
	}
	const csrf = await page.request.post('/items/new', {
		form: { name: 'Untrusted Item', category: 'other' },
		headers: { origin: 'https://untrusted.example' }
	});
	expect(csrf.status()).toBe(403);
	for (const path of ['/items/missing', '/items/missing/edit']) {
		expect((await page.request.get(path)).status()).toBe(404);
	}
	const invalid = await page.request.post('/items/new', {
		form: { name: 'Desk', category: 'invalid' },
		headers: { origin: app.url }
	});
	expect(invalid.status()).toBe(400);
	expect(await invalid.text()).toContain('Choose a category from the list.');
	await page.goto('/items/new');
	await page.getByLabel('Name', { exact: true }).fill('   ');
	await page.getByLabel('Category', { exact: true }).selectOption('other');
	await page.getByLabel('Location', { exact: true }).fill('Study');
	await page.getByRole('button', { name: 'Add Item', exact: true }).click();
	await expect(page.getByRole('alert')).toHaveText('Enter an Item name.');
	await expect(page.getByLabel('Location', { exact: true })).toHaveValue('Study');
	await page.getByLabel('Name', { exact: true }).fill('Desk');
	await page.getByLabel('Warranty end date', { exact: true }).fill('2099-01-01');
	await page.getByRole('button', { name: 'Add Item', exact: true }).click();
	await expect(page.getByText('Warranty active', { exact: true })).toBeVisible();
	await page.getByRole('link', { name: 'Edit Item', exact: true }).click();
	await page.getByLabel('Location', { exact: true }).fill('');
	await page.getByLabel('Warranty end date', { exact: true }).fill('');
	await page.getByRole('button', { name: 'Save Item', exact: true }).click();
	await expect(page.getByText('No warranty end date recorded.', { exact: true })).toBeVisible();
	await expect(page.getByText('Warranty active', { exact: true })).toHaveCount(0);
	await page.getByRole('link', { name: 'Edit Item', exact: true }).click();
	await expect(page.getByLabel('Location', { exact: true })).toHaveValue('');
	await expect(page.getByLabel('Warranty end date', { exact: true })).toHaveValue('');
});
