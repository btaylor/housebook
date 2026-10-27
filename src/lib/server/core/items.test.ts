import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, test } from 'vitest';
import { itemCategories } from '../../items';
import { items } from '../schema';
import { createHousebookHarness } from '../testing/harness';

type Harness = Awaited<ReturnType<typeof createHousebookHarness>>;
const harnesses: Harness[] = [];
const fullItem = {
	name: ' Water heater ',
	category: 'plumbing',
	location: 'Utility room',
	make: 'Rheem',
	model: 'XE50',
	serialNumber: 'WH-001',
	installDate: '2024-02-29',
	warrantyEndDate: '2034-02-28',
	notes: 'Shutoff valve is above the tank.\nKeep access clear.'
};

async function createHarness() {
	const harness = await createHousebookHarness();
	harnesses.push(harness);
	return harness;
}

afterEach(() => {
	for (const harness of harnesses.splice(0)) harness.dispose();
});

describe('Items', () => {
	test('creates, views, edits every field and persists across restarts', async () => {
		const harness = await createHarness();
		const created = harness.core.items.create(fullItem);
		expect(created).toEqual({
			...fullItem,
			id: expect.any(String),
			name: 'Water heater',
			retiredDate: null
		});
		const edited = {
			name: 'Dishwasher',
			category: 'appliance',
			location: 'Kitchen',
			make: 'Bosch',
			model: '800',
			serialNumber: 'DW-002',
			installDate: '2025-10-26',
			warrantyEndDate: '2027-10-26',
			notes: 'Use the eco cycle.'
		};
		expect(harness.core.items.update(created.id, edited)).toEqual({ ...created, ...edited });
		await harness.start();
		expect(harness.core.items.get(created.id)).toEqual({
			...created,
			...edited,
			warrantyStatus: 'active'
		});
	});

	test.each(itemCategories)(
		'accepts the fixed category %s and optional empty fields',
		async (category) => {
			const { core } = await createHarness();
			const item = core.items.create({ name: 'An Item', category });
			expect(item).toEqual({
				id: expect.any(String),
				name: 'An Item',
				category,
				location: null,
				make: null,
				model: null,
				serialNumber: null,
				installDate: null,
				warrantyEndDate: null,
				notes: null,
				retiredDate: null
			});
			expect(core.items.get(item.id)?.warrantyStatus).toBeNull();
		}
	);

	test.each([
		[{ name: ' \t ' }, 'invalid-item-name'],
		[{ category: '' }, 'invalid-item-category'],
		[{ category: 'furniture' }, 'invalid-item-category'],
		[{ installDate: '2025-02-29' }, 'invalid-item-date'],
		[{ warrantyEndDate: '2026-04-31' }, 'invalid-item-date'],
		[{ installDate: '2026-1-02' }, 'invalid-item-date'],
		[{ installDate: '2026-01-02T00:00:00Z' }, 'invalid-item-date'],
		[{ installDate: '0000-01-01' }, 'invalid-item-date']
	])(
		'rejects invalid fields on create and edit without changing data: %j',
		async (invalid, code) => {
			const { core } = await createHarness();
			const item = core.items.create(fullItem);
			expect(() => core.items.create({ ...fullItem, ...invalid })).toThrow(
				expect.objectContaining({ code })
			);
			expect(() => core.items.update(item.id, { ...fullItem, ...invalid })).toThrow(
				expect.objectContaining({ code })
			);
			expect(core.items.list()).toEqual([item]);
		}
	);

	test('clears all optional fields and does not invent a warranty', async () => {
		const { core } = await createHarness();
		const item = core.items.create(fullItem);
		const cleared = core.items.update(item.id, {
			name: item.name,
			category: item.category,
			location: '',
			make: '',
			model: '',
			serialNumber: '',
			installDate: '',
			warrantyEndDate: '',
			notes: ''
		});
		for (const field of [
			'location',
			'make',
			'model',
			'serialNumber',
			'installDate',
			'warrantyEndDate',
			'notes'
		] as const)
			expect(cleared[field]).toBeNull();
		expect(core.items.get(item.id)?.warrantyStatus).toBeNull();
	});

	test('searches names, filters category, combines both and excludes Retired Items', async () => {
		const { core } = await createHarness();
		const heater = core.items.create(fullItem);
		const pump = core.items.create({ name: 'Heat pump', category: 'HVAC', notes: 'Water heater' });
		const mower = core.items.create({ name: 'Mower 100%', category: 'yard' });
		const retired = core.items.create({ name: 'Old heater', category: 'plumbing' });
		core.database
			.update(items)
			.set({ retiredDate: '2025-12-31' })
			.where(eq(items.id, retired.id))
			.run();
		expect(core.items.list()).toEqual([pump, mower, heater]);
		expect(core.items.list({ search: ' HEAT ' })).toEqual([pump, heater]);
		expect(core.items.list({ category: 'plumbing' })).toEqual([heater]);
		expect(core.items.list({ search: 'heat', category: 'HVAC' })).toEqual([pump]);
		expect(core.items.list({ search: 'water', category: 'HVAC' })).toEqual([]);
		expect(core.items.list({ search: 'missing' })).toEqual([]);
		expect(core.items.list({ search: '%' })).toEqual([mower]);
		expect(core.items.list({ search: "' OR 1=1 --" })).toEqual([]);
		expect(core.items.list({ category: 'invalid' })).toEqual([]);
		expect(core.items.get(retired.id)?.retiredDate).toBe('2025-12-31');
	});

	test('uses the core clock: warranty is active through its end date and ended the next day', async () => {
		const harness = await createHarness();
		const item = harness.core.items.create({ ...fullItem, warrantyEndDate: '2026-01-02' });
		for (const instant of [
			'2026-01-01T23:59:59Z',
			'2026-01-02T00:00:00Z',
			'2026-01-02T23:59:59Z'
		]) {
			harness.setTime(instant);
			expect(harness.core.items.get(item.id)?.warrantyStatus).toBe('active');
		}
		harness.setTime('2026-01-03T00:00:00Z');
		expect(harness.core.items.get(item.id)?.warrantyStatus).toBe('ended');
	});

	test('calendar dates round-trip across server time zones and restarts', async () => {
		const previous = process.env.TZ;
		const harness = await createHarness();
		try {
			process.env.TZ = 'Pacific/Kiritimati';
			const item = harness.core.items.create(fullItem);
			for (const zone of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
				process.env.TZ = zone;
				await harness.start();
				expect(harness.core.items.get(item.id)).toMatchObject({
					installDate: fullItem.installDate,
					warrantyEndDate: fullItem.warrantyEndDate
				});
				harness.core.items.update(item.id, {
					...fullItem,
					installDate: '2026-03-08',
					warrantyEndDate: '2026-11-01'
				});
				expect(harness.core.items.get(item.id)).toMatchObject({
					installDate: '2026-03-08',
					warrantyEndDate: '2026-11-01'
				});
				harness.core.items.update(item.id, fullItem);
				harness.setTime('2026-01-03T00:01:00Z');
				harness.core.items.update(item.id, { ...fullItem, warrantyEndDate: '2026-01-02' });
				expect(harness.core.items.get(item.id)?.warrantyStatus).toBe('ended');
				harness.core.items.update(item.id, fullItem);
			}
		} finally {
			if (previous === undefined) delete process.env.TZ;
			else process.env.TZ = previous;
		}
	});

	test('handles a missing Item without creating one', async () => {
		const { core } = await createHarness();
		expect(core.items.get('missing')).toBeNull();
		expect(() => core.items.update('missing', fullItem)).toThrow(
			expect.objectContaining({ code: 'item-not-found' })
		);
		expect(core.items.list()).toEqual([]);
	});
});
