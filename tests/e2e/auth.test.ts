import { expect } from '@playwright/test';
import { test } from './app';

const member = { email: 'morgan@example.com', password: 'a calm willow house' };
const setup = {
	houseName: 'Willow House',
	currency: 'USD',
	memberName: 'Morgan',
	...member
};

test('phone first-start setup, sign-out and sign-in reach the responsive offline shell', async ({
	page,
	context,
	request,
	app
}) => {
	const externalRequests: string[] = [];
	const errors: string[] = [];
	page.on('request', (request) => {
		if (new URL(request.url()).origin !== app.url) externalRequests.push(request.url());
	});
	page.on('pageerror', (error) => errors.push(error.message));

	for (const path of ['/', '/items', '/settings', '/sign-in', '/missing']) {
		const response = await request.get(path, { maxRedirects: 0 });
		expect(response.status()).toBe(303);
		expect(response.headers().location).toBe('/setup');
	}
	await page.goto('/');
	await expect(page).toHaveURL(/\/setup$/);
	await expect(page.getByRole('heading', { name: 'Every House has a story.' })).toBeVisible();
	await page.getByLabel('Setup code').fill('incorrect');
	await page.getByLabel('House name').fill(setup.houseName);
	await page.getByLabel('Currency', { exact: true }).selectOption({ label: 'US Dollar (USD)' });
	await expect(page.getByLabel('Currency', { exact: true })).toHaveValue(setup.currency);
	await page.getByLabel('Your name').fill(setup.memberName);
	await page.getByLabel('Email', { exact: true }).fill(member.email);
	await page.getByLabel('Password', { exact: true }).fill(member.password);
	await page.getByRole('button', { name: 'Create House' }).click();
	await expect(page.getByRole('alert')).toHaveText('Enter the setup code from the server logs.');
	await expect(page.getByLabel('House name')).toHaveValue(setup.houseName);
	await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
	await page.getByLabel('Setup code').fill(app.setupCode);
	await page.getByLabel('Password', { exact: true }).fill(member.password);
	await page.getByRole('button', { name: 'Create House' }).click();
	await expect(page).toHaveURL(/\/items$/);
	await expect(page.getByRole('heading', { name: 'Items', exact: true })).toBeVisible();

	const cookie = (await context.cookies()).find((cookie) => cookie.name === 'housebook_session')!;
	expect(cookie).toMatchObject({ httpOnly: true, secure: false, sameSite: 'Lax', path: '/' });
	expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 30 * 86400 - 60);
	expect(cookie.expires).toBeLessThanOrEqual(Date.now() / 1000 + 30 * 86400);
	expect(await page.evaluate(() => document.cookie)).not.toContain('housebook_session');
	const visit = await page.request.get('/items');
	expect(visit.headers()['set-cookie']).toContain('housebook_session=');
	expect(visit.headers()['cache-control']).toBe('private, no-store');
	expect(await visit.text()).not.toContain(cookie.value);
	await page.goto('/setup');
	await expect(page).toHaveURL(/\/items$/);

	const navigation = page.getByRole('navigation', { name: 'Main navigation' });
	for (const label of ['Items', 'Maintenance Log', 'Contractors', 'Settings']) {
		const link = navigation.getByRole('link', { name: label, exact: true });
		await expect(link).toBeVisible();
		await link.click();
		await expect(page.getByRole('heading', { name: label, exact: true, level: 1 })).toBeVisible();
		await expect(link).toHaveAttribute('aria-current', 'page');
	}
	expect((await navigation.boundingBox())!.y + (await navigation.boundingBox())!.height).toBe(
		page.viewportSize()!.height
	);
	await expect(page.getByText('Email not verified.', { exact: false })).toBeVisible();

	await page.emulateMedia({ colorScheme: 'light' });
	const light = await page.evaluate(
		() => getComputedStyle(document.documentElement).backgroundColor
	);
	await page.emulateMedia({ colorScheme: 'dark' });
	const dark = await page.evaluate(
		() => getComputedStyle(document.documentElement).backgroundColor
	);
	expect(dark).not.toBe(light);
	expect(Number(dark.match(/\d+/)![0])).toBeLessThan(Number(light.match(/\d+/)![0]));
	for (const width of [320, 393, 1280]) {
		await page.setViewportSize({ width, height: 800 });
		const previousHeight = (await navigation.boundingBox())!.height;
		await navigation.getByRole('link', { name: 'Maintenance Log', exact: true }).click();
		expect((await navigation.boundingBox())!.height).toBe(previousHeight);
		await navigation.getByRole('link', { name: 'Settings', exact: true }).click();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);
		const bounds = (await navigation.boundingBox())!;
		if (width < 768) expect(bounds.y + bounds.height).toBe(800);
		else expect(bounds.y + bounds.height).toBeLessThan(250);
	}
	await page.setViewportSize({ width: 393, height: 800 });
	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(page).toHaveURL(/\/sign-in$/);
	expect(
		(await context.cookies()).find((cookie) => cookie.name === 'housebook_session')
	).toBeUndefined();

	const revoked = await request.get('/items', {
		headers: { cookie: `housebook_session=${cookie.value}` },
		maxRedirects: 0
	});
	expect(revoked.headers().location).toBe('/sign-in');
	expect(revoked.headers()['set-cookie']).toContain('Max-Age=0');
	for (const path of [
		'/',
		'/items',
		'/maintenance-log',
		'/contractors',
		'/settings',
		'/setup',
		'/missing'
	]) {
		const response = await request.get(path, { maxRedirects: 0 });
		expect(response.status()).toBe(303);
		expect(response.headers().location).toBe('/sign-in');
	}
	await page.getByLabel('Email', { exact: true }).fill('MORGAN@EXAMPLE.COM');
	await page.getByLabel('Password', { exact: true }).fill('incorrect password');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
	await page.getByLabel('Password', { exact: true }).fill(member.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL(/\/items$/);
	await expect(navigation.getByRole('link', { name: 'Items', exact: true })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await page.goto('/sign-in');
	await expect(page).toHaveURL(/\/items$/);
	expect(externalRequests).toEqual([]);
	expect(errors).toEqual([]);
});

