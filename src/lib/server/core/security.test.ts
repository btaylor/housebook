import { eq } from 'drizzle-orm';
import { afterEach, expect, test } from 'vitest';
import { members, sessions, signInAttempts } from '../schema';
import { createHousebookHarness } from '../testing/harness';

type Harness = Awaited<ReturnType<typeof createHousebookHarness>>;
const harnesses: Harness[] = [];
const password = 'a calm willow house';
const minute = 60 * 1000;

async function setUp() {
	const harness = await createHousebookHarness();
	harnesses.push(harness);
	const session = await harness.core.setup.complete({
		code: harness.core.setup.issueCode()!,
		houseName: 'Willow House',
		currency: 'USD',
		memberName: 'Morgan',
		email: 'morgan@example.com',
		password,
		userAgent: 'Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1'
	});
	return { harness, session, start: harness.core.clock().getTime() };
}

function addOtherMember(harness: Harness) {
	const original = harness.core.database.select().from(members).get()!;
	harness.core.database
		.insert(members)
		.values({ ...original, id: 'other-member', name: 'Riley', email: 'riley@example.com' })
		.run();
}

afterEach(() => {
	for (const harness of harnesses.splice(0)) harness.dispose();
});

test('five failures lock sign-in for 15 minutes from the fifth failure across restarts', async () => {
	const { harness, session, start } = await setUp();
	for (let attempt = 0; attempt < 4; attempt++) {
		harness.setTime(new Date(start + attempt * minute).toISOString());
		await expect(harness.core.auth.signIn('MORGAN@example.com', 'wrong')).rejects.toMatchObject({
			code: 'invalid-credentials'
		});
	}
	await harness.start();
	harness.setTime(new Date(start + 10 * minute).toISOString());
	await expect(harness.core.auth.signIn(session.member.email, 'wrong')).rejects.toMatchObject({
		code: 'sign-in-locked'
	});
	expect(harness.core.database.select().from(signInAttempts).all()).toHaveLength(5);
	await harness.start();
	harness.setTime(new Date(start + 25 * minute - 1).toISOString());
	for (const supplied of [password, 'wrong']) {
		await expect(harness.core.auth.signIn(session.member.email, supplied)).rejects.toMatchObject({
			code: 'sign-in-locked'
		});
	}
	expect(harness.core.database.select().from(sessions).all()).toHaveLength(1);
	harness.setTime(new Date(start + 25 * minute).toISOString());
	await expect(harness.core.auth.signIn(session.member.email, password)).resolves.toHaveProperty(
		'member.id',
		session.member.id
	);
	expect(harness.core.database.select().from(signInAttempts).all()).toEqual([]);
});

test('counts only failures inside the rolling window and does not clear them on a successful sign-in', async () => {
	const { harness, session, start } = await setUp();
	await expect(harness.core.auth.signIn(session.member.email, 'wrong')).rejects.toMatchObject({
		code: 'invalid-credentials'
	});
	harness.setTime(new Date(start + 15 * minute).toISOString());
	for (let attempt = 0; attempt < 4; attempt++) {
		await expect(harness.core.auth.signIn(session.member.email, 'wrong')).rejects.toMatchObject({
			code: 'invalid-credentials'
		});
	}
	await expect(harness.core.auth.signIn(session.member.email, password)).resolves.toHaveProperty(
		'token'
	);
	await expect(harness.core.auth.signIn(session.member.email, 'wrong')).rejects.toMatchObject({
		code: 'sign-in-locked'
	});
});

test('overlapping failed sign-ins cannot bypass the threshold or extend a lock', async () => {
	const { harness, session, start } = await setUp();
	const results = await Promise.allSettled(
		Array.from({ length: 6 }, () => harness.core.auth.signIn(session.member.email, 'wrong'))
	);
	expect(results.every((result) => result.status === 'rejected')).toBe(true);
	expect(harness.core.database.select().from(signInAttempts).all()).toHaveLength(5);
	harness.setTime(new Date(start + 14 * minute).toISOString());
	await expect(harness.core.auth.signIn(session.member.email, 'wrong')).rejects.toMatchObject({
		code: 'sign-in-locked'
	});
	harness.setTime(new Date(start + 15 * minute).toISOString());
	await expect(harness.core.auth.signIn(session.member.email, password)).resolves.toHaveProperty(
		'token'
	);
});

