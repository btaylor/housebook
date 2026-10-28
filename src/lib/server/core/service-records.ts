import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import type { ServiceRecordInput } from '../../service-records';
import {
	contractors,
	documents,
	items,
	members,
	serviceRecordItems,
	serviceRecords,
	storedFiles
} from '../schema';
import { DomainError } from './errors';
import type { Files } from './files';

export class ServiceRecords {
	constructor(
		private database: NodeSQLiteDatabase,
		private files: Files
	) {}

	create(input: ServiceRecordInput) {
		return this.database.transaction(() => {
			const fields = this.validate(input);
			const id = randomUUID();
			this.database
				.insert(serviceRecords)
				.values({ id, ...fields })
				.run();
			this.linkItems(id, input.itemIds ?? []);
			return this.get(id);
		});
	}

	update(id: string, input: ServiceRecordInput) {
		return this.database.transaction(() => {
			const previous = this.get(id);
			const fields = this.validate(input, previous);
			this.database.update(serviceRecords).set(fields).where(eq(serviceRecords.id, id)).run();
			this.database
				.delete(serviceRecordItems)
				.where(eq(serviceRecordItems.serviceRecordId, id))
				.run();
			this.linkItems(id, input.itemIds ?? []);
			return this.get(id);
		});
	}

	get(id: string) {
		const record = this.list({ id })[0];
		if (!record) throw new DomainError('service-record-not-found', 'Service Record not found.');
		return record;
	}

	list({ id, itemId, contractorId }: { id?: string; itemId?: string; contractorId?: string } = {}) {
		const rows = this.database
			.select({
				record: serviceRecords,
				contractor: {
					id: contractors.id,
					name: contractors.name,
					archivedAt: contractors.archivedAt
				},
				member: { id: members.id, name: members.name }
			})
			.from(serviceRecords)
			.leftJoin(contractors, eq(serviceRecords.contractorId, contractors.id))
			.leftJoin(members, eq(serviceRecords.memberId, members.id))
			.where(
				and(
					id !== undefined ? eq(serviceRecords.id, id) : undefined,
					contractorId !== undefined ? eq(serviceRecords.contractorId, contractorId) : undefined,
					itemId !== undefined
						? inArray(
								serviceRecords.id,
								this.database
									.select({ id: serviceRecordItems.serviceRecordId })
									.from(serviceRecordItems)
									.where(eq(serviceRecordItems.itemId, itemId))
							)
						: undefined
				)
			)
			.orderBy(desc(serviceRecords.date), serviceRecords.id)
			.all();
		if (!rows.length) return [];
		const links = this.database
			.select({
				serviceRecordId: serviceRecordItems.serviceRecordId,
				item: { id: items.id, name: items.name, retiredDate: items.retiredDate }
			})
			.from(serviceRecordItems)
			.innerJoin(items, eq(items.id, serviceRecordItems.itemId))
			.where(
				inArray(
					serviceRecordItems.serviceRecordId,
					rows.map(({ record }) => record.id)
				)
			)
			.orderBy(items.name, items.id)
			.all();
		const recordDocuments = this.database
			.select({
				serviceRecordId: documents.serviceRecordId,
				id: documents.id,
				title: documents.title,
				originalName: storedFiles.originalName,
				contentType: storedFiles.contentType,
				size: storedFiles.size
			})
			.from(documents)
			.innerJoin(storedFiles, eq(documents.fileId, storedFiles.id))
			.where(
				inArray(
					documents.serviceRecordId,
					rows.map(({ record }) => record.id)
				)
			)
			.orderBy(documents.title, documents.id)
			.all();
		return rows.map(({ record, contractor, member }) => ({
			...record,
			contractor,
			member,
			items: links.filter((link) => link.serviceRecordId === record.id).map((link) => link.item),
			documents: recordDocuments.filter((document) => document.serviceRecordId === record.id)
		}));
	}

	delete(id: string) {
		this.get(id);
		this.database.delete(serviceRecords).where(eq(serviceRecords.id, id)).run();
		this.files.removeUnused();
	}

	private validate(
		input: ServiceRecordInput,
		previous?: { contractorId: string | null; memberId: string | null }
	) {
		const date = input.date;
		if (
			!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
			date.startsWith('0000') ||
			!Number.isFinite(Date.parse(`${date}T00:00:00.000Z`)) ||
			new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date
		) {
			throw new DomainError('invalid-service-record-date', 'Enter a valid date as YYYY-MM-DD.');
		}
		const contractorId = input.contractorId || null;
		const memberId = input.memberId || null;
		if (Boolean(contractorId) === Boolean(memberId)) {
			throw new DomainError(
				'invalid-service-record-performer',
				'Choose exactly one Contractor or Member who did the work.'
			);
		}
		if (contractorId) {
			const contractor = this.database
				.select()
				.from(contractors)
				.where(eq(contractors.id, contractorId))
				.get();
			if (!contractor) throw new DomainError('contractor-not-found', 'Contractor not found.');
			if (contractor.archivedAt && contractorId !== previous?.contractorId) {
				throw new DomainError('contractor-archived', 'Choose a Contractor who is not Archived.');
			}
		}
		if (memberId) {
			const member = this.database.select().from(members).where(eq(members.id, memberId)).get();
			if (!member) throw new DomainError('member-not-found', 'Member not found.');
			if (member.removedAt && memberId !== previous?.memberId) {
				throw new DomainError('member-removed', 'Choose a Member who has not been removed.');
			}
		}
		const cost = input.cost?.trim() ?? '';
		let costCents: number | null = null;
		if (cost) {
			if (!/^\d+(\.\d{1,2})?$/.test(cost)) {
				throw new DomainError(
					'invalid-service-record-cost',
					'Enter a non-negative cost with at most two decimal places.'
				);
			}
			const [whole, fraction = ''] = cost.split('.');
			costCents = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
			if (!Number.isSafeInteger(costCents)) {
				throw new DomainError('invalid-service-record-cost', 'Enter a smaller cost.');
			}
		}
		return { date, notes: input.notes.trim(), costCents, contractorId, memberId };
	}

	private linkItems(id: string, itemIds: string[]) {
		for (const itemId of new Set(itemIds)) {
			if (!this.database.select({ id: items.id }).from(items).where(eq(items.id, itemId)).get()) {
				throw new DomainError('item-not-found', 'Item not found.');
			}
			this.database.insert(serviceRecordItems).values({ serviceRecordId: id, itemId }).run();
		}
	}
}
