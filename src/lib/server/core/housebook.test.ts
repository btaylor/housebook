import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { afterEach, describe, expect, test } from 'vitest';
import { createHousebookHarness } from '../testing/harness';

type Harness = Awaited<ReturnType<typeof createHousebookHarness>>;
const harnesses: Harness[] = [];

async function createHarness(...args: Parameters<typeof createHousebookHarness>) {
	const harness = await createHousebookHarness(...args);
	harnesses.push(harness);
	return harness;
}

function nextMigrationName(harness: Harness, name: string) {
	const latest = readMigrationFiles({ migrationsFolder: harness.migrationsDirectory }).at(-1)!;
	const timestamp = new Date(latest.folderMillis + 1000)
		.toISOString()
		.replace(/\D/g, '')
		.slice(0, 14);
	return `${timestamp}_${name}`;
}

function backups(harness: Harness) {
	return readdirSync(harness.dataDirectory).filter(
		(name) => name.includes('.pre-migration-') && name.endsWith('.sqlite')
	);
}

afterEach(() => {
	for (const harness of harnesses.splice(0)) harness.dispose();
});

describe('Housebook construction', () => {
	test('provides a real temporary database, data directory, and controllable clock', async () => {
		const harness = await createHarness();
		expect(existsSync(join(harness.core.dataDirectory, 'housebook.sqlite'))).toBe(true);
		expect(harness.core.database.get(sql`SELECT 6 * 7 AS answer`)).toEqual({ answer: 42 });
		expect(harness.core.clock().toISOString()).toBe('2026-01-02T03:04:05.000Z');
		harness.setTime('2026-02-03T04:05:06.000Z');
		expect(harness.core.clock().toISOString()).toBe('2026-02-03T04:05:06.000Z');
	});

	test('applies all packaged migrations on first start without an unnecessary backup', async () => {
		const harness = await createHarness();
		const migrations = readMigrationFiles({ migrationsFolder: harness.migrationsDirectory });
		expect(
			harness.core.database.all(
				sql`SELECT hash, created_at, name FROM "__drizzle_migrations" ORDER BY id`
			)
		).toEqual(
			migrations.map(({ hash, folderMillis, name }) => ({ hash, created_at: folderMillis, name }))
		);
		expect(backups(harness)).toEqual([]);
		await harness.start();
		expect(backups(harness)).toEqual([]);
	});
});

describe('startup migrations', () => {
	test('backs up committed WAL contents before upgrading an existing database', async () => {
		const harness = await createHarness([], { autoStart: false });
		harness.addMigration({
			name: nextMigrationName(harness, 'previous'),
			sql: 'CREATE TABLE fixture (value TEXT NOT NULL);'
		});
		await harness.start();
		const previousMigrations = harness.core.database.all(
			sql`SELECT hash, created_at, name FROM "__drizzle_migrations" ORDER BY id`
		);
		harness.stop();

		const writer = new DatabaseSync(join(harness.dataDirectory, 'housebook.sqlite'));
		try {
			writer.exec('PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;');
			writer.prepare('INSERT INTO fixture VALUES (?)').run('keep this committed WAL row');
			expect(statSync(join(harness.dataDirectory, 'housebook.sqlite-wal')).size).toBeGreaterThan(0);
			harness.addMigration({
				name: nextMigrationName(harness, 'upgrade'),
				sql: 'ALTER TABLE fixture ADD COLUMN upgraded INTEGER NOT NULL DEFAULT 1;'
			});
			harness.setTime('2026-10-29T12:34:56.000Z');
			await harness.start();

			const names = backups(harness);
			expect(names).toHaveLength(1);
			expect(names[0]).toMatch(/^housebook\.pre-migration-2026-10-29T12-34-56\.000Z-.+\.sqlite$/);
			const snapshot = new DatabaseSync(join(harness.dataDirectory, names[0]), { readOnly: true });
			try {
				expect(snapshot.prepare('SELECT * FROM fixture').all()).toEqual([
					{ value: 'keep this committed WAL row' }
				]);
				expect(
					snapshot
						.prepare('SELECT hash, created_at, name FROM "__drizzle_migrations" ORDER BY id')
						.all()
				).toEqual(previousMigrations);
				expect(snapshot.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
			} finally {
				snapshot.close();
			}
			expect(harness.core.database.all(sql`SELECT * FROM fixture`)).toEqual([
				{ value: 'keep this committed WAL row', upgraded: 1 }
			]);
			await harness.start();
			expect(backups(harness)).toEqual(names);
		} finally {
			writer.close();
		}
	});

	test.each([
		['newer migration', '20261030000000_future', 1900000000000, 'future-hash'],
		['older unknown migration', '20200101000000_unknown', 1577836800000, 'unknown-hash']
	])('refuses a database with a %s before changing any bytes', async (_, name, timestamp, hash) => {
		const harness = await createHarness();
		harness.stop();
		const databasePath = join(harness.dataDirectory, 'housebook.sqlite');
		const writer = new DatabaseSync(databasePath);
		try {
			writer.exec('PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;');
			writer
				.prepare('INSERT INTO "__drizzle_migrations" (hash, created_at, name) VALUES (?, ?, ?)')
				.run(hash, timestamp, name);
			const before = readFileSync(databasePath);
			const walBefore = readFileSync(`${databasePath}-wal`);
			await expect(harness.start()).rejects.toThrow(/Downgrading is not supported/);
			expect(readFileSync(databasePath)).toEqual(before);
			expect(readFileSync(`${databasePath}-wal`)).toEqual(walBefore);
			expect(backups(harness)).toEqual([]);
		} finally {
			writer.close();
		}
	});

	test('refuses a changed migration even when its name and timestamp are known', async () => {
		const harness = await createHarness();
		harness.core.database.run(sql`UPDATE "__drizzle_migrations" SET hash = 'changed'`);
		harness.stop();
		const databasePath = join(harness.dataDirectory, 'housebook.sqlite');
		const before = readFileSync(databasePath);
		await expect(harness.start()).rejects.toThrow(/unknown or changed migrations/);
		expect(readFileSync(databasePath)).toEqual(before);
		expect(backups(harness)).toEqual([]);
	});

	test('keeps the pre-upgrade database and backup when a migration fails', async () => {
		const harness = await createHarness();
		const previousMigrations = harness.core.database.all(
			sql`SELECT hash, created_at, name FROM "__drizzle_migrations" ORDER BY id`
		);
		harness.addMigration({
			name: nextMigrationName(harness, 'broken'),
			sql: 'CREATE TABLE partial (value TEXT); --> statement-breakpoint\nINVALID SQL;'
		});
		await expect(harness.start()).rejects.toThrow(/database migration failed/);
		const database = new DatabaseSync(join(harness.dataDirectory, 'housebook.sqlite'), {
			readOnly: true
		});
		try {
			expect(
				database.prepare("SELECT name FROM sqlite_master WHERE name = 'partial'").get()
			).toBeUndefined();
			expect(
				database
					.prepare('SELECT hash, created_at, name FROM "__drizzle_migrations" ORDER BY id')
					.all()
			).toEqual(previousMigrations);
		} finally {
			database.close();
		}
		expect(backups(harness)).toHaveLength(1);
	});
});
