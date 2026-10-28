import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, test } from 'vitest';
import { createHousebookHarness } from '../testing/harness';
import { DomainError } from './index';

type Harness = Awaited<ReturnType<typeof createHousebookHarness>>;
const harnesses: Harness[] = [];
const input = {
	houseName: ' Willow House ',
	currency: 'usd',
	memberName: ' Morgan ',
	email: ' Morgan@Example.COM ',
	password: 'a calm willow house'
};
const day = 24 * 60 * 60 * 1000;

async function createHarness() {
	const harness = await createHousebookHarness();
	harnesses.push(harness);
	return harness;
}

async function setUp(harness: Harness) {
	return harness.core.setup.complete({ ...input, code: harness.core.setup.issueCode()! });
}

afterEach(() => {
	for (const harness of harnesses.splice(0)) harness.dispose();
});

describe('first-start setup', () => {
	test('requires the logged code and holds it until a House is created', async () => {
		const { core } = await createHarness();
		expect(core.setup.getHouse()).toBeNull();
		await expect(core.setup.complete({ ...input, code: '' })).rejects.toMatchObject({
			code: 'invalid-setup-code'
		});
		const code = core.setup.issueCode()!;
		expect(code.length).toBeGreaterThanOrEqual(32);
		expect(core.setup.issueCode()).toBe(code);
		await expect(core.setup.complete({ ...input, code: 'wrong' })).rejects.toMatchObject({
			code: 'invalid-setup-code'
		});
		expect(core.setup.getHouse()).toBeNull();
		expect(core.database.all(sql`SELECT * FROM members`)).toEqual([]);
		await core.setup.complete({ ...input, code });
		expect(core.setup.issueCode()).toBeNull();
		await expect(core.setup.complete({ ...input, code })).rejects.toMatchObject({
			code: 'setup-complete'
		});
	});

	test('creates the House and first Member together and keeps credentials across restarts', async () => {
		const harness = await createHarness();
		const session = await setUp(harness);
		expect(harness.core.setup.getHouse()).toEqual({
			id: 1,
			name: 'Willow House',
			currency: 'USD',
			createdAt: harness.core.clock()
		});
		expect(session.member).toEqual({
			id: expect.any(String),
			name: 'Morgan',
			email: 'morgan@example.com'
		});
		expect(harness.core.auth.validateSession(session.token)?.member).toEqual(session.member);
		await harness.start();
		expect(harness.core.setup.issueCode()).toBeNull();
		expect(harness.core.setup.getHouse()?.name).toBe('Willow House');
		expect((await harness.core.auth.signIn('MORGAN@example.com', input.password)).member).toEqual(
			session.member
		);
		expect(harness.core.auth.validateSession(session.token)?.member).toEqual(session.member);
	});

	test.each([
		[{ houseName: ' \t ' }, 'invalid-house-name'],
		[{ currency: 'ABC' }, 'invalid-currency'],
		[{ memberName: ' ' }, 'invalid-member-name'],
		[{ email: 'morgan@@example.com' }, 'invalid-email'],
		[{ password: 'a'.repeat(11) }, 'password-too-short'],
		[{ password: '🏡'.repeat(11) }, 'password-too-short']
	])('refuses invalid setup fields without claiming the installation: %j', async (fields, code) => {
		const harness = await createHarness();
		const setupCode = harness.core.setup.issueCode()!;
		await expect(
			harness.core.setup.complete({ ...input, ...fields, code: setupCode })
		).rejects.toMatchObject({ code });
		expect(harness.core.setup.getHouse()).toBeNull();
		expect(harness.core.database.all(sql`SELECT * FROM members`)).toEqual([]);
		expect(harness.core.setup.issueCode()).toBe(setupCode);
	});

	test('accepts 12 characters without composition rules and uses per-password salts', async () => {
		const first = await createHarness();
		const second = await createHarness();
		for (const harness of [first, second]) {
			await harness.core.setup.complete({
				...input,
				code: harness.core.setup.issueCode()!,
				currency: 'XCG',
				password: 'a'.repeat(12)
			});
			await expect(harness.core.auth.signIn(input.email, 'a'.repeat(12))).resolves.toHaveProperty(
				'member.name',
				'Morgan'
			);
		}
		const hashes = [first, second].map(
			(harness) =>
				harness.core.database.get<{ passwordHash: string }>(sql`SELECT passwordHash FROM members`)!
					.passwordHash
		);
		expect(hashes[0]).toMatch(/^scrypt:65536:8:1:[a-f0-9]{32}:[a-f0-9]{128}$/);
		expect(hashes[0]).not.toBe(hashes[1]);
		expect(hashes[0]).not.toContain('a'.repeat(12));
	});

	test('allows only one concurrent setup to create a House and Member', async () => {
		const harness = await createHarness();
		const code = harness.core.setup.issueCode()!;
		const results = await Promise.allSettled([
			harness.core.setup.complete({ ...input, code }),
			harness.core.setup.complete({ ...input, memberName: 'Another Member', code })
		]);
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		const failure = results.find((result) => result.status === 'rejected');
		expect(failure?.reason).toMatchObject({ code: 'setup-complete' });
		expect(harness.core.database.all(sql`SELECT name FROM members`)).toHaveLength(1);
	});
});

