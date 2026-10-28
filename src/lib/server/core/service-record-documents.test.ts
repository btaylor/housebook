import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createHousebookHarness } from '../testing/harness';

type Harness = Awaited<ReturnType<typeof createHousebookHarness>>;
const harnesses: Harness[] = [];
const upload = (name = 'manual.pdf') =>
	new File([new Uint8Array(readFileSync(resolve('tests/fixtures', name)))], name);
const storedNames = (value: Harness) => readdirSync(join(value.dataDirectory, 'files'));

async function harness() {
	const value = await createHousebookHarness();
	harnesses.push(value);
	const contractor = value.core.contractors.create({ name: 'Willow Plumbing' });
	return { value, contractorId: contractor.id };
}

afterEach(() => {
	for (const value of harnesses.splice(0)) value.dispose();
});

test('Service Record Documents use the shared file types, conversion, limits and title rules', async () => {
	const { value, contractorId } = await harness();
	const record = value.core.serviceRecords.create({
		date: '2026-01-01',
		notes: 'Annual maintenance',
		contractorId
	});
	for (const [name, type] of [
		['manual.pdf', 'application/pdf'],
		['item-photo.jpg', 'image/jpeg'],
		['item-photo.png', 'image/png'],
		['item-photo.heic', 'image/jpeg']
	]) {
		const document = await value.core.documents.addToServiceRecord(
			record.id,
			` ${name} `,
			upload(name)
		);
		expect(value.core.documents.get(document.id)).toMatchObject({
			title: name,
			itemId: null,
			serviceRecordId: record.id,
			originalName: name,
			contentType: type
		});
		const opened = value.core.documents.open(document.id);
		const bytes = Buffer.concat(await opened.stream.toArray());
		if (name.endsWith('.heic')) {
			expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
			expect(opened.storedName).toMatch(/\.jpg$/);
		} else {
			expect(bytes).toEqual(readFileSync(resolve('tests/fixtures', name)));
		}
	}
	for (const [title, file, code] of [
		[' ', upload(), 'invalid-document-title'],
		['Receipt', new File([], ''), 'upload-required'],
		['Receipt', new File(['not an image'], 'receipt.jpg'), 'unsupported-file-type'],
		['Receipt', new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'receipt.pdf'), 'file-too-large']
	] as const) {
		await expect(
			value.core.documents.addToServiceRecord(record.id, title, file)
		).rejects.toMatchObject({ code });
	}
	expect(storedNames(value)).toHaveLength(4);
	await value.start();
	expect(value.core.serviceRecords.get(record.id).documents).toHaveLength(4);
});

test('an Item view groups Documents by covering Service Record and follows changes to coverage', async () => {
	const { value, contractorId } = await harness();
	const first = value.core.items.create({ name: 'Water heater', category: 'plumbing' });
	const second = value.core.items.create({ name: 'Furnace', category: 'HVAC' });
	const input = { date: '2026-01-01', notes: 'Annual maintenance', contractorId };
	const older = value.core.serviceRecords.create({ ...input, itemIds: [first.id, second.id] });
	const newer = value.core.serviceRecords.create({
		...input,
		date: '2026-02-01',
		itemIds: [first.id]
	});
	const wholeHouse = value.core.serviceRecords.create(input);
	const unrelated = value.core.serviceRecords.create({ ...input, itemIds: [second.id] });
	const manual = await value.core.documents.addToItem(first.id, 'Manual', upload());
	const receipt = await value.core.documents.addToServiceRecord(older.id, 'Receipt', upload());
	const invoice = await value.core.documents.addToServiceRecord(newer.id, 'Invoice', upload());
	await value.core.documents.addToServiceRecord(wholeHouse.id, 'Whole House receipt', upload());
	await value.core.documents.addToServiceRecord(unrelated.id, 'Unrelated receipt', upload());
	expect(
		value.core.serviceRecords.list({ itemId: first.id }).map(({ id, documents }) => ({
			id,
			documents: documents.map(({ id, title }) => ({ id, title }))
		}))
	).toEqual([
		{ id: newer.id, documents: [{ id: invoice.id, title: 'Invoice' }] },
		{ id: older.id, documents: [{ id: receipt.id, title: 'Receipt' }] }
	]);
	expect(value.core.documents.listForItem(first.id).map(({ id }) => id)).toEqual([manual.id]);
	expect(
		value.core.serviceRecords.list({ itemId: second.id }).find(({ id }) => id === older.id)
			?.documents
	).toEqual([expect.objectContaining({ id: receipt.id })]);
	value.core.serviceRecords.update(older.id, { ...input, itemIds: [second.id] });
	expect(value.core.serviceRecords.list({ itemId: first.id }).map(({ id }) => id)).toEqual([
		newer.id
	]);
	expect(value.core.documents.get(receipt.id).serviceRecordId).toBe(older.id);
});

test('deleting a Service Record removes its Documents and files but keeps other owners’ files', async () => {
	const { value, contractorId } = await harness();
	const item = await value.core.items.createWithPhoto(
		{ name: 'Water heater', category: 'plumbing' },
		upload('item-photo.png')
	);
	const input = {
		date: '2026-01-01',
		notes: 'Annual maintenance',
		contractorId,
		itemIds: [item.id]
	};
	const removed = value.core.serviceRecords.create(input);
	const retained = value.core.serviceRecords.create(input);
	const manual = await value.core.documents.addToItem(item.id, 'Manual', upload());
	const receipt = await value.core.documents.addToServiceRecord(retained.id, 'Receipt', upload());
	const removedDocuments = [
		await value.core.documents.addToServiceRecord(removed.id, 'Receipt', upload()),
		await value.core.documents.addToServiceRecord(removed.id, 'Invoice', upload('item-photo.jpg'))
	];
	const photo = value.core.items.openPhoto(item.id);
	await photo.stream.toArray();
	value.core.serviceRecords.delete(removed.id);
	for (const document of removedDocuments) {
		expect(() => value.core.documents.get(document.id)).toThrow(
			expect.objectContaining({ code: 'document-not-found' })
		);
	}
	const expectedNames = [
		photo.storedName,
		value.core.documents.get(manual.id).storedName,
		value.core.documents.get(receipt.id).storedName
	].sort();
	expect(storedNames(value).sort()).toEqual(expectedNames);
	expect(value.core.serviceRecords.list({ itemId: item.id }).map(({ id }) => id)).toEqual([
		retained.id
	]);
	const opened = value.core.documents.open(receipt.id);
	expect(Buffer.concat(await opened.stream.toArray())).toEqual(
		readFileSync(resolve('tests/fixtures/manual.pdf'))
	);
	await value.start();
	expect(storedNames(value).sort()).toEqual(expectedNames);
	expect(value.core.serviceRecords.get(retained.id).documents).toEqual([
		expect.objectContaining({ id: receipt.id })
	]);
});

test('refuses missing Service Record owners and cleans up when one disappears during upload', async () => {
	const { value, contractorId } = await harness();
	await expect(
		value.core.documents.addToServiceRecord('missing', 'Receipt', upload())
	).rejects.toMatchObject({
		code: 'service-record-not-found'
	});
	const record = value.core.serviceRecords.create({
		date: '2026-01-01',
		notes: 'Annual maintenance',
		contractorId
	});
	const adding = value.core.documents.addToServiceRecord(record.id, 'Receipt', upload());
	value.core.serviceRecords.delete(record.id);
	await expect(adding).rejects.toMatchObject({ code: 'service-record-not-found' });
	expect(storedNames(value)).toEqual([]);
});
