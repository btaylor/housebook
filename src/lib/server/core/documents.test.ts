import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { eq } from 'drizzle-orm';
import { afterEach, expect, test } from 'vitest';
import { documents } from '../schema';
import { createHousebookHarness } from '../testing/harness';

type Harness = Awaited<ReturnType<typeof createHousebookHarness>>;
const harnesses: Harness[] = [];
const itemInput = { name: 'Water heater', category: 'plumbing' };
const fixture = (name: string) => readFileSync(resolve('tests/fixtures', name));
const upload = (name: string, type = '') =>
	new File([new Uint8Array(fixture(name))], name, { type });
const storedNames = (harness: Harness) => readdirSync(join(harness.dataDirectory, 'files'));
setFlagsFromString('--expose-gc');
const collectGarbage: () => void = runInNewContext('gc');

function paddedPdf(size: number) {
	const original = fixture('manual.pdf');
	const xref = original.indexOf('xref\n');
	const prefix = original.subarray(0, xref);
	const trailer = original.subarray(xref).toString();
	let padding = size - original.length;
	let adjusted: string;
	let difference: number;
	do {
		adjusted = trailer.replace(/startxref\n\d+/, `startxref\n${prefix.length + padding}`);
		difference = size - (prefix.length + padding + adjusted.length);
		padding += difference;
	} while (difference !== 0);
	return Buffer.concat([prefix, Buffer.alloc(padding, ' '), Buffer.from(adjusted)]);
}

async function harness() {
	const value = await createHousebookHarness();
	harnesses.push(value);
	return value;
}

afterEach(() => {
	for (const value of harnesses.splice(0)) value.dispose();
});
test('repeated valid and invalid HEIC uploads do not retain decoder memory', async () => {
	const value = await harness();
	const item = value.core.items.create(itemInput);
	const padding = Buffer.alloc(1024 * 1024);
	padding.writeUInt32BE(padding.length);
	padding.write('free', 4);
	const data = Buffer.concat([fixture('item-photo.heic'), padding]);
	const photo = new File([data], 'label.heic', { type: 'image/heic' });
	const broken = new File(
		[Buffer.concat([fixture('item-photo.heic').subarray(0, 40), padding])],
		'broken.heic'
	);
	await value.core.items.setPhoto(item.id, photo);
	collectGarbage();
	collectGarbage();
	const before = process.memoryUsage().arrayBuffers;
	for (let index = 0; index < 40; index++) {
		await value.core.items.setPhoto(item.id, photo);
		await expect(value.core.items.setPhoto(item.id, broken)).rejects.toMatchObject({
			code: 'invalid-file'
		});
	}
	collectGarbage();
	collectGarbage();
	const retained = process.memoryUsage().arrayBuffers - before;
	expect(retained).toBeLessThan(8 * 1024 * 1024);
	expect(storedNames(value)).toHaveLength(1);
	const opened = value.core.items.openPhoto(item.id);
	expect(opened.contentType).toBe('image/jpeg');
	expect(Buffer.concat(await opened.stream.toArray()).subarray(0, 3)).toEqual(
		Buffer.from([0xff, 0xd8, 0xff])
	);
}, 30_000);

