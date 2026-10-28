import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { expect, test } from 'vitest';
import { createHousebookHarness } from '../testing/harness';
import { hashPassword } from './passwords';

function quoteIdentifier(name: string) {
	return `"${name.replaceAll('"', '""')}"`;
}

async function seedAndSnapshotPreviousData(database: DatabaseSync) {
	const tables = database
		.prepare(
			`SELECT name FROM sqlite_master WHERE type = 'table'
			 AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations' ORDER BY name`
		)
		.all()
		.map((table) => String(table.name));
	if (tables.length === 0) {
		// The bootstrap migration has no domain tables, so keep a row independent of domain schema.
		database.exec('CREATE TABLE upgrade_fixture (value TEXT NOT NULL);');
		database.prepare('INSERT INTO upgrade_fixture VALUES (?)').run('keep this existing row');
		tables.push('upgrade_fixture');
	} else if (
		tables.join(',') === 'contractors,houses,members,sessions' ||
		tables.join(',') === 'contractors,houses,members,sessions,sign_in_attempts' ||
		tables.join(',') === 'contractors,houses,items,members,sessions,sign_in_attempts'
	) {
		const now = Date.parse('2026-01-01T00:00:00Z');
		database
			.prepare('INSERT INTO houses (name, currency, createdAt) VALUES (?, ?, ?)')
			.run('Existing House', 'USD', now);
		database
			.prepare(
				'INSERT INTO members (id, name, email, passwordHash, createdAt) VALUES (?, ?, ?, ?, ?)'
			)
			.run(
				'existing-member',
				'Morgan',
				'morgan@example.com',
				await hashPassword('an existing password'),
				now
			);
		database
			.prepare(
				'INSERT INTO sessions (tokenHash, memberId, createdAt, lastSeenAt, expiresAt) VALUES (?, ?, ?, ?, ?)'
			)
			.run(
				createHash('sha256').update('existing-session-token').digest('hex'),
				'existing-member',
				now,
				now,
				Date.parse('2030-01-01T00:00:00Z')
			);
		database.exec(`
			INSERT INTO contractors (id, name, phone, email, trade, notes, archivedAt)
				VALUES ('active-contractor', 'Willow Plumbing', '5551234567',
					'contact@example.com', 'Plumbing', 'Boiler service', NULL),
					('archived-contractor', 'Cedar Roofing', '', '', 'Roofing', 'Old roof', 1760000000000);
		`);
		if (tables.includes('items')) {
			database.exec(`
				INSERT INTO items (id, name, category, notes, retiredDate)
				VALUES ('current-item', 'Furnace', 'HVAC', 'Keep the service label', NULL),
					('retired-item', 'Old pump', 'plumbing', 'Replaced', '2025-10-01');
			`);
		}
		if (tables.includes('sign_in_attempts')) {
			database
				.prepare('INSERT INTO sign_in_attempts (memberId, attemptedAt) VALUES (?, ?)')
				.run('existing-member', now);
			database
				.prepare('UPDATE members SET signInLockedUntil = ? WHERE id = ?')
				.run(now - 1, 'existing-member');
		}
		if (tables.includes('items')) {
			database.exec(`
				INSERT INTO items (id, name, category, location, make, model, serialNumber,
					installDate, warrantyEndDate, notes, retiredDate)
					VALUES ('current-item', 'Boiler', 'HVAC', 'Basement', 'Willow', 'B1', '123',
						'2024-01-01', '2029-01-01', 'Annual service', NULL),
						('retired-item', 'Old boiler', 'HVAC', 'Basement', 'Cedar', 'B0', '456',
						'2010-01-01', '2015-01-01', 'Replaced', '2024-01-01');
			`);
		}
	} else {
		throw new Error(`Add representative previous-version fixtures for: ${tables.join(', ')}`);
	}

	return tables.map((table) => {
		const columns = database
			.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
			.all()
			.map((column) => quoteIdentifier(String(column.name)))
			.join(', ');
		const query = `SELECT ${columns} FROM ${quoteIdentifier(table)} ORDER BY ${columns}`;
		const rows = database.prepare(query).all();
		expect(rows, `Seed representative previous-version rows in ${table}`).not.toHaveLength(0);
		return { table, query, rows };
	});
}

test('preserves existing data and a pre-migration backup when upgrading the packaged migrations', async () => {
	const harness = await createHousebookHarness([], { autoStart: false });
	try {
		const migrations = readMigrationFiles({ migrationsFolder: harness.migrationsDirectory });
		const latest = migrations.at(-1)!;
		rmSync(join(harness.migrationsDirectory, latest.name), { recursive: true });
		mkdirSync(harness.dataDirectory);
		const database = new DatabaseSync(join(harness.dataDirectory, 'housebook.sqlite'));
		let previousData: Awaited<ReturnType<typeof seedAndSnapshotPreviousData>>;
		try {
			migrate(drizzle({ client: database }), {
				migrationsFolder: harness.migrationsDirectory
			});
			previousData = await seedAndSnapshotPreviousData(database);
			expect(database.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get()).toEqual({
				count: migrations.length - 1
			});
		} finally {
			database.close();
		}

		cpSync(resolve('drizzle', latest.name), join(harness.migrationsDirectory, latest.name), {
			recursive: true
		});
		await harness.start();
		for (const { table, query, rows } of previousData) {
			expect(harness.core.database.all(sql.raw(query)), `Upgraded data in ${table}`).toEqual(rows);
		}
		expect(
			harness.core.database.get(sql`SELECT count(*) AS count FROM __drizzle_migrations`)
		).toEqual({ count: migrations.length });
		expect(harness.core.auth.listSessions('existing-session-token')).toEqual([
			{
				deviceHint: 'Unknown browser · Unknown device',
				lastSeenAt: harness.core.clock(),
				current: true
			}
		]);
		await expect(
			harness.core.auth.signIn('morgan@example.com', 'an existing password')
		).resolves.toHaveProperty('member.id', 'existing-member');

		const backups = readdirSync(harness.dataDirectory).filter(
			(name) => name.startsWith('housebook.pre-migration-') && name.endsWith('.sqlite')
		);
		expect(backups).toHaveLength(1);
		const backup = new DatabaseSync(join(harness.dataDirectory, backups[0]), { readOnly: true });
		try {
			for (const { table, query, rows } of previousData) {
				expect(backup.prepare(query).all(), `Pre-migration backup data in ${table}`).toEqual(rows);
			}
			expect(backup.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get()).toEqual({
				count: migrations.length - 1
			});
			expect(backup.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
		} finally {
			backup.close();
		}
	} finally {
		harness.dispose();
	}
});
