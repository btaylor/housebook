import { afterEach, expect, test } from 'vitest';
import { createHousebookHarness } from '../testing/harness';

type Harness = Awaited<ReturnType<typeof createHousebookHarness>>;
let harness: Harness;
const password = 'a calm willow house';
const tokenOf = (url: string) => new URL(url).pathname.split('/').at(-1)!;

async function setup() {
	harness = await createHousebookHarness();
	const core = harness.core;
	const first = await core.setup.complete({
		code: core.setup.issueCode()!,
		houseName: 'Willow House',
		currency: 'USD',
		memberName: 'Morgan',
		email: 'morgan@example.com',
		password
	});
	const invite = core.invites.create(first.member.id, 'http://housebook.lan');
	const second = await core.invites.redeem(tokenOf(invite.url), {
		memberName: 'Jamie',
		email: 'jamie@example.com',
		password: 'another calm house'
	});
	return { core, first, second };
}

afterEach(() => harness?.dispose());

test('removal ends all devices and prevents sign-in and account changes across restarts', async () => {
	const { core, first, second } = await setup();
	const device = await core.auth.signIn(second.member.email, 'another calm house');
	core.members.remove(first.token, second.member.id);
	await harness.start();
	const restarted = harness.core;
	expect(restarted.members.list()).toEqual([first.member]);
	for (const token of [second.token, device.token]) {
		expect(restarted.auth.validateSession(token)).toBeNull();
		expect(() =>
			restarted.auth.updateProfile(token, { name: 'Changed', email: 'new@example.com' })
		).toThrow(expect.objectContaining({ code: 'session-required' }));
		await expect(
			restarted.auth.changePassword(token, 'another calm house', 'a different password')
		).rejects.toMatchObject({ code: 'session-required' });
		expect(() => restarted.members.remove(token, first.member.id)).toThrow(
			expect.objectContaining({ code: 'session-required' })
		);
	}
	await expect(
		restarted.auth.signIn('JAMIE@example.com', 'another calm house')
	).rejects.toMatchObject({ code: 'invalid-credentials' });
	expect(restarted.auth.validateSession(first.token)?.member).toEqual(first.member);
});

test('requires a session and refuses unknown, already removed and last active Members', async () => {
	const { core, first, second } = await setup();
	expect(() => core.members.remove('unknown', second.member.id)).toThrow(
		expect.objectContaining({ code: 'session-required' })
	);
	expect(() => core.members.remove(first.token, 'missing')).toThrow(
		expect.objectContaining({ code: 'member-not-found' })
	);
	expect(core.members.list()).toHaveLength(2);
	core.members.remove(first.token, second.member.id);
	expect(() => core.members.remove(first.token, second.member.id)).toThrow(
		expect.objectContaining({ code: 'member-not-found' })
	);
	const invite = core.invites.create(first.member.id, 'http://housebook.lan');
	expect(() => core.members.remove(first.token, first.member.id)).toThrow(
		expect.objectContaining({ code: 'last-member' })
	);
	expect(core.members.list()).toEqual([first.member]);
	expect(core.auth.validateSession(first.token)?.member).toEqual(first.member);
	expect(core.invites.isValid(tokenOf(invite.url))).toBe(true);
});

