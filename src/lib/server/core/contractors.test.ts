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
		phone: ' +1 415 555 0123 ',
		email: ' willow@example.com ',
		trade: ' Plumbing ',
		notes: ' Shutoff beside the garage.\nAsk for Lee. '
	});
	expect(created).toEqual({
		id: expect.any(String),
		name: 'Willow Plumbing',
		phone: '+1 415 555 0123',
		email: 'willow@example.com',
		trade: 'Plumbing',
		notes: 'Shutoff beside the garage.\nAsk for Lee.',
		archivedAt: null
	});
	expect(contractors.get(created.id)).toEqual(created);
	const edited = contractors.update(created.id, {
		name: 'Willow Repairs',
		phone: '555-0199',
		email: 'lee@example.com',
		trade: 'Repairs',
		notes: 'Call in the morning.'
	});
	expect(edited).toEqual({
		...created,
		name: 'Willow Repairs',
		phone: '555-0199',
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
