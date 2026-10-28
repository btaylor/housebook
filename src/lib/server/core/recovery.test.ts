import { createHash } from 'node:crypto';
import { afterEach, expect, test } from 'vitest';
import { passwordResets } from '../schema';
import { createHousebookHarness } from '../testing/harness';

type Harness = Awaited<ReturnType<typeof createHousebookHarness>>;
const harnesses: Harness[] = [];
const password = 'a calm willow house';
const replacement = 'another calm willow house';
const tokenOf = (url: string) => new URL(url).pathname.split('/').at(-1)!;

async function setUp() {
	const harness = await createHousebookHarness();
	harnesses.push(harness);
	const session = await harness.core.setup.complete({
		code: harness.core.setup.issueCode()!,
		houseName: 'Willow House',
		currency: 'USD',
		memberName: 'Morgan',
		email: 'morgan@example.com',
		password
	});
	return { harness, core: harness.core, session };
}

afterEach(() => {
	for (const harness of harnesses.splice(0)) harness.dispose();
});

test('installer recovery works for the sole Member, stores only a unique hash, and survives restart', async () => {
	const { harness, core, session } = await setUp();
	const reset = core.auth.createPasswordResetForEmail(
		' MORGAN@EXAMPLE.COM ',
		'http://housebook.lan'
	);
	const token = tokenOf(reset.url);
	expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
	expect(
		core.auth.createPasswordResetForEmail(session.member.email, 'http://housebook.lan').url
	).not.toBe(reset.url);
	expect(core.database.select().from(passwordResets).all()).toContainEqual({
		id: reset.id,
		tokenHash: createHash('sha256').update(token).digest('hex'),
		memberId: session.member.id,
		createdBy: null,
		createdAt: core.clock(),
		expiresAt: new Date(core.clock().getTime() + 24 * 60 * 60 * 1000),
		usedAt: null
	});
	await harness.start();
	await harness.core.auth.resetPassword(token, replacement);
	await harness.start();
	await expect(harness.core.auth.signIn(session.member.email, password)).rejects.toMatchObject({
		code: 'invalid-credentials'
	});
	await expect(harness.core.auth.signIn(session.member.email, replacement)).resolves.toHaveProperty(
		'member.id',
		session.member.id
	);
	await expect(harness.core.auth.resetPassword(token, password)).rejects.toMatchObject({
		code: 'invalid-password-reset'
	});
});

test('Members issue links only for other Members, using the configured URL or request origin', async () => {
	const { core, session } = await setUp();
	const invite = core.invites.create(session.member.id, 'http://housebook.lan');
	const other = await core.invites.redeem(tokenOf(invite.url), {
		memberName: 'Jamie',
		email: 'jamie@example.com',
		password
	});
	const reset = core.auth.createPasswordReset(
		session.token,
		other.member.id,
		'http://housebook.lan'
	);
	expect(reset.url).toMatch(/^http:\/\/housebook\.lan\/reset-password\//);
	const configured = core.auth.createPasswordReset(
		session.token,
		other.member.id,
		'http://housebook.lan',
		'https://housebook.example/'
	);
	expect(configured.url).toMatch(/^https:\/\/housebook\.example\/reset-password\//);
	for (const [token, id, code] of [
		['unknown', other.member.id, 'session-required'],
		[session.token, session.member.id, 'cannot-reset-self'],
		[session.token, 'missing', 'member-not-found']
	]) {
		expect(() => core.auth.createPasswordReset(token, id, 'http://housebook.lan')).toThrow(
			expect.objectContaining({ code })
		);
	}
	expect(() =>
		core.auth.createPasswordResetForEmail('missing@example.com', 'http://housebook.lan')
	).toThrow(expect.objectContaining({ code: 'member-not-found' }));
});

test('redemption ends every target session and clears lockout and failed attempts, without affecting others', async () => {
	const { core, session } = await setUp();
	const invite = core.invites.create(session.member.id, 'http://housebook.lan');
	const other = await core.invites.redeem(tokenOf(invite.url), {
		memberName: 'Jamie',
		email: 'jamie@example.com',
		password
	});
	const second = await core.auth.signIn(session.member.email, password);
	for (let attempt = 0; attempt < 5; attempt++) {
		await expect(core.auth.signIn(session.member.email, 'wrong')).rejects.toHaveProperty('code');
	}
	await expect(core.auth.signIn(session.member.email, password)).rejects.toMatchObject({
		code: 'sign-in-locked'
	});
	const reset = core.auth.createPasswordReset(
		other.token,
		session.member.id,
		'http://housebook.lan'
	);
	await core.auth.resetPassword(tokenOf(reset.url), replacement);
	expect(core.auth.validateSession(session.token)).toBeNull();
	expect(core.auth.validateSession(second.token)).toBeNull();
	expect(core.auth.validateSession(other.token)?.member.id).toBe(other.member.id);
	await expect(core.auth.signIn(session.member.email, replacement)).resolves.toHaveProperty(
		'token'
	);
	await expect(core.auth.signIn(session.member.email, 'wrong')).rejects.toMatchObject({
		code: 'invalid-credentials'
	});
	await expect(core.auth.signIn(session.member.email, replacement)).resolves.toHaveProperty(
		'token'
	);
});

test('refuses unknown links and expires at exactly 24 hours, including during hashing', async () => {
	const { core, harness, session } = await setUp();
	await expect(core.auth.resetPassword('unknown', replacement)).rejects.toMatchObject({
		code: 'invalid-password-reset'
	});
	const reset = core.auth.createPasswordResetForEmail(session.member.email, 'http://housebook.lan');
	const token = tokenOf(reset.url);
	harness.setTime(new Date(reset.expiresAt.getTime() - 1).toISOString());
	expect(core.auth.isPasswordResetValid(token)).toBe(true);
	const pending = core.auth.resetPassword(token, replacement);
	harness.setTime(reset.expiresAt.toISOString());
	await expect(pending).rejects.toMatchObject({ code: 'invalid-password-reset' });
	expect(core.auth.isPasswordResetValid(token)).toBe(false);
	await expect(core.auth.resetPassword(token, replacement)).rejects.toMatchObject({
		code: 'invalid-password-reset'
	});
	await expect(core.auth.signIn(session.member.email, password)).resolves.toHaveProperty('token');
});

test('invalid passwords leave the link and existing sessions usable; simultaneous redemption succeeds once', async () => {
	const { core, session } = await setUp();
	const token = tokenOf(
		core.auth.createPasswordResetForEmail(session.member.email, 'http://housebook.lan').url
	);
	await expect(core.auth.resetPassword(token, '🏡'.repeat(11))).rejects.toMatchObject({
		code: 'password-too-short'
	});
	expect(core.auth.validateSession(session.token)).not.toBeNull();
	const results = await Promise.allSettled([
		core.auth.resetPassword(token, '🏡'.repeat(12)),
		core.auth.resetPassword(token, '🏡'.repeat(12))
	]);
	expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
	expect(results.find((result) => result.status === 'rejected')?.reason).toMatchObject({
		code: 'invalid-password-reset'
	});
	await expect(core.auth.signIn(session.member.email, '🏡'.repeat(12))).resolves.toHaveProperty(
		'token'
	);
});