test('rejects cross-origin form posts and signs out the current browser only', async ({
	page,
	browser,
	request,
	app
}) => {
	for (const origin of [app.url.replace('http:', 'https:'), 'https://untrusted.example']) {
		const csrf = await request.post('/setup', {
			form: { ...setup, code: app.setupCode },
			headers: {
				origin,
				'x-housebook-transport': 'https',
				'x-forwarded-proto': 'https',
				'x-forwarded-host': new URL(origin).host
			},
			maxRedirects: 0
		});
		expect(csrf.status()).toBe(403);
	}
	const created = await page.request.post('/setup', {
		form: { ...setup, code: app.setupCode },
		headers: {
			origin: app.url,
			accept: 'text/html',
			'x-housebook-transport': 'https',
			'x-forwarded-proto': 'https',
			'x-forwarded-host': 'untrusted.example'
		},
		maxRedirects: 0
	});
	expect(created.status()).toBe(303);
	expect(created.headers()['set-cookie']).not.toContain('Secure');
	const other = await browser.newContext();
	try {
		const rejectedSignIn = await other.request.post(`${app.url}/sign-in`, {
			form: member,
			headers: { origin: 'https://untrusted.example' },
			maxRedirects: 0
		});
		expect(rejectedSignIn.status()).toBe(403);
		const second = await other.request.post(`${app.url}/sign-in`, {
			form: member,
			headers: { origin: app.url, accept: 'text/html' },
			maxRedirects: 0
		});
		expect(second.status()).toBe(303);
		const rejected = await other.request.post(`${app.url}/sign-out`, {
			form: {},
			headers: { origin: 'https://untrusted.example' },
			maxRedirects: 0
		});
		expect(rejected.status()).toBe(403);
		expect((await other.request.get(`${app.url}/sign-out`)).status()).toBe(405);
		await page.goto('/settings');
		await page.getByRole('button', { name: 'Sign out', exact: true }).click();
		await expect(page).toHaveURL(/\/sign-in$/);
		const otherPage = await other.newPage();
		await otherPage.goto(`${app.url}/items`);
		await expect(otherPage.getByRole('heading', { name: 'Items', exact: true })).toBeVisible();
	} finally {
		await other.close();
	}
});

test.describe('HTTPS reverse-proxy origin', () => {
	test.use({ appOrigin: 'https://housebook.example' });
	test('marks setup and renewed session cookies Secure over HTTPS', async ({ request, app }) => {
		const headers = {
			accept: 'text/html',
			origin: 'https://housebook.example',
			'x-forwarded-proto': 'https',
			'x-forwarded-host': 'housebook.example'
		};
		const response = await request.post('/setup', {
			form: { ...setup, code: app.setupCode },
			headers,
			maxRedirects: 0
		});
		expect(response.status()).toBe(303);
		expect(response.headers()['set-cookie']).toMatch(/;\s*Secure;/);
		const token = response.headers()['set-cookie'].match(/housebook_session=([^;]+)/)![1];
		const visit = await request.get('/items', {
			headers: { ...headers, cookie: `housebook_session=${token}` }
		});
		expect(visit.status()).toBe(200);
		expect(visit.headers()['set-cookie']).toMatch(/;\s*Secure;/);
	});
});
