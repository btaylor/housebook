import { expect } from '@playwright/test';
import { test } from './app';

test('removing another Member ends their access and keeps their past work editable', async ({
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
			password: 'a calm willow house'
		},
		headers: { origin: app.url, accept: 'text/html' }
	});
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Create Invite', exact: true }).click();
	const inviteUrl = await page.getByLabel('Invite link', { exact: true }).inputValue();
	const invited = await browser.newContext({ viewport: { width: 393, height: 852 } });
	try {
		const joining = await invited.newPage();
		await joining.goto(inviteUrl);
		await joining.getByLabel('Your name').fill('Jamie');
		await joining.getByLabel('Email', { exact: true }).fill('jamie@example.com');
		await joining.getByLabel('Password', { exact: true }).fill('another calm house');
		await joining.getByRole('button', { name: 'Join Household', exact: true }).click();
		await expect(joining).toHaveURL(/\/items$/);
		await joining.goto(`${app.url}/maintenance-log/new`);
		await joining.getByLabel('Date', { exact: false }).fill('2026-01-01');
		await joining.getByLabel('Done by').selectOption({ label: 'Jamie' });
		await joining.getByLabel('Notes').fill('Changed the furnace filter.');
		await joining.getByRole('button', { name: 'Save Service Record' }).click();
		await expect(
			joining.getByRole('heading', { name: 'Service Record', exact: true })
		).toBeVisible();
		const recordUrl = joining.url();
		await joining.getByRole('link', { name: 'Settings', exact: true }).click();
		await joining.getByRole('button', { name: 'Create Invite', exact: true }).click();
		const revokedUrl = await joining.getByLabel('Invite link', { exact: true }).inputValue();
		await page.reload();
		const members = page.getByRole('list', { name: 'Members', exact: true });
		await expect(members.getByRole('listitem')).toHaveCount(2);
		await expect(page.getByText('Remove Morgan', { exact: true })).toHaveCount(0);
		await page.getByText('Remove Jamie', { exact: true }).click();
		await expect(page.getByText(/Their name will stay on past Service Records/)).toBeVisible();
		await expect(members.getByRole('listitem')).toHaveCount(2);
		await page.getByRole('button', { name: 'Confirm removal', exact: true }).click();
		await expect(page.getByRole('status')).toHaveText('Member removed.');
		await expect(members.getByRole('listitem')).toHaveCount(1);
		await expect(members).toContainText('Morgan (you)');
		await expect(members).not.toContainText('Jamie');
		await expect(
			page.getByText('The last Member cannot be removed.', { exact: true })
		).toBeVisible();
		await expect(page.getByText('No unused Invites.', { exact: true })).toBeVisible();
		await joining.reload();
		await expect(joining).toHaveURL(/\/sign-in$/);
		await joining.getByLabel('Email', { exact: true }).fill('jamie@example.com');
		await joining.getByLabel('Password', { exact: true }).fill('another calm house');
		await joining.getByRole('button', { name: 'Sign in', exact: true }).click();
		await expect(joining.getByRole('alert')).toHaveText('Email or password is incorrect.');
		await joining.goto(revokedUrl);
		await expect(joining.getByRole('heading', { name: 'Invite unavailable' })).toBeVisible();
		await page.goto('/maintenance-log');
		await expect(page.getByRole('link', { name: /Changed the furnace filter/ })).toContainText(
			'Jamie'
		);
		await page.getByRole('link', { name: /Changed the furnace filter/ }).click();
		await expect(page).toHaveURL(recordUrl);
		await expect(page.getByRole('definition').filter({ hasText: 'Jamie' })).toBeVisible();
		await page.getByRole('link', { name: 'Edit Service Record' }).click();
		await expect(page.getByLabel('Done by')).toHaveValue(/member:/);
		await page.getByLabel('Notes').fill('Changed the furnace filter. Corrected notes.');
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(
			page.getByText('Changed the furnace filter. Corrected notes.', { exact: true })
		).toBeVisible();
		await expect(page.getByRole('definition').filter({ hasText: 'Jamie' })).toBeVisible();
		await page.goto('/maintenance-log/new');
		await expect(page.getByRole('option', { name: 'Jamie', exact: true })).toHaveCount(0);
	} finally {
		await invited.close();
	}
});