test('email reuse joins a distinct Member without changing the removed performer on past work', async () => {
	const { core, first, second } = await setup();
	const item = core.items.create({ name: 'Furnace', category: 'HVAC' });
	const input = {
		date: '2026-01-01',
		notes: 'Changed filter',
		memberId: second.member.id,
		itemIds: [item.id]
	};
	const records = [core.serviceRecords.create(input), core.serviceRecords.create(input)];
	const other = core.serviceRecords.create({ ...input, memberId: first.member.id });
	core.members.remove(first.token, second.member.id);
	const replacement = await core.invites.redeem(
		tokenOf(core.invites.create(first.member.id, 'http://housebook.lan').url),
		{ memberName: 'Taylor', email: ' JAMIE@EXAMPLE.COM ', password: 'a new calm house' }
	);
	expect(replacement.member.id).not.toBe(second.member.id);
	expect((await core.auth.signIn('jamie@example.com', 'a new calm house')).member).toEqual(
		replacement.member
	);
	await expect(core.auth.signIn('jamie@example.com', 'another calm house')).rejects.toMatchObject({
		code: 'invalid-credentials'
	});
	for (const record of records) {
		expect(core.serviceRecords.get(record.id).member).toEqual({
			id: second.member.id,
			name: 'Jamie'
		});
		expect(core.serviceRecordOptions(record.id).members).toContainEqual({
			id: second.member.id,
			name: 'Jamie'
		});
		expect(
			core.serviceRecords.update(record.id, { ...input, notes: 'Corrected filter notes' }).member
		).toEqual(record.member);
	}
	expect(core.serviceRecords.list({ itemId: item.id })).toHaveLength(3);
	expect(core.serviceRecordOptions().members.map((member) => member.id)).not.toContain(
		second.member.id
	);
	expect(() => core.serviceRecords.create(input)).toThrow(
		expect.objectContaining({ code: 'member-removed' })
	);
	expect(() => core.serviceRecords.update(other.id, input)).toThrow(
		expect.objectContaining({ code: 'member-removed' })
	);
	await harness.start();
	for (const record of records) {
		expect(harness.core.serviceRecords.get(record.id).member?.name).toBe('Jamie');
	}
});

test('a remaining Member can claim a removed email but active email uniqueness still applies', async () => {
	const { core, first, second } = await setup();
	core.members.remove(first.token, second.member.id);
	expect(
		core.auth.updateProfile(first.token, { name: 'Morgan', email: ' JAMIE@EXAMPLE.COM ' }).email
	).toBe('jamie@example.com');
	const invite = tokenOf(core.invites.create(first.member.id, 'http://housebook.lan').url);
	await expect(
		core.invites.redeem(invite, {
			memberName: 'Taylor',
			email: 'JAMIE@example.com',
			password
		})
	).rejects.toMatchObject({ code: 'email-in-use' });
	expect(core.invites.isValid(invite)).toBe(true);
});

test('removal revokes the Member’s unused Invites, including a redemption in progress', async () => {
	const { core, first, second } = await setup();
	const unused = core.invites.create(second.member.id, 'http://housebook.lan');
	const retained = core.invites.create(first.member.id, 'http://housebook.lan');
	const redemption = core.invites.redeem(tokenOf(unused.url), {
		memberName: 'Taylor',
		email: 'taylor@example.com',
		password
	});
	core.members.remove(first.token, second.member.id);
	await expect(redemption).rejects.toMatchObject({ code: 'invalid-invite' });
	expect(() => core.invites.create(second.member.id, 'http://housebook.lan')).toThrow(
		expect.objectContaining({ code: 'member-not-found' })
	);
	await harness.start();
	expect(harness.core.invites.list()).toEqual([
		{
			id: retained.id,
			createdBy: first.member.id,
			createdAt: retained.createdAt,
			expiresAt: retained.expiresAt
		}
	]);
	expect(harness.core.invites.isValid(tokenOf(unused.url))).toBe(false);
	expect(harness.core.members.list()).toEqual([first.member]);
});

test('sign-in and password changes in flight cannot restore access after removal', async () => {
	const { core, first, second } = await setup();
	const signIn = core.auth.signIn(second.member.email, 'another calm house');
	const change = core.auth.changePassword(second.token, 'another calm house', 'a new calm house');
	core.members.remove(first.token, second.member.id);
	await expect(signIn).rejects.toMatchObject({ code: 'invalid-credentials' });
	await expect(change).rejects.toMatchObject({ code: 'session-required' });
	expect(core.auth.validateSession(second.token)).toBeNull();
});

test('removing yourself when another Member remains ends your sessions, not theirs', async () => {
	const { core, first, second } = await setup();
	core.members.remove(second.token, second.member.id);
	expect(core.auth.validateSession(second.token)).toBeNull();
	expect(core.auth.validateSession(first.token)?.member).toEqual(first.member);
	expect(core.members.list()).toEqual([first.member]);
});
