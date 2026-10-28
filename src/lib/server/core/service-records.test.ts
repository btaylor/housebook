import { afterEach, expect, test } from 'vitest';
import { sql } from 'drizzle-orm';
import { createHousebookHarness } from '../testing/harness';

type Harness = Awaited<ReturnType<typeof createHousebookHarness>>;
let harness: Harness;
afterEach(() => harness?.dispose());

async function setup() {
	harness = await createHousebookHarness();
	const core = harness.core;
	const session = await core.setup.complete({
		code: core.setup.issueCode()!,
		houseName: 'Willow House',
		currency: 'GBP',
		memberName: 'Morgan',
		email: 'morgan@example.com',
		password: 'a calm willow house'
	});
	const contractor = core.contractors.create({ name: 'Willow Plumbing' });
	const furnace = core.items.create({ name: 'Furnace', category: 'HVAC' });
	const pump = core.items.create({ name: 'Pump', category: 'plumbing' });
	return { core, memberId: session.member.id, contractor, furnace, pump };
}

test('requires exactly one existing Contractor or Member on create and edit', async () => {
	const { core, contractor, memberId } = await setup();
	const input = { date: '2026-01-01', notes: 'Annual service' };
	for (const performer of [
		{},
		{ contractorId: contractor.id, memberId },
		{ contractorId: 'missing' },
		{ memberId: 'missing' }
	]) {
		expect(() => core.serviceRecords.create({ ...input, ...performer })).toThrow();
	}
	expect(core.serviceRecords.list()).toEqual([]);
	const record = core.serviceRecords.create({ ...input, memberId });
	expect(() => core.serviceRecords.get('')).toThrow(
		expect.objectContaining({ code: 'service-record-not-found' })
	);
	expect(core.serviceRecords.list({ itemId: '' })).toEqual([]);
	expect(core.serviceRecords.list({ contractorId: '' })).toEqual([]);
	expect(record.member).toEqual({ id: memberId, name: 'Morgan' });
	expect(record.contractor).toBeNull();
	for (const performer of [{}, { contractorId: contractor.id, memberId }]) {
		expect(() => core.serviceRecords.update(record.id, { ...input, ...performer })).toThrow(
			expect.objectContaining({ code: 'invalid-service-record-performer' })
		);
		expect(core.serviceRecords.get(record.id)).toEqual(record);
	}
	const updated = core.serviceRecords.update(record.id, { ...input, contractorId: contractor.id });
	expect(updated.member).toBeNull();
	expect(updated.contractor?.id).toBe(contractor.id);
});

test('links zero, one or many Items and replaces links atomically on edit', async () => {
	const { core, contractor, furnace, pump } = await setup();
	const input = { date: '2026-01-01', notes: 'Service', contractorId: contractor.id };
	const wholeHouse = core.serviceRecords.create(input);
	expect(wholeHouse.items).toEqual([]);
	expect(core.serviceRecords.list({ itemId: furnace.id })).toEqual([]);
	const record = core.serviceRecords.create({ ...input, itemIds: [furnace.id, pump.id, pump.id] });
	expect(record.items.map((item) => item.id)).toEqual([furnace.id, pump.id]);
	expect(core.serviceRecords.list({ itemId: furnace.id })).toEqual([record]);
	expect(core.serviceRecords.list({ itemId: pump.id })).toEqual([record]);
	expect(() =>
		core.serviceRecords.update(record.id, { ...input, notes: 'Lost?', itemIds: ['missing'] })
	).toThrow(expect.objectContaining({ code: 'item-not-found' }));
	expect(core.serviceRecords.get(record.id)).toEqual(record);
	expect(() => core.serviceRecords.create({ ...input, itemIds: [furnace.id, 'missing'] })).toThrow(
		expect.objectContaining({ code: 'item-not-found' })
	);
	expect(core.serviceRecords.list()).toHaveLength(2);
	const updated = core.serviceRecords.update(record.id, { ...input, itemIds: [pump.id] });
	expect(updated.items.map((item) => item.id)).toEqual([pump.id]);
	expect(core.serviceRecords.list({ itemId: furnace.id })).toEqual([]);
	expect(core.serviceRecords.list({ itemId: pump.id })).toEqual([updated]);
	expect(core.serviceRecords.update(record.id, input).items).toEqual([]);
	await harness.start();
	expect(harness.core.serviceRecords.get(record.id).items).toEqual([]);
});

test('stores exact integer cents, zero and optional costs across restarts', async () => {
	const { core, memberId } = await setup();
	const input = { date: '2026-01-01', notes: '', memberId };
	for (const [cost, cents] of [
		['0', 0],
		['1.1', 110],
		[' 1234.56 ', 123456],
		['0.29', 29],
		['90071992547409.91', Number.MAX_SAFE_INTEGER],
		['', null]
	] as const) {
		const record = core.serviceRecords.create({ ...input, cost });
		expect(record.costCents).toBe(cents);
	}
	const record = core.serviceRecords.create({ ...input, cost: '100' });
	expect(core.serviceRecords.update(record.id, input).costCents).toBeNull();
	await harness.start();
	expect(harness.core.serviceRecords.list().map((record) => record.costCents)).toContain(123456);
	expect(harness.core.setup.getHouse()?.currency).toBe('GBP');
});

