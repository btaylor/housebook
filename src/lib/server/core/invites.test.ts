import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterEach, expect, test } from 'vitest';
import { createHousebookHarness } from '../testing/harness';

type Harness = Awaited<ReturnType<typeof createHousebookHarness>>;
const harnesses: Harness[] = [];
const person = {
	memberName: ' Jamie ',
	email: ' Jamie@Example.COM ',
	password: 'a'.repeat(12)
};
const day = 24 * 60 * 60 * 1000;
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
		password: 'a calm willow house'
	});
	return { harness, core: harness.core, member: session.member };
}

afterEach(() => {
	for (const harness of harnesses.splice(0)) harness.dispose();
});

test('creates random hashed Invites and lists only metadata without credentials', async () => {
	const { core, member } = await setUp();
	const first = core.invites.create(member.id, 'http://housebook.lan:3000');
	const second = core.invites.create(member.id, 'http://housebook.lan:3000');
	const token = tokenOf(first.url);
	expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
	expect(second.url).not.toBe(first.url);
	expect(first.expiresAt.getTime()).toBe(core.clock().getTime() + 7 * day);
	expect(core.database.get(sql`SELECT * FROM invites WHERE id = ${first.id}`)).toEqual({
		id: first.id,
		tokenHash: createHash('sha256').update(token).digest('hex'),
		createdBy: member.id,
		createdAt: core.clock().getTime(),
		expiresAt: first.expiresAt.getTime(),
		usedAt: null,
		revokedAt: null
	});
	expect(core.invites.list()).toHaveLength(2);
	for (const invite of core.invites.list()) {
		expect(Object.keys(invite).sort()).toEqual(['createdAt', 'createdBy', 'expiresAt', 'id']);
	}
	expect(core.members.list()).toEqual([member]);
	expect(() => core.invites.create('missing', 'http://housebook.lan')).toThrow(
		expect.objectContaining({ code: 'member-not-found' })
	);
});

test.each([
	[undefined, 'http://housebook.lan:3000'],
	['https://housebook.example', 'https://housebook.example'],
	['https://housebook.example/', 'https://housebook.example']
])('uses configured public URL %s or incoming origin', async (configured, expected) => {
	const { core, member } = await setUp();
	const invite = core.invites.create(member.id, 'http://housebook.lan:3000', configured);
	expect(invite.url).toBe(`${expected}/invite/${tokenOf(invite.url)}`);
});

test('joins once, signs the new Member in, and keeps membership across restarts', async () => {
	const { core, harness, member } = await setUp();
	const invite = core.invites.create(member.id, 'http://housebook.lan');
	const token = tokenOf(invite.url);
	const session = await core.invites.redeem(token, person);
	expect(session.member).toEqual({
		id: expect.any(String),
		name: 'Jamie',
		email: 'jamie@example.com'
	});
	expect(core.auth.validateSession(session.token)?.member).toEqual(session.member);
	expect(core.members.list()).toEqual(expect.arrayContaining([member, session.member]));
	expect(core.members.list()).toHaveLength(2);
	expect(core.invites.list()).toEqual([]);
	expect(core.invites.isValid(token)).toBe(false);
	await expect(
		core.invites.redeem(token, { ...person, email: 'other@example.com' })
	).rejects.toMatchObject({ code: 'invalid-invite' });
	await harness.start();
	expect(harness.core.members.list()).toHaveLength(2);
	expect(harness.core.auth.validateSession(session.token)?.member).toEqual(session.member);
	expect((await harness.core.auth.signIn('JAMIE@example.com', person.password)).member).toEqual(
		session.member
	);
});

test('refuses unknown and revoked Invites, including after a restart', async () => {
	const { core, harness, member } = await setUp();
	const invite = core.invites.create(member.id, 'http://housebook.lan');
	core.invites.revoke(invite.id);
	core.invites.revoke(invite.id);
	expect(core.invites.list()).toEqual([]);
	await harness.start();
	for (const token of ['unknown', tokenOf(invite.url)]) {
		expect(harness.core.invites.isValid(token)).toBe(false);
		await expect(harness.core.invites.redeem(token, person)).rejects.toMatchObject({
			code: 'invalid-invite'
		});
	}
	expect(harness.core.members.list()).toEqual([member]);
});

test('expires at exactly 7 days using the core clock', async () => {
	const { core, harness, member } = await setUp();
	const invite = core.invites.create(member.id, 'http://housebook.lan');
	const token = tokenOf(invite.url);
	harness.setTime(new Date(invite.expiresAt.getTime() - 1).toISOString());
	expect(core.invites.isValid(token)).toBe(true);
	expect(core.invites.list()).toHaveLength(1);
	harness.setTime(invite.expiresAt.toISOString());
	expect(core.invites.isValid(token)).toBe(false);
	expect(core.invites.list()).toEqual([]);
	await expect(core.invites.redeem(token, person)).rejects.toMatchObject({
		code: 'invalid-invite'
	});
	expect(core.members.list()).toEqual([member]);
});

test.each([
	[{ memberName: ' ' }, 'invalid-member-name'],
	[{ email: 'jamie@@example.com' }, 'invalid-email'],
	[{ email: ' MORGAN@EXAMPLE.COM ' }, 'email-in-use'],
	[{ password: 'a'.repeat(11) }, 'password-too-short'],
	[{ password: '🏡'.repeat(11) }, 'password-too-short']
])('invalid Member details leave the Invite usable: %j', async (fields, code) => {
	const { core, member } = await setUp();
	const invite = core.invites.create(member.id, 'http://housebook.lan');
	const token = tokenOf(invite.url);
	await expect(core.invites.redeem(token, { ...person, ...fields })).rejects.toMatchObject({
		code
	});
	expect(core.members.list()).toEqual([member]);
	expect(core.invites.isValid(token)).toBe(true);
	await expect(core.invites.redeem(token, person)).resolves.toHaveProperty('member.name', 'Jamie');
});

test('only one simultaneous redemption consumes an Invite', async () => {
	const { core, member } = await setUp();
	const token = tokenOf(core.invites.create(member.id, 'http://housebook.lan').url);
	const results = await Promise.allSettled([
		core.invites.redeem(token, person),
		core.invites.redeem(token, { ...person, email: 'other@example.com' })
	]);
	expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
	expect(results.find((result) => result.status === 'rejected')?.reason).toMatchObject({
		code: 'invalid-invite'
	});
	expect(core.members.list()).toHaveLength(2);
});

test('simultaneous joins with the same email leave one Invite available', async () => {
	const { core, member } = await setUp();
	const tokens = [0, 1].map(() =>
		tokenOf(core.invites.create(member.id, 'http://housebook.lan').url)
	);
	const results = await Promise.allSettled(
		tokens.map((token) => core.invites.redeem(token, person))
	);
	expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
	expect(results.find((result) => result.status === 'rejected')?.reason).toMatchObject({
		code: 'email-in-use'
	});
	expect(core.members.list()).toHaveLength(2);
	expect(core.invites.list()).toHaveLength(1);
});

test.each(['revoked', 'expired'])(
	'rechecks an Invite %s while the password is hashing',
	async (state) => {
		const { core, harness, member } = await setUp();
		const invite = core.invites.create(member.id, 'http://housebook.lan');
		const redemption = core.invites.redeem(tokenOf(invite.url), person);
		if (state === 'revoked') core.invites.revoke(invite.id);
		else harness.setTime(invite.expiresAt.toISOString());
		await expect(redemption).rejects.toMatchObject({ code: 'invalid-invite' });
		expect(core.members.list()).toEqual([member]);
	}
);