test.each([
	['JPEG marker', 'image/jpeg', 'broken.jpg', () => Buffer.from([0xff, 0xd8, 0xff])],
	['truncated JPEG', 'image/jpeg', 'broken.jpg', () => fixture('item-photo.jpg').subarray(0, 100)],
	['PNG signature', 'image/png', 'broken.png', () => fixture('item-photo.png').subarray(0, 8)],
	['truncated PNG', 'image/png', 'broken.png', () => fixture('item-photo.png').subarray(0, 100)],
	['PDF header', 'application/pdf', 'broken.pdf', () => Buffer.from('%PDF-not a valid pdf')],
	['truncated PDF', 'application/pdf', 'broken.pdf', () => fixture('manual.pdf').subarray(0, 100)]
] as const)(
	'refuses %s before adding a Document or replacing a good photo',
	async (_description, type, name, contents) => {
		const value = await harness();
		const item = await value.core.items.createWithPhoto(itemInput, upload('item-photo.png'));
		const oldPhotoId = item.photoId;
		const before = storedNames(value);
		const file = new File([new Uint8Array(contents())], name, { type });
		await expect(
			value.core.documents.addToItem(item.id, 'Broken Document', file)
		).rejects.toMatchObject({ code: 'invalid-file' });
		if (type !== 'application/pdf') {
			await expect(value.core.items.setPhoto(item.id, file)).rejects.toMatchObject({
				code: 'invalid-file'
			});
		}
		expect(value.core.documents.listForItem(item.id)).toEqual([]);
		expect(value.core.items.get(item.id)?.photoId).toBe(oldPhotoId);
		expect(storedNames(value)).toEqual(before);
		const opened = value.core.items.openPhoto(item.id);
		expect(Buffer.concat(await opened.stream.toArray())).toEqual(fixture('item-photo.png'));
	}
);

test('stores generated names, original metadata and bytes for PDF, JPEG and PNG Documents', async () => {
	const value = await harness();
	const item = value.core.items.create(itemInput);
	for (const [name, type] of [
		['manual.pdf', 'application/pdf'],
		['item-photo.jpg', 'image/jpeg'],
		['item-photo.png', 'image/png']
	]) {
		const document = await value.core.documents.addToItem(item.id, `  ${name}  `, upload(name));
		const opened = value.core.documents.open(document.id);
		expect(opened).toMatchObject({
			title: name,
			originalName: name,
			contentType: type,
			size: fixture(name).length
		});
		expect(opened.storedName).toMatch(/^[0-9a-f-]{36}\.(pdf|jpg|png)$/);
		expect(await opened.stream.toArray()).not.toHaveLength(0);
		expect(readFileSync(join(value.dataDirectory, 'files', opened.storedName))).toEqual(
			fixture(name)
		);
	}
	expect(storedNames(value)).toHaveLength(3);
	await value.start();
	expect(value.core.documents.listForItem(item.id)).toHaveLength(3);
});

test('ignores claimed MIME types and never uses an original name as a storage path', async () => {
	const value = await harness();
	const item = value.core.items.create(itemInput);
	const document = await value.core.documents.addToItem(
		item.id,
		'Manual',
		new File([new Uint8Array(fixture('manual.pdf'))], '../../manual.html', { type: 'text/html' })
	);
	const opened = value.core.documents.open(document.id);
	expect(opened.originalName).toBe('../../manual.html');
	expect(opened.contentType).toBe('application/pdf');
	await opened.stream.toArray();
	expect(storedNames(value)).toEqual([opened.storedName]);
	expect(existsSync(join(value.dataDirectory, 'manual.html'))).toBe(false);
});

test('refuses unsupported content and files above 25 MB with distinct errors and no saved data', async () => {
	const value = await harness();
	const item = value.core.items.create(itemInput);
	await expect(
		value.core.documents.addToItem(
			item.id,
			'Disguised photo',
			new File(['<script>bad</script>'], 'photo.jpg', { type: 'image/jpeg' })
		)
	).rejects.toMatchObject({ code: 'unsupported-file-type' });
	const large = Buffer.alloc(25 * 1024 * 1024 + 1);
	large.write('%PDF-1.4');
	await expect(
		value.core.documents.addToItem(
			item.id,
			'Large manual',
			new File([large], 'manual.pdf', { type: 'application/pdf' })
		)
	).rejects.toMatchObject({ code: 'file-too-large' });
	expect(value.core.documents.listForItem(item.id)).toEqual([]);
	expect(storedNames(value)).toEqual([]);
});

test('accepts the 25 MB boundary', async () => {
	const value = await harness();
	const item = value.core.items.create(itemInput);
	const data = paddedPdf(25 * 1024 * 1024);
	const document = await value.core.documents.addToItem(
		item.id,
		'Manual',
		new File([data], 'manual.pdf')
	);
	expect(value.core.documents.get(document.id).size).toBe(data.length);
});

