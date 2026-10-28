import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
