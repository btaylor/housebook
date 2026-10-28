import { afterEach, expect, test } from 'vitest';
import { DomainError } from './index';
import { createHousebookHarness } from '../testing/harness';

type Harness = Awaited<ReturnType<typeof createHousebookHarness>>;
let harness: Harness;

afterEach(() => harness?.dispose());

test('creates, views, edits, and persists Contractor details with optional fields', async () => {
	harness = await createHousebookHarness();
	const contractors = harness.core.contractors;
	const created = contractors.create({
		name: '  Willow Plumbing  ',
		phone: ' +1 (415) [555].01-23 ',
		email: ' WILLOW@Example.COM ',
		trade: ' Plumbing ',
		notes: ' Shutoff beside the garage.\nAsk for Lee. '
	});
	expect(created).toEqual({
		id: expect.any(String),
		name: 'Willow Plumbing',
		phone: '+14155550123',
		email: 'willow@example.com',
		trade: 'Plumbing',
		notes: 'Shutoff beside the garage.\nAsk for Lee.',
		archivedAt: null
	});
	expect(contractors.get(created.id)).toEqual(created);
	const edited = contractors.update(created.id, {
		name: 'Willow Repairs',
		phone: ' (415) 555.0199 ',
		email: ' LEE@EXAMPLE.COM ',
		trade: 'Repairs',
		notes: 'Call in the morning.'
	});
	expect(edited).toEqual({
		...created,
		name: 'Willow Repairs',
		phone: '4155550199',
		email: 'lee@example.com',
		trade: 'Repairs',
		notes: 'Call in the morning.'
	});
	await harness.start();
	expect(harness.core.contractors.get(created.id)).toEqual(edited);
	expect(harness.core.contractors.update(created.id, { name: 'Lee' })).toEqual({
		...created,
		name: 'Lee',
		phone: '',
		email: '',
		trade: '',
		notes: ''
	});
	expect(harness.core.contractors.create({ name: 'Name only' })).toMatchObject({
		name: 'Name only',
		phone: '',
		email: '',
		trade: '',
		notes: '',
		archivedAt: null
	});
});

test.each(['', ' \t\n '])('allows optional blank phone and email values: %j', async (blank) => {
	harness = await createHousebookHarness();
	const contractors = harness.core.contractors;
	const created = contractors.create({ name: 'Lee', phone: blank, email: blank });
	expect(created).toMatchObject({ phone: '', email: '' });
	contractors.update(created.id, {
		name: 'Lee',
		phone: '+1 415 555 0123',
		email: 'lee@example.com'
	});
	expect(contractors.update(created.id, { name: 'Lee', phone: blank, email: blank })).toMatchObject(
		{
			phone: '',
			email: ''
		}
	);
});

test.each([
	['phone', '+ (---) []...', 'invalid-contractor-phone'],
	['email', 'lee.example.com', 'invalid-contractor-email'],
	['email', 'lee@example', 'invalid-contractor-email'],
	['email', 'lee.example@host', 'invalid-contractor-email']
] as const)(
	'rejects invalid %s %j on create and edit without changing data',
	async (field, value, code) => {
		harness = await createHousebookHarness();
		const contractors = harness.core.contractors;
		const input = { name: 'Lee', [field]: value };
		expect(() => contractors.create(input)).toThrowError(expect.objectContaining({ code }));
		expect(contractors.list()).toEqual([]);
		const created = contractors.create({ name: 'Lee', phone: '5550123', email: 'lee@example.com' });
		expect(() => contractors.update(created.id, input)).toThrowError(
			expect.objectContaining({ code })
		);
		expect(contractors.get(created.id)).toEqual(created);
	}
);

test('keeps only a leading phone plus and uses only the simple email check', async () => {
	harness = await createHousebookHarness();
	const contractors = harness.core.contractors;
	const created = contractors.create({ name: 'Lee', phone: '1+2x3', email: ' @. ' });
	expect(created).toMatchObject({ phone: '123', email: '@.' });
	expect(
		contractors.update(created.id, { name: 'Lee', phone: ' +4+5x6 ', email: ' A B@C.D ' })
	).toMatchObject({ phone: '+456', email: 'a b@c.d' });
});

test('requires a non-blank name on create and edit without changing stored details', async () => {
	harness = await createHousebookHarness();
	const contractors = harness.core.contractors;
	expect(() => contractors.create({ name: '' })).toThrow(
		new DomainError('invalid-contractor-name', 'Enter a Contractor name.')
	);
	expect(contractors.list()).toEqual([]);
	const created = contractors.create({ name: 'Lee' });
	expect(() => contractors.update(created.id, { name: ' \t\n ' })).toThrow(
		new DomainError('invalid-contractor-name', 'Enter a Contractor name.')
	);
	expect(contractors.get(created.id)).toEqual(created);
});

test('Archive preserves details, hides from active queries, and un-Archive restores them', async () => {
	harness = await createHousebookHarness();
	const contractors = harness.core.contractors;
	const willow = contractors.create({ name: 'Willow', phone: '555-0123', notes: 'Keep this.' });
	const ash = contractors.create({ name: 'ash' });
	expect(contractors.list()).toEqual([ash, willow]);
	const archived = contractors.archive(willow.id);
	expect(archived).toEqual({ ...willow, archivedAt: harness.core.clock() });
	expect(contractors.get(willow.id)).toEqual(archived);
	expect(contractors.list()).toEqual([ash]);
	expect(contractors.listActive()).toEqual([ash]);
	expect(contractors.list({ includeArchived: true })).toEqual([ash, archived]);
	harness.setTime('2026-02-03T00:00:00.000Z');
	expect(contractors.archive(willow.id)).toEqual(archived);
	expect(contractors.update(willow.id, { ...willow, trade: 'Plumbing' }).archivedAt).toEqual(
		archived.archivedAt
	);
	await harness.start();
	expect(harness.core.contractors.listActive()).toEqual([ash]);
	const restored = harness.core.contractors.unarchive(willow.id);
	expect(restored).toEqual({ ...willow, trade: 'Plumbing' });
	expect(harness.core.contractors.listActive()).toEqual([ash, restored]);
	expect(harness.core.contractors.unarchive(willow.id)).toEqual(restored);
});

test('reports missing Contractors for reads and mutations', async () => {
	harness = await createHousebookHarness();
	const contractors = harness.core.contractors;
	for (const operation of [
		() => contractors.get('missing'),
		() => contractors.update('missing', { name: 'Lee' }),
		() => contractors.archive('missing'),
		() => contractors.unarchive('missing')
	]) {
		expect(operation).toThrow(new DomainError('contractor-not-found', 'Contractor not found.'));
	}
	expect(contractors.list({ includeArchived: true })).toEqual([]);
});
