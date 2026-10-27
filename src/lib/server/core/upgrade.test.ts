import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { expect, test } from 'vitest';
import { createHousebookHarness } from '../testing/harness';

test('preserves existing data and a pre-migration backup when upgrading the packaged migrations', async () => {
	const harness = await createHousebookHarness([], { autoStart: false });
	try {
		const migrations = readMigrationFiles({ migrationsFolder: harness.migrationsDirectory });
		const latest = migrations.at(-1)!;
		rmSync(join(harness.migrationsDirectory, latest.name), { recursive: true });
		mkdirSync(harness.dataDirectory);
		const database = new DatabaseSync(join(harness.dataDirectory, 'housebook.sqlite'));
		try {
			migrate(drizzle({ client: database }), {
				migrationsFolder: harness.migrationsDirectory
			});
			// The bootstrap migration has no domain tables, so keep a row independent of domain schema.
			database.exec('CREATE TABLE upgrade_fixture (value TEXT NOT NULL);');
			database.prepare('INSERT INTO upgrade_fixture VALUES (?)').run('keep this existing row');
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
		expect(harness.core.database.all(sql`SELECT * FROM upgrade_fixture`)).toEqual([
			{ value: 'keep this existing row' }
		]);
		expect(
			harness.core.database.get(sql`SELECT count(*) AS count FROM __drizzle_migrations`)
		).toEqual({ count: migrations.length });

		const backups = readdirSync(harness.dataDirectory).filter(
			(name) => name.startsWith('housebook.pre-migration-') && name.endsWith('.sqlite')
		);
		expect(backups).toHaveLength(1);
		const backup = new DatabaseSync(join(harness.dataDirectory, backups[0]), { readOnly: true });
		try {
			expect(backup.prepare('SELECT * FROM upgrade_fixture').all()).toEqual([
				{ value: 'keep this existing row' }
			]);
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
