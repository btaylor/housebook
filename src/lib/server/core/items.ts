import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import { itemCategories, type ItemInput } from '../../items';
import { documents, items, serviceRecordItems } from '../schema';
import { DomainError } from './errors';
import type { Files } from './files';

function calendarDate(value: string | null | undefined, label: string) {
	if (!value) return null;
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
		value.startsWith('0000') ||
		!Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) ||
		new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
	) {
		throw new DomainError('invalid-item-date', `Enter a valid ${label} as YYYY-MM-DD.`);
	}
	return value;
}

function fields(input: ItemInput) {
	const name = input.name.trim();
	if (!name) throw new DomainError('invalid-item-name', 'Enter an Item name.');
	const category = itemCategories.find((category) => category === input.category);
	if (!category) throw new DomainError('invalid-item-category', 'Choose a category from the list.');
	return {
		name,
		category,
		location: input.location?.trim() || null,
		make: input.make?.trim() || null,
		model: input.model?.trim() || null,
		serialNumber: input.serialNumber?.trim() || null,
		installDate: calendarDate(input.installDate, 'install date'),
		warrantyEndDate: calendarDate(input.warrantyEndDate, 'warranty end date'),
		notes: input.notes?.trim() || null
	};
}

export class Items {
	constructor(
		private database: NodeSQLiteDatabase,
		private clock: () => Date,
		private files: Files
	) {}

	create(input: ItemInput) {
		return this.database
			.insert(items)
			.values({ id: randomUUID(), ...fields(input) })
			.returning()
			.get();
	}

	async createWithPhoto(input: ItemInput, upload: File, authorize?: () => void) {
		const values = fields(input);
		return this.files.save(upload, true, (file) => {
			authorize?.();
			return this.database
				.insert(items)
				.values({ id: randomUUID(), ...values, photoId: file.id })
				.returning()
				.get();
		});
	}

	update(id: string, input: ItemInput) {
		const item = this.database
			.update(items)
			.set(fields(input))
			.where(eq(items.id, id))
			.returning()
			.get();
		if (!item) throw new DomainError('item-not-found', 'Item not found.');
		return item;
	}

	get(id: string) {
		const item = this.database.select().from(items).where(eq(items.id, id)).get();
		if (!item) return null;
		const today = this.clock().toISOString().slice(0, 10);
		const warrantyStatus = item.warrantyEndDate
			? item.warrantyEndDate < today
				? 'ended'
				: 'active'
			: null;
		return { ...item, warrantyStatus };
	}

	list({ search = '', category = '', includeRetired = false } = {}) {
		return this.database
			.select()
			.from(items)
			.where(
				and(
					includeRetired ? undefined : isNull(items.retiredDate),
					search.trim() ? sql`instr(lower(${items.name}), lower(${search.trim()})) > 0` : undefined,
					category ? sql`${items.category} = ${category}` : undefined
				)
			)
			.orderBy(asc(items.name), asc(items.id))
			.all();
	}

	async setPhoto(id: string, upload: File, authorize?: () => void) {
		this.requireItem(id);
		return this.files.save(upload, true, (file) => {
			authorize?.();
			this.requireItem(id);
			return this.database
				.update(items)
				.set({ photoId: file.id })
				.where(eq(items.id, id))
				.returning()
				.get()!;
		});
	}

	removePhoto(id: string) {
		this.requireItem(id);
		this.database.update(items).set({ photoId: null }).where(eq(items.id, id)).run();
		this.files.removeUnused();
	}

	openPhoto(id: string) {
		const item = this.requireItem(id);
		if (!item.photoId) throw new DomainError('document-not-found', 'Photo not found.');
		return this.files.open(item.photoId);
	}

	delete(id: string) {
		this.database.transaction(() => {
			this.requireItem(id);
			if (
				this.database
					.select({ id: serviceRecordItems.serviceRecordId })
					.from(serviceRecordItems)
					.where(eq(serviceRecordItems.itemId, id))
					.get()
			) {
				throw new DomainError(
					'item-has-service-records',
					'This Item has Service Records and cannot be deleted.'
				);
			}
			this.database.delete(documents).where(eq(documents.itemId, id)).run();
			this.database.delete(items).where(eq(items.id, id)).run();
		});
		this.files.removeUnused();
	}

	private requireItem(id: string) {
		const item = this.get(id);
		if (!item) throw new DomainError('item-not-found', 'Item not found.');
		return item;
	}
}
