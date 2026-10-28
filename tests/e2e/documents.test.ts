import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect } from '@playwright/test';
import { test } from './app';

const fixtures = resolve('tests/fixtures');
const setup = {
	houseName: 'Willow House',
	currency: 'USD',
	memberName: 'Morgan',
	email: 'morgan@example.com',
	password: 'a calm willow house'
};

test('phone journey adds an Item with a photo and a PDF Document, then views and manages them', async ({
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
	await page.goto('/items/new');
	await page.getByLabel('Name', { exact: true }).fill('Water heater');
	await page.getByLabel('Category', { exact: true }).selectOption('plumbing');
	await page.getByLabel('Location', { exact: true }).fill('Utility room');
	await expect(page.getByLabel('Take photo', { exact: true })).toHaveAttribute(
		'capture',
		'environment'
	);
	await page
		.getByLabel('Upload photo', { exact: true })
		.setInputFiles(resolve(fixtures, 'item-photo.png'));
	await page.getByRole('button', { name: 'Add Item', exact: true }).click();
	await expect(page.getByRole('img', { name: 'Main photo of Water heater' })).toBeVisible();
	const itemUrl = page.url();
	const originalPhoto = await page
		.getByRole('img', { name: 'Main photo of Water heater' })
		.getAttribute('src');
	const photoResponse = await page.request.get(originalPhoto!);
	expect(photoResponse.headers()['content-type']).toBe('image/png');
	expect(await photoResponse.body()).toEqual(readFileSync(resolve(fixtures, 'item-photo.png')));

	await page.locator('summary').filter({ hasText: 'Attach Document' }).click();
	await page.getByLabel('Document title', { exact: true }).fill('Owner’s manual');
	await page.getByLabel('Document', { exact: true }).setInputFiles(resolve(fixtures, 'manual.pdf'));
	await page.getByRole('button', { name: 'Attach Document', exact: true }).click();
	await expect(page.getByRole('status')).toHaveText('Document attached.');
	await page.getByRole('link', { name: 'Owner’s manual', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Owner’s manual', exact: true })).toBeVisible();
	const documentUrl = page.url();
	const fileUrl = await page.getByRole('link', { name: 'Open Document' }).getAttribute('href');
	const pdf = await page.request.get(fileUrl!);
	expect(pdf.status()).toBe(200);
	expect(pdf.headers()['content-type']).toBe('application/pdf');
	expect(pdf.headers()['content-disposition']).toMatch(/^inline;/);
	expect(pdf.headers()['x-content-type-options']).toBe('nosniff');
	expect(await pdf.body()).toEqual(readFileSync(resolve(fixtures, 'manual.pdf')));
	const downloadEvent = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download Document' }).click();
	const download = await downloadEvent;
	expect(download.suggestedFilename()).toBe('manual.pdf');
	const longTitle = 'Water-heater-warranty-and-manual'.repeat(5);
	await page.getByLabel('Document title', { exact: true }).fill(longTitle);
	await page.getByRole('button', { name: 'Rename Document' }).click();
	await expect(page.getByRole('heading', { name: longTitle, exact: true })).toBeVisible();
	await page.setViewportSize({ width: 320, height: 851 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
	await page.getByLabel('Document title', { exact: true }).fill('Warranty and manual');
	await page.getByRole('button', { name: 'Rename Document' }).click();
	await expect(
		page.getByRole('heading', { name: 'Warranty and manual', exact: true })
	).toBeVisible();
	await page.getByRole('link', { name: '← Item', exact: true }).click();
	await expect(page).toHaveURL(itemUrl);
	await expect(page.getByRole('link', { name: 'Warranty and manual' })).toBeVisible();
	await page.getByText('Replace photo', { exact: true }).click();
	await page
		.getByLabel('Upload photo', { exact: true })
		.setInputFiles(resolve(fixtures, 'item-photo.heic'));
	await page.getByRole('button', { name: 'Save photo', exact: true }).click();
	await expect(page.getByRole('status')).toHaveText('Photo saved.');
	const convertedPhoto = await page
		.getByRole('img', { name: 'Main photo of Water heater' })
		.getAttribute('src');
	const jpeg = await page.request.get(convertedPhoto!);
	expect(jpeg.headers()['content-type']).toBe('image/jpeg');
	expect((await jpeg.body()).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
	await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
	await expect(page.getByText('No photo recorded.', { exact: true })).toBeVisible();
	await page.goto(documentUrl);
	await page.getByLabel('Type DELETE to delete this Document permanently').fill('DELETE');
	await page.getByRole('button', { name: 'Delete Document', exact: true }).click();
	await expect(page).toHaveURL(itemUrl);
	await expect(page.getByText('No Documents attached.', { exact: true })).toBeVisible();
	expect((await page.request.get(fileUrl!)).status()).toBe(404);
	for (const width of [320, 393, 1280]) {
		await page.setViewportSize({ width, height: 851 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);
	}
	expect(errors).toEqual([]);
	expect(externalRequests).toEqual([]);
});

test('upload and file routes require a session and reject cross-origin writes', async ({
	page,
	browser,
	app
}) => {
	await page.request.post('/setup', {
		form: { ...setup, code: app.setupCode },
		headers: { origin: app.url }
	});
	await page.goto('/items/new');
	await page.getByLabel('Name', { exact: true }).fill('Water heater');
	await page.getByLabel('Category', { exact: true }).selectOption('plumbing');
	await page.getByRole('button', { name: 'Add Item', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Water heater', exact: true })).toBeVisible();
	const itemUrl = new URL(page.url()).pathname;
	const csrf = await page.request.post(`${itemUrl}?/document`, {
		multipart: {
			title: 'Manual',
			document: {
				name: 'manual.pdf',
				mimeType: 'application/pdf',
				buffer: readFileSync(resolve(fixtures, 'manual.pdf'))
			}
		},
		headers: { origin: 'https://untrusted.example' }
	});
	expect(csrf.status()).toBe(403);
	const outsider = await browser.newContext();
	try {
		for (const path of [`${itemUrl}/photo`, '/documents/missing', '/documents/missing/file']) {
			const response = await outsider.request.get(`${app.url}${path}`, { maxRedirects: 0 });
			expect(response.status()).toBe(303);
			expect(response.headers().location).toBe('/sign-in');
		}
		const response = await outsider.request.post(`${app.url}${itemUrl}?/photo`, {
			multipart: {
				photo: {
					name: 'item-photo.png',
					mimeType: 'image/png',
					buffer: readFileSync(resolve(fixtures, 'item-photo.png'))
				}
			},
			headers: { origin: app.url, accept: 'text/html' },
			maxRedirects: 0
		});
		expect(response.status()).toBe(303);
	} finally {
		await outsider.close();
	}
	const unsupported = await page.request.post(`${itemUrl}?/document`, {
		multipart: {
			title: 'Bad Document',
			document: { name: 'image.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') }
		},
		headers: { origin: app.url }
	});
	expect(unsupported.status()).toBe(400);
	expect(await unsupported.text()).toContain('Use a PDF, JPEG, PNG, or HEIC Document.');
	const oversized = await page.request.post(`${itemUrl}?/document`, {
		multipart: {
			title: 'Large Document',
			document: {
				name: 'manual.pdf',
				mimeType: 'application/pdf',
				buffer: Buffer.alloc(25 * 1024 * 1024 + 1)
			}
		},
		headers: { origin: app.url }
	});
	expect(oversized.status()).toBe(400);
	expect(await oversized.text()).toContain('Use a file of 25 MB or less.');
});
