import { request as httpRequest } from 'node:http';
import { expect, type Browser, type Page } from '@playwright/test';
import { test } from './app';

const mutations = [
	'Service Record creation',
	'Service Record editing',
	'Item creation',
	'Item editing',
	'Contractor creation',
	'Contractor editing',
	'Invite revocation'
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
			'Invite revocation': '/settings?/revokeInvite'
		};
		const body = new URLSearchParams({
			date: '2026-01-02',
			notes: 'Unauthorized work',
			performer: performer!,
			name: 'Unauthorized entry',
			category: 'HVAC',
			id: inviteId
		}).toString();
		const cookie = (await target.cookies()).map(({ name, value }) => `${name}=${value}`).join('; ');
		const pending = httpRequest(`${app.url}${endpoints[mutation]}`, {
			method: 'POST',
			headers: {
				...headers,
				cookie,
				'content-type': 'application/x-www-form-urlencoded',
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
			await page.goto('/items');
			await expect(page.getByRole('link', { name: /Unauthorized entry/ })).toHaveCount(0);
			await page.goto(item.url());
			await expect(page.getByRole('heading', { name: 'Furnace', exact: true })).toBeVisible();
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
