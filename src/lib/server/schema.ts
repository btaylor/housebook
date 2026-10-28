import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

import { itemCategories } from '../items';

export const items = sqliteTable('items', {
	id: text().primaryKey(),
	name: text().notNull(),
	category: text({ enum: itemCategories }).notNull(),
	location: text(),
	make: text(),
	model: text(),
	serialNumber: text(),
	installDate: text(),
	warrantyEndDate: text(),
	notes: text(),
	retiredDate: text()
});

export const houses = sqliteTable(
	'houses',
	{
		id: integer().primaryKey().default(1),
		name: text().notNull(),
		currency: text().notNull(),
		createdAt: integer({ mode: 'timestamp_ms' }).notNull()
	},
	(table) => [check('single_house', sql`${table.id} = 1`)]
);

export const members = sqliteTable(
	'members',
	{
		id: text().primaryKey(),
		name: text().notNull(),
		email: text().notNull(),
		passwordHash: text().notNull(),
		signInLockedUntil: integer({ mode: 'timestamp_ms' }),
		createdAt: integer({ mode: 'timestamp_ms' }).notNull()
	},
	(table) => [uniqueIndex('members_email_unique').on(sql`lower(${table.email})`)]
);

export const sessions = sqliteTable('sessions', {
	tokenHash: text().primaryKey(),
	memberId: text()
		.notNull()
		.references(() => members.id, { onDelete: 'cascade' }),
	createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
	lastSeenAt: integer({ mode: 'timestamp_ms' }).notNull(),
	expiresAt: integer({ mode: 'timestamp_ms' }).notNull(),
	deviceHint: text().notNull().default('Unknown browser · Unknown device')
});

export const signInAttempts = sqliteTable(
	'sign_in_attempts',
	{
		id: integer().primaryKey(),
		memberId: text()
			.notNull()
			.references(() => members.id, { onDelete: 'cascade' }),
		attemptedAt: integer({ mode: 'timestamp_ms' }).notNull()
	},
	(table) => [index('sign_in_attempts_member_time').on(table.memberId, table.attemptedAt)]
);

export const contractors = sqliteTable('contractors', {
	id: text().primaryKey(),
	name: text().notNull(),
	phone: text().notNull().default(''),
	email: text().notNull().default(''),
	trade: text().notNull().default(''),
	notes: text().notNull().default(''),
	archivedAt: integer({ mode: 'timestamp_ms' })
});

export const invites = sqliteTable('invites', {
	id: text().primaryKey(),
	tokenHash: text().notNull().unique(),
	createdBy: text()
		.notNull()
		.references(() => members.id),
	createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
	expiresAt: integer({ mode: 'timestamp_ms' }).notNull(),
	usedAt: integer({ mode: 'timestamp_ms' }),
	revokedAt: integer({ mode: 'timestamp_ms' })
});

export const serviceRecords = sqliteTable(
	'service_records',
	{
		id: text().primaryKey(),
		date: text().notNull(),
		notes: text().notNull(),
		costCents: integer(),
		contractorId: text().references(() => contractors.id, { onDelete: 'restrict' }),
		memberId: text().references(() => members.id, { onDelete: 'restrict' })
	},
	(table) => [
		check(
			'service_record_performer',
			sql`(${table.contractorId} IS NOT NULL) != (${table.memberId} IS NOT NULL)`
		),
		check(
			'service_record_cost',
			sql`${table.costCents} IS NULL OR (typeof(${table.costCents}) = 'integer' AND ${table.costCents} BETWEEN 0 AND 9007199254740991)`
		),
		index('service_records_date').on(table.date),
		index('service_records_contractor').on(table.contractorId)
	]
);

export const serviceRecordItems = sqliteTable(
	'service_record_items',
	{
		serviceRecordId: text()
			.notNull()
			.references(() => serviceRecords.id, { onDelete: 'cascade' }),
		itemId: text()
			.notNull()
			.references(() => items.id, { onDelete: 'restrict' })
	},
	(table) => [
		primaryKey({ columns: [table.serviceRecordId, table.itemId] }),
		index('service_record_items_item').on(table.itemId)
	]
);