describe('Member sign-in and sessions', () => {
	test('matches email ignoring case and returns the same error for wrong email or password', async () => {
		const { core } = await createHarness();
		const original = await core.setup.complete({ ...input, code: core.setup.issueCode()! });
		const session = await core.auth.signIn('MORGAN@EXAMPLE.com', input.password);
		expect(session.member).toEqual(original.member);
		expect(session.token).not.toBe(original.token);
		for (const [email, password] of [
			['morgan@example.com', 'wrong password'],
			['missing@example.com', input.password],
			['morgan@example.com', input.password.toUpperCase()]
		]) {
			await expect(core.auth.signIn(email, password)).rejects.toEqual(
				new DomainError('invalid-credentials', 'Email or password is incorrect.')
			);
		}
	});

	test('preserves spaces in passwords', async () => {
		const { core } = await createHarness();
		const password = '  a long passphrase  ';
		await core.setup.complete({ ...input, password, code: core.setup.issueCode()! });
		await expect(core.auth.signIn(input.email, password)).resolves.toHaveProperty('token');
		await expect(core.auth.signIn(input.email, password.trim())).rejects.toMatchObject({
			code: 'invalid-credentials'
		});
	});

	test('stores only a hash of a random session token', async () => {
		const harness = await createHarness();
		const session = await setUp(harness);
		expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(harness.core.database.all(sql`SELECT * FROM sessions`)).toEqual([
			{
				tokenHash: createHash('sha256').update(session.token).digest('hex'),
				memberId: session.member.id,
				createdAt: harness.core.clock().getTime(),
				lastSeenAt: harness.core.clock().getTime(),
				expiresAt: harness.core.clock().getTime() + 30 * day,
				deviceHint: 'Unknown browser · Unknown device'
			}
		]);
		expect(harness.core.auth.validateSession('unknown')).toBeNull();
	});

	test('extends expiry to 30 days after each use, including past the original expiry', async () => {
		const harness = await createHarness();
		const session = await setUp(harness);
		const start = harness.core.clock().getTime();
		expect(session.expiresAt.getTime()).toBe(start + 30 * day);
		harness.setTime(new Date(start + 20 * day).toISOString());
		expect(harness.core.auth.validateSession(session.token)?.expiresAt.getTime()).toBe(
			start + 50 * day
		);
		harness.setTime(new Date(start + 40 * day).toISOString());
		expect(harness.core.auth.validateSession(session.token)?.expiresAt.getTime()).toBe(
			start + 70 * day
		);
		harness.setTime(new Date(start + 70 * day).toISOString());
		expect(harness.core.auth.validateSession(session.token)).toBeNull();
	});

	test('expires unused sessions at exactly 30 days', async () => {
		const harness = await createHarness();
		const session = await setUp(harness);
		harness.setTime(session.expiresAt.toISOString());
		expect(harness.core.auth.validateSession(session.token)).toBeNull();
	});

	test('accepts a session just before expiry and signs out only the chosen device', async () => {
		const harness = await createHarness();
		const first = await setUp(harness);
		const second = await harness.core.auth.signIn(input.email, input.password);
		harness.setTime(new Date(first.expiresAt.getTime() - 1).toISOString());
		expect(harness.core.auth.validateSession(first.token)).not.toBeNull();
		harness.core.auth.signOut(first.token);
		harness.core.auth.signOut(first.token);
		expect(harness.core.auth.validateSession(first.token)).toBeNull();
		expect(harness.core.auth.validateSession(second.token)?.member).toEqual(first.member);
	});
});
