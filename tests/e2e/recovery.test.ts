import { spawnSync } from 'node:child_process';
import { expect } from '@playwright/test';
import { test } from './app';

const password = 'a calm willow house';
const replacement = 'a newly recovered house';

test('a Member creates a reset link, recovery ends old sessions, and the new password signs in', async ({
	page,
	browser,
	app
}) => {
	await page.request.post('/setup', {
		form: {
			code: app.setupCode,
			houseName: 'Willow House',
			currency: 'USD',
			memberName: 'Morgan',
			email: 'morgan@example.com',
			password
		},
		headers: { origin: app.url, accept: 'text/html' }
	});
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Create Invite', exact: true }).click();
	const inviteUrl = await page.getByLabel('Invite link', { exact: true }).inputValue();
	const memberBrowser = await browser.newContext({ viewport: { width: 393, height: 852 } });
	const otherDevice = await browser.newContext({ viewport: { width: 393, height: 852 } });
	const recoveryBrowser = await browser.newContext({ viewport: { width: 393, height: 852 } });
	try {
		const member = await memberBrowser.newPage();
		await member.goto(inviteUrl);
		await member.getByLabel('Your name').fill('Jamie');
		await member.getByLabel('Email', { exact: true }).fill('jamie@example.com');
		await member.getByLabel('Password', { exact: true }).fill(password);
		await member.getByRole('button', { name: 'Join Household', exact: true }).click();
		await expect(member).toHaveURL(/\/items$/);
		const device = await otherDevice.newPage();
		await device.goto(`${app.url}/sign-in`);
		await device.getByLabel('Email', { exact: true }).fill('jamie@example.com');
		await device.getByLabel('Password', { exact: true }).fill(password);
		await device.getByRole('button', { name: 'Sign in', exact: true }).click();
		await expect(device).toHaveURL(/\/items$/);

		await page.goto('/settings');
		await page
			.getByRole('button', { name: 'Create password reset link for Jamie', exact: true })
			.click();
		const resetUrl = await page
			.getByLabel('Password reset link for Jamie', { exact: true })
			.inputValue();
		const recovering = await recoveryBrowser.newPage();
		const response = await recovering.goto(resetUrl);
		expect(response!.headers()['referrer-policy']).toBe('strict-origin');
		await expect(
			recovering.getByRole('heading', { name: 'Set a new password', exact: true })
		).toBeVisible();
		await recovering.getByLabel('New password', { exact: true }).fill('short');
		await recovering.getByRole('button', { name: 'Reset password', exact: true }).click();
		await expect(recovering.getByRole('alert')).toHaveText(
			'Use a password with at least 12 characters.'
		);
		await recovering.getByLabel('New password', { exact: true }).fill(replacement);
		await recovering.getByRole('button', { name: 'Reset password', exact: true }).click();
		await expect(
			recovering.getByRole('heading', { name: 'Password reset', exact: true })
		).toBeVisible();
		for (const oldSession of [member, device]) {
			await oldSession.goto(`${app.url}/settings`);
			await expect(oldSession).toHaveURL(/\/sign-in$/);
		}
		await page.goto('/settings');
		await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
		await recovering.getByRole('link', { name: 'Sign in', exact: true }).click();
		await recovering.getByLabel('Email', { exact: true }).fill('jamie@example.com');
		await recovering.getByLabel('Password', { exact: true }).fill(password);
		await recovering.getByRole('button', { name: 'Sign in', exact: true }).click();
		await expect(recovering.getByRole('alert')).toHaveText('Email or password is incorrect.');
		await recovering.getByLabel('Password', { exact: true }).fill(replacement);
		await recovering.getByRole('button', { name: 'Sign in', exact: true }).click();
		await expect(recovering).toHaveURL(/\/items$/);
		await recovering.goto(resetUrl);
		await expect(
			recovering.getByRole('heading', { name: 'Reset link unavailable', exact: true })
		).toBeVisible();
	} finally {
		await Promise.all([memberBrowser.close(), otherDevice.close(), recoveryBrowser.close()]);
	}
});

test('installer command prints a usable sole-Member link and reports unknown email and missing arguments', async ({
	page,
	app
}) => {
	await page.request.post('/setup', {
		form: {
			code: app.setupCode,
			houseName: 'Willow House',
			currency: 'USD',
			memberName: 'Morgan',
			email: 'morgan@example.com',
			password
		},
		headers: { origin: app.url, accept: 'text/html' }
	});
	const env = { ...process.env, HOUSEBOOK_DATA_DIR: app.dataDirectory, HOUSEBOOK_URL: app.url };
	const fallback = spawnSync(
		process.execPath,
		['server.js', 'reset-password', 'morgan@example.com'],
		{
			env: { ...env, HOUSEBOOK_URL: '' },
			encoding: 'utf8',
			timeout: 15_000
		}
	);
	expect(fallback.status).toBe(0);
	expect(new URL(fallback.stdout.trim()).origin).toBe('http://localhost:3000');
	for (const [args, message] of [
		[[], 'Usage: node server.js reset-password <member-email>'],
		[['missing@example.com'], 'No Member uses that email address.']
	] as const) {
		const result = spawnSync(process.execPath, ['server.js', 'reset-password', ...args], {
			env,
			encoding: 'utf8',
			timeout: 15_000
		});
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(message);
		expect(result.stdout).toBe('');
	}
	const result = spawnSync(
		process.execPath,
		['server.js', 'reset-password', ' MORGAN@EXAMPLE.COM '],
		{
			env,
			encoding: 'utf8',
			timeout: 15_000
		}
	);
	expect(result.status).toBe(0);
	const resetUrl = result.stdout.trim();
	expect(new URL(resetUrl).origin).toBe(app.url);
	await page.goto(resetUrl);
	await page.getByLabel('New password', { exact: true }).fill(replacement);
	await page.getByRole('button', { name: 'Reset password', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Password reset', exact: true })).toBeVisible();
	await page.getByRole('link', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Email', { exact: true }).fill('morgan@example.com');
	await page.getByLabel('Password', { exact: true }).fill(replacement);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL(/\/items$/);
	await page.goto(resetUrl);
	await expect(
		page.getByRole('heading', { name: 'Reset link unavailable', exact: true })
	).toBeVisible();
});
