import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
import { expect, type Browser, type Page } from '@playwright/test';
import { test } from './app';

const mutations = [
	'Service Record creation',
	'Service Record editing',
	'Item creation',
	'Item editing',
	'Contractor creation',
	'Contractor editing',
	'Invite revocation',
	'Item creation with a photo',
	'photo replacement',
	'Document attachment',
	'Service Record Document attachment',
	'Document renaming'
] as const;

for (const mutation of mutations) {
	test(`removed Members cannot finish suspended ${mutation}`, async ({ page, browser, app }) => {
		await suspendedMutation({ page, browser, app }, mutation, 'removal');
	});
}

for (const revocation of ['sign-out', 'sign-out-all'] as const) {
	test(`${revocation} prevents suspended Service Record creation`, async ({
		page,
		browser,
		app
	}) => {
		await suspendedMutation({ page, browser, app }, 'Service Record creation', revocation);
	});
}

async function suspendedMutation(
	{ page, browser, app }: { page: Page; browser: Browser; app: { url: string; setupCode: string } },
	mutation: (typeof mutations)[number],
	revocation: 'removal' | 'sign-out' | 'sign-out-all'
) {
	const headers = { origin: app.url, accept: 'text/html' };
	await page.request.post('/setup', {
		form: {
			code: app.setupCode,
			houseName: 'Willow House',
			currency: 'USD',
			memberName: 'Morgan',
			email: 'morgan@example.com',
			password: 'a calm willow house'
		},
		headers
	});
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Create Invite', exact: true }).click();
	const inviteUrl = await page.getByLabel('Invite link', { exact: true }).inputValue();
	const target = await browser.newContext({ userAgent: 'Mozilla/5.0 (Android) Firefox/140.0' });
	const observer = await browser.newContext();
	try {
		await target.request.post(inviteUrl, {
			form: {
				memberName: 'Jamie',
				email: 'jamie@example.com',
				password: 'another calm house'
			},
			headers
		});
		await observer.request.post(`${app.url}/sign-in`, {
			form: { email: 'jamie@example.com', password: 'another calm house' },
			headers
		});
		const sessions = await observer.newPage();
		await sessions.goto(`${app.url}/settings`);
		const targetActivity = sessions
			.getByRole('region', { name: 'My sessions' })
			.getByRole('listitem')
			.filter({ hasText: 'Firefox · Android' })
			.locator('time');
		const before = await targetActivity.getAttribute('datetime');
		expect(before).not.toBeNull();
		const item = await page.request.post('/items/new', {
			form: { name: 'Furnace', category: 'HVAC' },
			headers
		});
		const contractor = await page.request.post('/contractors/new', {
			form: { name: 'Willow Plumbing' },
			headers
		});
		await page.request.post(`${item.url()}?/document`, {
			multipart: {
				title: 'Manual',
				document: {
					name: 'manual.pdf',
					mimeType: 'application/pdf',
					buffer: readFileSync(resolve('tests/fixtures/manual.pdf'))
				}
			},
			headers
		});
		await page.goto(item.url());
		const documentLink = page.getByRole('link', { name: 'Manual', exact: true });
		await expect(documentLink).toHaveAttribute('href', /\/documents\//);
		const documentUrl = await documentLink.getAttribute('href');
		if (mutation === 'photo replacement') {
			await page.request.post(`${item.url()}?/photo`, {
				multipart: {
					photo: {
						name: 'item-photo.jpg',
						mimeType: 'image/jpeg',
						buffer: readFileSync(resolve('tests/fixtures/item-photo.jpg'))
					}
				},
				headers
			});
		}
		await page.goto('/maintenance-log/new');
		const performer = await page
			.getByRole('option', { name: 'Morgan', exact: true })
			.getAttribute('value');
		const record = await page.request.post('/maintenance-log/new', {
			form: { date: '2026-01-01', notes: 'Original work', performer: performer! },
			headers
		});
		await page.goto('/settings');
		await page.getByRole('button', { name: 'Create Invite', exact: true }).click();
		const inviteId = await page
			.getByRole('list', { name: 'Unused Invites' })
			.locator('input[name="id"]')
			.inputValue();
		const memberId = await page
			.getByRole('list', { name: 'Members', exact: true })
			.getByRole('listitem')
			.filter({ hasText: 'jamie@example.com' })
			.locator('input[name="id"]')
			.inputValue();
		const endpoints = {
			'Service Record creation': '/maintenance-log/new',
			'Service Record editing': `${new URL(record.url()).pathname}/edit`,
			'Item creation': '/items/new',
			'Item editing': `${new URL(item.url()).pathname}/edit`,
			'Contractor creation': '/contractors/new',
			'Contractor editing': `${new URL(contractor.url()).pathname}/edit`,
			'Invite revocation': '/settings?/revokeInvite',
			'Item creation with a photo': '/items/new',
			'photo replacement': `${new URL(item.url()).pathname}?/photo`,
			'Document attachment': `${new URL(item.url()).pathname}?/document`,
			'Service Record Document attachment': `${new URL(record.url()).pathname}?/document`,
			'Document renaming': `${documentUrl}?/rename`
		};
		const fields = {
			date: '2026-01-02',
			notes: 'Unauthorized work',
			performer: performer!,
			name: 'Unauthorized entry',
			category: 'HVAC',
			id: inviteId,
			title: 'Unauthorized Document'
		};
		let body = Buffer.from(new URLSearchParams(fields).toString());
		let contentType = 'application/x-www-form-urlencoded';
		if (
			[
				'Item creation with a photo',
				'photo replacement',
				'Document attachment',
				'Service Record Document attachment'
			].includes(mutation)
		) {
			const boundary = 'housebook-upload-boundary';
			const name = mutation.includes('Document attachment') ? 'document' : 'photo';
			const parts = Object.entries(fields).map(([key, value]) =>
				Buffer.from(
					`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
				)
			);
			body = Buffer.concat([
				...parts,
				Buffer.from(
					`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="item-photo.png"\r\nContent-Type: image/png\r\n\r\n`
				),
				readFileSync(resolve('tests/fixtures/item-photo.png')),
				Buffer.from(`\r\n--${boundary}--\r\n`)
			]);
			contentType = `multipart/form-data; boundary=${boundary}`;
		}
		const cookie = (await target.cookies()).map(({ name, value }) => `${name}=${value}`).join('; ');
		const pending = httpRequest(new URL(endpoints[mutation], app.url), {
			method: 'POST',
			headers: {
				...headers,
				cookie,
				'content-type': contentType,
				'content-length': Buffer.byteLength(body)
			}
		});
		const response = new Promise<{ status: number; location?: string }>((resolve, reject) => {
			pending.on('error', reject);
			pending.on('response', (result) => {
				result.resume();
				result.on('end', () =>
					resolve({ status: result.statusCode!, location: result.headers.location })
				);
			});
		});
		void response.catch(() => {});
		try {
			pending.write(body.slice(0, -1));
			await expect(async () => {
				await sessions.reload();
				expect(await targetActivity.getAttribute('datetime')).not.toBe(before);
			}).toPass({ timeout: 5_000 });
			if (revocation === 'removal') {
				await page.request.post('/settings?/removeMember', { form: { id: memberId }, headers });
			} else {
				await target.request.post(
					`${app.url}${revocation === 'sign-out' ? '/sign-out' : '/settings?/signOutAll'}`,
					{ form: {}, headers }
				);
			}
			pending.end(body.slice(-1));
			expect.soft(await response).toEqual({ status: 303, location: '/sign-in' });
			await page.goto('/maintenance-log');
			await expect(page.getByRole('link', { name: /Unauthorized work/ })).toHaveCount(0);
			await page.goto(record.url());
			await expect(page.getByText('Original work', { exact: true })).toBeVisible();
			await expect(
				page.getByRole('link', { name: 'Unauthorized Document', exact: true })
			).toHaveCount(0);
			await page.goto('/items');
			await expect(page.getByRole('link', { name: /Unauthorized entry/ })).toHaveCount(0);
			await page.goto(item.url());
			await expect(page.getByRole('heading', { name: 'Furnace', exact: true })).toBeVisible();
			await expect(page.getByRole('link', { name: 'Manual', exact: true })).toHaveCount(1);
			await expect(
				page.getByRole('link', { name: 'Unauthorized Document', exact: true })
			).toHaveCount(0);
			if (mutation === 'photo replacement') {
				const photo = await page.request.get(`${item.url()}/photo`);
				expect(await photo.body()).toEqual(readFileSync(resolve('tests/fixtures/item-photo.jpg')));
			}
			await page.goto('/contractors');
			await expect(page.getByRole('link', { name: /Unauthorized entry/ })).toHaveCount(0);
			await page.goto(contractor.url());
			await expect(
				page.getByRole('heading', { name: 'Willow Plumbing', exact: true })
			).toBeVisible();
			await page.goto('/settings');
			await expect(page.getByRole('button', { name: 'Revoke Invite', exact: true })).toHaveCount(1);
		} finally {
			pending.destroy();
		}
	} finally {
		await target.close();
		await observer.close();
	}
}