test('failed attempts are isolated by Member and unknown emails do not create records', async () => {
	const { harness, session } = await setUp();
	addOtherMember(harness);
	for (let attempt = 0; attempt < 5; attempt++) {
		await expect(harness.core.auth.signIn(session.member.email, 'wrong')).rejects.toHaveProperty(
			'code'
		);
	}
	await expect(harness.core.auth.signIn('missing@example.com', password)).rejects.toMatchObject({
		code: 'invalid-credentials'
	});
	await expect(harness.core.auth.signIn('riley@example.com', password)).resolves.toHaveProperty(
		'member.id',
		'other-member'
	);
	expect(harness.core.database.select().from(signInAttempts).all()).toHaveLength(5);
	expect(harness.core.auth.validateSession(session.token)).not.toBeNull();
});

test('password changes require the current password, count Unicode characters and persist', async () => {
	const { harness, session } = await setUp();
	await expect(
		harness.core.auth.changePassword(session.token, 'wrong', 'a new long passphrase')
	).rejects.toMatchObject({ code: 'incorrect-current-password' });
	for (const short of ['a'.repeat(11), '🏡'.repeat(11)]) {
		await expect(
			harness.core.auth.changePassword(session.token, password, short)
		).rejects.toMatchObject({ code: 'password-too-short' });
	}
	const replacement = ' '.repeat(2) + '🏡'.repeat(10);
	await harness.core.auth.changePassword(session.token, password, replacement);
	await harness.start();
	await expect(harness.core.auth.signIn(session.member.email, password)).rejects.toMatchObject({
		code: 'invalid-credentials'
	});
	await expect(harness.core.auth.signIn(session.member.email, replacement)).resolves.toHaveProperty(
		'member.id',
		session.member.id
	);
});

test('a revoked session cannot finish an in-flight password change', async () => {
	const { harness, session } = await setUp();
	const change = harness.core.auth.changePassword(session.token, password, 'another long password');
	harness.core.auth.signOutAll(session.token);
	await expect(change).rejects.toMatchObject({ code: 'session-required' });
	await expect(harness.core.auth.signIn(session.member.email, password)).resolves.toHaveProperty(
		'token'
	);
});

test('profile edits normalize own details and reject another Member’s email without partial changes', async () => {
	const { harness, session } = await setUp();
	addOtherMember(harness);
	expect(() =>
		harness.core.auth.updateProfile(session.token, { name: 'Changed', email: 'RILEY@EXAMPLE.COM' })
	).toThrow(expect.objectContaining({ code: 'email-in-use' }));
	expect(harness.core.auth.validateSession(session.token)?.member).toEqual(session.member);
	for (const profile of [
		{ name: ' ', email: 'new@example.com' },
		{ name: 'Morgan', email: 'not an email' }
	]) {
		expect(() => harness.core.auth.updateProfile(session.token, profile)).toThrow();
	}
	harness.core.auth.updateProfile(session.token, {
		name: ' Morgan Taylor ',
		email: ' MORGAN@EXAMPLE.COM '
	});
	harness.core.auth.updateProfile(session.token, {
		name: ' Morgan Taylor ',
		email: ' NEW@EXAMPLE.COM '
	});
	await harness.start();
	expect(harness.core.auth.validateSession(session.token)?.member).toEqual({
		id: session.member.id,
		name: 'Morgan Taylor',
		email: 'new@example.com'
	});
	await expect(harness.core.auth.signIn('morgan@example.com', password)).rejects.toMatchObject({
		code: 'invalid-credentials'
	});
	await expect(harness.core.auth.signIn('NEW@EXAMPLE.COM', password)).resolves.toHaveProperty(
		'member.id',
		session.member.id
	);
	expect(
		harness.core.database.select().from(members).where(eq(members.id, 'other-member')).get()?.email
	).toBe('riley@example.com');
});

