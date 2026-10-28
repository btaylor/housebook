import { expect } from '@playwright/test';
import { test } from './app';

test('phone Contractor creation, editing, contact links, Archive and un-Archive', async ({
	page,
	app
}) => {
	const editedName = 'Maple Review Heating & Cooling';
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
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
	await page.goto('/contractors');
	await expect(page.getByRole('checkbox', { name: 'Show Archived' })).not.toBeChecked();
	await page.getByRole('link', { name: 'Add Contractor' }).click();
	await expect(
		page.getByRole('navigation').getByRole('link', { name: 'Contractors', exact: true })
	).toHaveAttribute('aria-current', 'page');
	await page.getByLabel('Name').fill('   ');
	await page.getByLabel('Phone').fill('+1 415 555 0123');
	await page.getByLabel('Email', { exact: true }).fill('lee@example.com');
	await page.getByLabel('Trade').fill('Plumbing');
	await page.getByLabel('Notes').fill('Shutoff beside the garage.\nAsk for Lee.');
	await page.getByRole('button', { name: 'Save Contractor' }).click();
	await expect(page.getByRole('alert')).toHaveText('Enter a Contractor name.');
	await expect(page.getByLabel('Phone')).toHaveValue('+1 415 555 0123');
	await page.getByLabel('Name').fill('Willow Plumbing');
	await page.getByRole('button', { name: 'Save Contractor' }).click();
	await expect(page.getByRole('heading', { name: 'Willow Plumbing' })).toBeVisible();
	const detailURL = page.url();
	await expect(page.getByRole('link', { name: '+1 415 555 0123' })).toHaveAttribute(
		'href',
		'tel:+1 415 555 0123'
	);
	await expect(page.getByRole('link', { name: 'lee@example.com' })).toHaveAttribute(
		'href',
		'mailto:lee@example.com'
	);
	await expect(page.getByText('Shutoff beside the garage.\nAsk for Lee.')).toBeVisible();
	await page.getByRole('link', { name: 'Edit Contractor' }).click();
	await expect(page.getByLabel('Name')).toHaveValue('Willow Plumbing');
	await page.getByLabel('Name').fill(editedName);
	await page.getByLabel('Notes').fill('Annual furnace check. Ask for Lee.');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('heading', { name: editedName })).toBeVisible();
	await page.getByRole('button', { name: 'Archive Contractor', exact: true }).click();
	await expect(page).toHaveURL(/\/contractors$/);
	await expect(page.getByRole('link', { name: editedName })).toHaveCount(0);
	await page.getByRole('checkbox', { name: 'Show Archived' }).check();
	await expect(page).toHaveURL(/archived=1/);
	await page.reload();
	await expect(page.getByRole('checkbox', { name: 'Show Archived' })).toBeChecked();
	for (const width of [393, 320]) {
		await page.setViewportSize({ width, height: 850 });
		const badgeLines = await page.getByText('Archived', { exact: true }).evaluate((badge) => {
			const range = document.createRange();
			range.selectNodeContents(badge);
			return range.getClientRects().length;
		});
		expect(badgeLines).toBe(1);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);
	}
	await page.getByRole('link', { name: new RegExp(editedName) }).click();
	await expect(page.getByText('Archived on', { exact: false })).toBeVisible();
	await expect(page.getByText('Annual furnace check. Ask for Lee.')).toBeVisible();
	await page.getByRole('button', { name: 'Un-Archive Contractor' }).click();
	await expect(page.getByText('Archived on', { exact: false })).toHaveCount(0);
	await page.goto('/contractors');
	await expect(page.getByRole('checkbox', { name: 'Show Archived' })).not.toBeChecked();
	await expect(page.getByRole('link', { name: new RegExp(editedName) })).toBeVisible();
	await page.goto(detailURL);
	for (const width of [320, 393, 1280]) {
		await page.setViewportSize({ width, height: 850 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);
	}
	expect((await page.goto('/contractors/missing'))?.status()).toBe(404);
	expect(errors).toEqual([]);
});
