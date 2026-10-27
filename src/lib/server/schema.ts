import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
	expiresAt: integer({ mode: 'timestamp_ms' }).notNull()
});