test('converts a real HEIC Document and main photo to JPEG and serves the converted bytes', async () => {
	const value = await harness();
	const item = value.core.items.create(itemInput);
	const document = await value.core.documents.addToItem(
		item.id,
		'Label',
		upload('item-photo.heic', 'image/heic')
	);
	await value.core.items.setPhoto(item.id, upload('item-photo.heic', 'image/heic'));
	for (const file of [
		value.core.documents.open(document.id),
		value.core.items.openPhoto(item.id)
	]) {
		const bytes = Buffer.concat(await file.stream.toArray());
		expect(file.originalName).toBe('item-photo.heic');
		expect(file.contentType).toBe('image/jpeg');
		expect(file.storedName).toMatch(/\.jpg$/);
		expect(file.size).toBe(bytes.length);
		expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
		expect(bytes.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
		expect(bytes).not.toEqual(fixture('item-photo.heic'));
	}
});

test('rejects unreadable HEIC, missing uploads and blank titles without leaving files', async () => {
	const value = await harness();
	const item = value.core.items.create(itemInput);
	const broken = fixture('item-photo.heic').subarray(0, 40);
	await expect(
		value.core.documents.addToItem(
			item.id,
			'Broken',
			new File([new Uint8Array(broken)], 'broken.heic')
		)
	).rejects.toMatchObject({ code: 'invalid-file' });
	await expect(
		value.core.documents.addToItem(item.id, 'Manual', new File([], ''))
	).rejects.toMatchObject({ code: 'upload-required' });
	await expect(
		value.core.documents.addToItem(item.id, '  ', upload('manual.pdf'))
	).rejects.toMatchObject({ code: 'invalid-document-title' });
	expect(storedNames(value)).toEqual([]);
});

test('renames and deletes only the selected Document and removes its stored file', async () => {
	const value = await harness();
	const first = value.core.items.create(itemInput);
	const second = value.core.items.create({ name: 'Dishwasher', category: 'appliance' });
	const manual = await value.core.documents.addToItem(first.id, 'Manual', upload('manual.pdf'));
	const receipt = await value.core.documents.addToItem(second.id, 'Receipt', upload('manual.pdf'));
	value.core.documents.rename(manual.id, '  Owner’s manual  ');
	expect(() => value.core.documents.rename(manual.id, ' ')).toThrow(
		expect.objectContaining({ code: 'invalid-document-title' })
	);
	expect(value.core.documents.listForItem(first.id).map((document) => document.title)).toEqual([
		'Owner’s manual'
	]);
	const fileName = value.core.documents.get(manual.id).storedName;
	value.core.documents.delete(manual.id);
	expect(existsSync(join(value.dataDirectory, 'files', fileName))).toBe(false);
	expect(() => value.core.documents.open(manual.id)).toThrow(
		expect.objectContaining({ code: 'document-not-found' })
	);
	expect(value.core.documents.listForItem(first.id)).toEqual([]);
	expect(value.core.documents.listForItem(second.id).map((document) => document.id)).toEqual([
		receipt.id
	]);
	expect(storedNames(value)).toHaveLength(1);
});

test('creates an Item with a photo atomically, replaces it, and removes its old files', async () => {
	const value = await harness();
	await expect(
		value.core.items.createWithPhoto(itemInput, upload('manual.pdf'))
	).rejects.toMatchObject({ code: 'photo-required' });
	expect(value.core.items.list()).toEqual([]);
	const item = await value.core.items.createWithPhoto(itemInput, upload('item-photo.png'));
	const original = value.core.items.openPhoto(item.id);
	await original.stream.toArray();
	await expect(value.core.items.setPhoto(item.id, upload('manual.pdf'))).rejects.toMatchObject({
		code: 'photo-required'
	});
	expect(value.core.items.get(item.id)?.photoId).toBe(original.id);
	await value.core.items.setPhoto(item.id, upload('item-photo.jpg'));
	expect(existsSync(join(value.dataDirectory, 'files', original.storedName))).toBe(false);
	expect(storedNames(value)).toHaveLength(1);
	await value.start();
	const replaced = value.core.items.openPhoto(item.id);
	expect(replaced.contentType).toBe('image/jpeg');
	await replaced.stream.toArray();
	value.core.items.removePhoto(item.id);
	value.core.items.removePhoto(item.id);
	expect(value.core.items.get(item.id)?.photoId).toBeNull();
	expect(storedNames(value)).toEqual([]);
});

test('Retiring and un-Retiring preserve an Item’s photo, Documents and Service Records', async () => {
	const value = await harness();
	const item = await value.core.items.createWithPhoto(itemInput, upload('item-photo.png'));
	const document = await value.core.documents.addToItem(item.id, 'Manual', upload('manual.pdf'));
	const contractor = value.core.contractors.create({ name: 'Willow Plumbing' });
	const record = value.core.serviceRecords.create({
		date: '2026-01-01',
		notes: 'Annual maintenance',
		contractorId: contractor.id,
		itemIds: [item.id]
	});
	const before = storedNames(value);
	value.setTime('2026-02-03T23:59:59Z');
	expect(value.core.items.retire(item.id).retiredDate).toBe('2026-02-03');
	value.setTime('2026-02-04T00:00:00Z');
	expect(value.core.items.retire(item.id).retiredDate).toBe('2026-02-03');
	await value.start();
	expect(value.core.items.list()).toEqual([]);
	expect(value.core.items.list({ includeRetired: true })).toMatchObject([
		{ id: item.id, retiredDate: '2026-02-03', photoId: item.photoId }
	]);
	expect(value.core.serviceRecords.get(record.id)).toMatchObject({
		...record,
		items: [{ id: item.id, name: item.name, retiredDate: '2026-02-03' }]
	});
	expect(value.core.serviceRecords.list({ itemId: item.id })).toHaveLength(1);
	expect(value.core.documents.listForItem(item.id).map(({ id }) => id)).toEqual([document.id]);
	for (const [opened, name] of [
		[value.core.items.openPhoto(item.id), 'item-photo.png'],
		[value.core.documents.open(document.id), 'manual.pdf']
	] as const) {
		expect(Buffer.concat(await opened.stream.toArray())).toEqual(fixture(name));
	}
	expect(storedNames(value)).toEqual(before);
	value.core.items.unretire(item.id);
	value.core.items.unretire(item.id);
	await value.start();
	expect(value.core.items.list()).toEqual([item]);
	expect(value.core.serviceRecords.get(record.id)).toEqual(record);
	expect(value.core.documents.listForItem(item.id)).toHaveLength(1);
	expect(storedNames(value)).toEqual(before);
});

test('deleting an Item removes its photo and Documents but keeps another Item’s files', async () => {
	const value = await harness();
	const first = await value.core.items.createWithPhoto(itemInput, upload('item-photo.png'));
	const second = value.core.items.create(itemInput);
	const removed = await value.core.documents.addToItem(first.id, 'Manual', upload('manual.pdf'));
	await value.core.documents.addToItem(first.id, 'Warranty', upload('manual.pdf'));
	const retained = await value.core.documents.addToItem(second.id, 'Manual', upload('manual.pdf'));
	value.core.items.delete(first.id);
	expect(value.core.items.get(first.id)).toBeNull();
	expect(() => value.core.documents.get(removed.id)).toThrow(
		expect.objectContaining({ code: 'document-not-found' })
	);
	expect(storedNames(value)).toEqual([value.core.documents.get(retained.id).storedName]);
	await value.start();
	expect(value.core.documents.listForItem(second.id)).toHaveLength(1);
});

test('keeps Item files when Service Records prevent deletion, then cleans up after unlinking', async () => {
	const value = await harness();
	const item = await value.core.items.createWithPhoto(itemInput, upload('item-photo.png'));
	const document = await value.core.documents.addToItem(item.id, 'Manual', upload('manual.pdf'));
	const contractor = value.core.contractors.create({ name: 'Willow Plumbing' });
	const record = value.core.serviceRecords.create({
		date: '2026-01-01',
		notes: 'Annual maintenance',
		contractorId: contractor.id,
		itemIds: [item.id]
	});
	const receipt = await value.core.documents.addToServiceRecord(
		record.id,
		'Service receipt',
		upload('manual.pdf')
	);
	const before = storedNames(value);
	expect(() => value.core.items.delete(item.id)).toThrow(
		expect.objectContaining({ code: 'item-has-service-records' })
	);
	expect(value.core.items.get(item.id)?.photoId).toBe(item.photoId);
	expect(value.core.documents.listForItem(item.id).map(({ id }) => id)).toEqual([document.id]);
	expect(storedNames(value)).toEqual(before);
	const opened = value.core.items.openPhoto(item.id);
	expect(Buffer.concat(await opened.stream.toArray())).toEqual(fixture('item-photo.png'));
	const retained = value.core.serviceRecords.update(record.id, {
		date: record.date,
		notes: record.notes,
		contractorId: contractor.id
	});
	value.core.items.delete(item.id);
	expect(value.core.items.get(item.id)).toBeNull();
	expect(storedNames(value)).toEqual([value.core.documents.get(receipt.id).storedName]);
	await value.start();
	expect(value.core.serviceRecords.get(record.id)).toEqual(retained);
	const retainedFile = value.core.documents.open(receipt.id);
	expect(Buffer.concat(await retainedFile.stream.toArray())).toEqual(fixture('manual.pdf'));
});

test('requires exactly one existing Item or Service Record owner for a Document', async () => {
	const value = await harness();
	const item = value.core.items.create(itemInput);
	const document = await value.core.documents.addToItem(item.id, 'Manual', upload('manual.pdf'));
	const contractor = value.core.contractors.create({ name: 'Willow Plumbing' });
	const record = value.core.serviceRecords.create({
		date: '2026-01-01',
		notes: 'Annual maintenance',
		contractorId: contractor.id
	});
	for (const owner of [
		{ itemId: item.id, serviceRecordId: record.id },
		{ itemId: null, serviceRecordId: null },
		{ itemId: 'missing', serviceRecordId: null },
		{ itemId: null, serviceRecordId: 'missing' }
	]) {
		expect(() =>
			value.core.database.update(documents).set(owner).where(eq(documents.id, document.id)).run()
		).toThrow();
	}
	value.core.database
		.update(documents)
		.set({ itemId: null, serviceRecordId: record.id })
		.where(eq(documents.id, document.id))
		.run();
	await value.start();
	value.core.items.delete(item.id);
	expect(value.core.documents.get(document.id)).toMatchObject({
		itemId: null,
		serviceRecordId: record.id
	});
	const opened = value.core.documents.open(document.id);
	expect(Buffer.concat(await opened.stream.toArray())).toEqual(fixture('manual.pdf'));
	expect(storedNames(value)).toHaveLength(1);
});

test('does not leave files when an Item disappears during upload', async () => {
	const value = await harness();
	const item = value.core.items.create(itemInput);
	const adding = value.core.documents.addToItem(item.id, 'Manual', upload('manual.pdf'));
	value.core.items.delete(item.id);
	await expect(adding).rejects.toMatchObject({ code: 'item-not-found' });
	expect(storedNames(value)).toEqual([]);
	await expect(
		value.core.items.setPhoto('missing', upload('item-photo.png'))
	).rejects.toMatchObject({ code: 'item-not-found' });
});

test('startup completes interrupted file cleanup and retains owned Documents', async () => {
	const value = await harness();
	const item = value.core.items.create(itemInput);
	const removed = await value.core.documents.addToItem(item.id, 'Removed', upload('manual.pdf'));
	const retained = await value.core.documents.addToItem(item.id, 'Retained', upload('manual.pdf'));
	value.core.database.delete(documents).where(eq(documents.id, removed.id)).run();
	writeFileSync(
		join(value.dataDirectory, 'files', 'interrupted-upload.pdf'),
		fixture('manual.pdf')
	);
	await value.start();
	expect(storedNames(value)).toEqual([value.core.documents.get(retained.id).storedName]);
	expect(value.core.documents.listForItem(item.id).map((document) => document.title)).toEqual([
		'Retained'
	]);
});
