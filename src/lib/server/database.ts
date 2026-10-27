import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { readMigrationFiles, type MigrationMeta } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { Housebook } from './core/index';

interface OpenHousebookOptions {
	dataDirectory: string;
	clock?: () => Date;
	migrationsDirectory?: string;
}

function appliedMigrationCount(database: DatabaseSync, migrations: MigrationMeta[]): number {
	const hasHistory = database
		.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
		.get();
	if (!hasHistory) return 0;

	const downgradeError = new Error(
		'Housebook cannot start: this database has unknown or changed migrations. Downgrading is not supported; use an image that knows this database’s migrations.'
	);
	const columns = database.prepare('PRAGMA table_info("__drizzle_migrations")').all();
	if (!columns.some((column) => column.name === 'name')) throw downgradeError;

	const applied = database
		.prepare('SELECT hash, created_at, name FROM "__drizzle_migrations" ORDER BY id')
		.all();
	for (const [index, row] of applied.entries()) {
		const known = migrations[index];
		if (
			!known ||
			row.hash !== known.hash ||
			row.created_at !== known.folderMillis ||
			row.name !== known.name
		) {
			throw downgradeError;
		}
	}
	return applied.length;
}

export async function openHousebook({
	dataDirectory,
	clock = () => new Date(),
	migrationsDirectory = resolve('drizzle')
}: OpenHousebookOptions) {
	const migrations = readMigrationFiles({ migrationsFolder: migrationsDirectory });
	if (migrations.length === 0) {
		throw new Error(`Housebook cannot start: no migrations found in ${migrationsDirectory}.`);
	}

	mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
	const databasePath = join(dataDirectory, 'housebook.sqlite');
	let applied = 0;

	if (existsSync(databasePath)) {
		const source = new DatabaseSync(databasePath, { readOnly: true });
		try {
			applied = appliedMigrationCount(source, migrations);
			if (applied < migrations.length) {
				const timestamp = clock().toISOString().replaceAll(':', '-');
				const backupPath = join(
					dataDirectory,
					`housebook.pre-migration-${timestamp}-${randomUUID()}.sqlite`
				);
				// SQLite's backup API includes committed WAL pages that a file copy would miss.
				await backup(source, backupPath);
				await chmod(backupPath, 0o600);
			}
		} finally {
			source.close();
		}
	}

	const client = new DatabaseSync(databasePath);
	try {
		const database = drizzle({ client });
		if (applied < migrations.length) {
			migrate(database, { migrationsFolder: migrationsDirectory });
		}
		return {
			core: new Housebook(database, resolve(dataDirectory), clock),
			close: () => client.close()
		};
	} catch (error) {
		client.close();
		throw new Error('Housebook cannot start: database migration failed.', { cause: error });
	}
}
