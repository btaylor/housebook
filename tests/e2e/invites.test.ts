import { expect } from '@playwright/test';
import { test } from './app';

test('a Member shares an Invite, a new browser joins, and the Household lists both Members', async ({
	page,
	browser,
	app
}) => {
	await page.goto('/setup');
	await page.getByLabel('Setup code').fill(app.setupCode);
	await page.getByLabel('House name').fill('Willow House');
	await page.getByLabel('Your name').fill('Morgan');
	await page.getByLabel('Email', { exact: true }).fill('morgan@example.com');
	await page.getByLabel('Password', { exact: true }).fill('a calm willow house');
	await page.getByRole('button', { name: 'Create House' }).click();
	await expect(page).toHaveURL(/\/items$/);
	await page.getByRole('link', { name: 'Settings', exact: true }).click();
	await page.getByRole('button', { name: 'Create Invite', exact: true }).click();
	const link = page.getByLabel('Invite link', { exact: true });
	await expect(link).toHaveValue(new RegExp(`^${app.url}/invite/[A-Za-z0-9_-]{43}$`));
	const inviteUrl = await link.inputValue();
	await page.getByRole('button', { name: 'Copy link', exact: true }).click();
	await expect(page.getByRole('status')).toHaveText(
		/Invite link copied\.|Link selected\. Copy it from the Invite link field\./
	);
	await expect(
		page.getByRole('list', { name: 'Unused Invites' }).getByRole('listitem')
	).toHaveCount(1);
	const invited = await browser.newContext({ viewport: { width: 393, height: 852 } });
	try {
		const joining = await invited.newPage();
		const response = await joining.goto(inviteUrl);
		expect(response!.headers()['referrer-policy']).toBe('strict-origin');
		await expect(joining.getByRole('heading', { name: 'Join Willow House' })).toBeVisible();
		await joining.getByLabel('Your name').fill('Jamie');
		await joining.getByLabel('Email', { exact: true }).fill('jamie@example.com');
		await joining.getByLabel('Password', { exact: true }).fill('another calm house');
		await joining.getByRole('button', { name: 'Join Household', exact: true }).click();
		await expect(joining).toHaveURL(/\/items$/);
		await joining.getByRole('link', { name: 'Settings', exact: true }).click();
		await expect(joining.getByRole('list', { name: 'Members', exact: true })).toContainText(
			'Jamie (you)'
		);
		await page.reload();
		const members = page.getByRole('list', { name: 'Members', exact: true });
		await expect(members.getByRole('listitem')).toHaveCount(2);
		await expect(members).toContainText('Morgan (you)');
		await expect(members).toContainText('Jamie');
		await expect(members).toContainText('jamie@example.com');
		await expect(page.getByText('No unused Invites.', { exact: true })).toBeVisible();
		await joining.goto(inviteUrl);
		await expect(joining.getByRole('heading', { name: 'Invite unavailable' })).toBeVisible();

		await page.getByRole('button', { name: 'Create Invite', exact: true }).click();
		await expect(link).toBeVisible();
		const revokedUrl = await link.inputValue();
		await page.getByRole('button', { name: 'Revoke Invite', exact: true }).click();
		await expect(page.getByText('No unused Invites.', { exact: true })).toBeVisible();
		await joining.goto(revokedUrl);
		await expect(joining.getByRole('heading', { name: 'Invite unavailable' })).toBeVisible();
	} finally {
		await invited.close();
	}
});

test('Share Invite falls back to manual copy when sharing and clipboard are unavailable', async ({
	page,
	app
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'share', { value: undefined });
		Object.defineProperty(navigator, 'clipboard', { value: undefined });
	});
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
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Create Invite', exact: true }).click();
	await page.getByRole('button', { name: 'Share Invite', exact: true }).click();
	await expect(page.getByRole('status')).toHaveText(
		'Link selected. Copy it from the Invite link field.'
	);
	const link = page.getByLabel('Invite link', { exact: true });
	await expect(link).toBeFocused();
	expect(
		await link.evaluate((input: HTMLInputElement) => input.selectionEnd! - input.selectionStart!)
	).toBe((await link.inputValue()).length);
});