test('active-session summaries contain hints and last-seen times but no credentials or other Members', async () => {
	const { harness, session, start } = await setUp();
	addOtherMember(harness);
	await harness.core.auth.signIn('riley@example.com', password);
	harness.setTime(new Date(start + minute).toISOString());
	const second = await harness.core.auth.signIn(
		session.member.email,
		password,
		'Mozilla/5.0 (Linux; Android 13) Chrome/120.0 Safari/537.36'
	);
	harness.setTime(new Date(start + 2 * minute).toISOString());
	expect(harness.core.auth.listSessions(session.token)).toEqual([
		{ deviceHint: 'Safari · iPhone', lastSeenAt: new Date(start + 2 * minute), current: true },
		{ deviceHint: 'Chrome · Android', lastSeenAt: new Date(start + minute), current: false }
	]);
	harness.core.auth.signOut(second.token);
	expect(harness.core.auth.listSessions(session.token)).toHaveLength(1);
	const expires = (await harness.core.auth.signIn(session.member.email, password)).expiresAt;
	harness.setTime(new Date(expires.getTime() - 1).toISOString());
	harness.core.auth.validateSession(session.token);
	harness.setTime(expires.toISOString());
	expect(harness.core.auth.listSessions(session.token)).toHaveLength(1);
});

test('sign out all devices ends every own session, including expired sessions, but no other Member’s', async () => {
	const { harness, session } = await setUp();
	addOtherMember(harness);
	const second = await harness.core.auth.signIn(session.member.email, password);
	const other = await harness.core.auth.signIn('riley@example.com', password);
	harness.core.database
		.update(sessions)
		.set({ expiresAt: harness.core.clock() })
		.where(eq(sessions.memberId, session.member.id))
		.run();
	const active = await harness.core.auth.signIn(session.member.email, password);
	harness.core.auth.signOutAll(active.token);
	expect(harness.core.auth.validateSession(session.token)).toBeNull();
	expect(harness.core.auth.validateSession(second.token)).toBeNull();
	expect(harness.core.auth.validateSession(active.token)).toBeNull();
	expect(harness.core.auth.validateSession(other.token)?.member.id).toBe('other-member');
	expect(harness.core.database.select().from(sessions).all()).toHaveLength(1);
	await harness.start();
	expect(harness.core.auth.validateSession(session.token)).toBeNull();
});

test('House rename trims the name, preserves currency, and persists', async () => {
	const { harness, session } = await setUp();
	expect(() => harness.core.renameHouse(session.token, ' \t ')).toThrow(
		expect.objectContaining({ code: 'invalid-house-name' })
	);
	harness.core.renameHouse(session.token, ' Cedar House ');
	await harness.start();
	expect(harness.core.setup.getHouse()).toMatchObject({ name: 'Cedar House', currency: 'USD' });
});

test('account, session and House operations reject unauthenticated or expired sessions', async () => {
	const { harness, session } = await setUp();
	harness.setTime(session.expiresAt.toISOString());
	for (const token of ['unknown', session.token]) {
		const operations = [
			() => harness.core.auth.updateProfile(token, { name: 'Intruder', email: 'x@example.com' }),
			() => harness.core.auth.listSessions(token),
			() => harness.core.auth.signOutAll(token),
			() => harness.core.renameHouse(token, 'Intruder House')
		];
		for (const operation of operations) {
			expect(operation).toThrow(expect.objectContaining({ code: 'session-required' }));
		}
		await expect(
			harness.core.auth.changePassword(token, password, 'another long password')
		).rejects.toMatchObject({ code: 'session-required' });
	}
	expect(harness.core.setup.getHouse()?.name).toBe('Willow House');
});
