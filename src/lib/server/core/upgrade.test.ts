import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { expect, test } from 'vitest';
import { createHousebookHarness } from '../testing/harness';

function quoteIdentifier(name: string) {
	return `"${name.replaceAll('"', '""')}"`;
}

function seedAndSnapshotPreviousData(database: DatabaseSync) {
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
		let previousData: ReturnType<typeof seedAndSnapshotPreviousData>;
		try {
			migrate(drizzle({ client: database }), {
				migrationsFolder: harness.migrationsDirectory
			});
			previousData = seedAndSnapshotPreviousData(database);
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