test('rejects invalid costs and calendar dates without changing the stored record', async () => {
	const { core, memberId } = await setup();
	const input = { date: '2024-02-29', notes: 'Keep', memberId, cost: '42.50' };
	const record = core.serviceRecords.create(input);
	for (const cost of ['-1', '1.001', 'Infinity', 'NaN', '1e3', '12,50', '90071992547409.92']) {
		expect(() => core.serviceRecords.update(record.id, { ...input, cost })).toThrow(
			expect.objectContaining({ code: 'invalid-service-record-cost' })
		);
	}
	for (const date of [
		'',
		'0000-01-01',
		'2026-02-29',
		'2026-04-31',
		'2026-1-1',
		'2026-01-01T00:00Z'
	]) {
		expect(() => core.serviceRecords.create({ ...input, date })).toThrow(
			expect.objectContaining({ code: 'invalid-service-record-date' })
		);
	}
	expect(core.serviceRecords.get(record.id)).toEqual(record);
	expect(core.serviceRecords.list()).toEqual([record]);
});

test('orders the Maintenance Log and Item and Contractor histories newest first by calendar date', async () => {
	const { core, contractor, memberId, pump } = await setup();
	const input = { notes: 'Service', contractorId: contractor.id, itemIds: [pump.id] };
	const middle = core.serviceRecords.create({ ...input, date: '2025-12-20' });
	const newest = core.serviceRecords.create({ ...input, date: '2026-01-02' });
	const oldest = core.serviceRecords.create({ ...input, date: '2024-02-29' });
	const other = core.serviceRecords.create({ notes: 'DIY', date: '2026-01-01', memberId });
	expect(core.serviceRecords.list().map((record) => record.id)).toEqual([
		newest.id,
		other.id,
		middle.id,
		oldest.id
	]);
	for (const filter of [{ itemId: pump.id }, { contractorId: contractor.id }]) {
		expect(core.serviceRecords.list(filter).map((record) => record.id)).toEqual([
			newest.id,
			middle.id,
			oldest.id
		]);
	}
	expect(core.serviceRecords.list({ contractorId: 'missing' })).toEqual([]);
});

test('excludes Archived Contractors from new assignments while keeping existing records editable', async () => {
	const { core, contractor, memberId } = await setup();
	const input = { date: '2026-01-01', notes: 'Annual service', contractorId: contractor.id };
	const record = core.serviceRecords.create(input);
	core.contractors.archive(contractor.id);
	expect(core.contractors.listActive()).toEqual([]);
	expect(core.serviceRecordOptions().contractors).toEqual([]);
	expect(core.serviceRecords.get(record.id).contractor).toMatchObject({
		id: contractor.id,
		name: contractor.name,
		archivedAt: core.clock()
	});
	expect(core.serviceRecords.list({ contractorId: contractor.id })).toHaveLength(1);
	expect(core.serviceRecordOptions(record.id).contractors).toMatchObject([{ id: contractor.id }]);
	expect(core.serviceRecords.update(record.id, { ...input, notes: 'Corrected' }).notes).toBe(
		'Corrected'
	);
	expect(() => core.serviceRecords.create(input)).toThrow(
		expect.objectContaining({ code: 'contractor-archived' })
	);
	const diy = core.serviceRecords.create({ date: input.date, notes: 'DIY', memberId });
	expect(() => core.serviceRecords.update(diy.id, input)).toThrow(
		expect.objectContaining({ code: 'contractor-archived' })
	);
	core.contractors.unarchive(contractor.id);
	expect(core.serviceRecords.update(diy.id, input).contractor?.id).toBe(contractor.id);
});

test('protects linked Items and releases links when a Service Record is deleted', async () => {
	const { core, contractor, furnace, pump } = await setup();
	const input = { date: '2026-01-01', notes: 'Service', contractorId: contractor.id };
	const record = core.serviceRecords.create({ ...input, itemIds: [furnace.id, pump.id] });
	for (const item of [furnace, pump]) {
		expect(() => core.items.delete(item.id)).toThrow(
			expect.objectContaining({ code: 'item-has-service-records' })
		);
		expect(core.items.get(item.id)?.name).toBe(item.name);
	}
	core.serviceRecords.delete(record.id);
	expect(core.serviceRecords.list()).toEqual([]);
	expect(core.serviceRecords.list({ itemId: furnace.id })).toEqual([]);
	expect(core.serviceRecords.list({ contractorId: contractor.id })).toEqual([]);
	core.items.delete(furnace.id);
	expect(core.items.get(furnace.id)).toBeNull();
	for (const operation of [
		() => core.serviceRecords.get(record.id),
		() => core.serviceRecords.update(record.id, input),
		() => core.serviceRecords.delete(record.id)
	])
		expect(operation).toThrow(expect.objectContaining({ code: 'service-record-not-found' }));
});

test('keeps Retired Items visible and linked in past Service Records', async () => {
	const { core, memberId, pump } = await setup();
	const input = { date: '2026-01-01', notes: 'Pump service', memberId, itemIds: [pump.id] };
	const record = core.serviceRecords.create(input);
	core.database.run(sql`UPDATE items SET retiredDate = '2026-01-02' WHERE id = ${pump.id}`);
	expect(core.items.list()).not.toContainEqual(expect.objectContaining({ id: pump.id }));
	expect(core.serviceRecords.get(record.id).items).toEqual([
		{ id: pump.id, name: pump.name, retiredDate: '2026-01-02' }
	]);
	expect(core.serviceRecords.list({ itemId: pump.id })).toHaveLength(1);
	expect(core.serviceRecordOptions(record.id).items).toContainEqual(
		expect.objectContaining({ id: pump.id, retiredDate: '2026-01-02' })
	);
	expect(
		core.serviceRecords.update(record.id, { ...input, notes: 'Corrected' }).items
	).toHaveLength(1);
	expect(() => core.items.delete(pump.id)).toThrow(
		expect.objectContaining({ code: 'item-has-service-records' })
	);
});
