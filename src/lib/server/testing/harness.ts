import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openHousebook } from '../database';

interface TestMigration {
	name: string;
	sql: string;
}

export async function createHousebookHarness(migrations: TestMigration[] = []) {
	const directory = mkdtempSync(join(tmpdir(), 'housebook-'));
	const dataDirectory = join(directory, 'data');
	const migrationsDirectory = join(directory, 'migrations');
	cpSync(resolve('drizzle'), migrationsDirectory, { recursive: true });
	let instant = new Date('2026-01-02T03:04:05.000Z');
	let runtime: Awaited<ReturnType<typeof openHousebook>> | undefined;

	function addMigration({ name, sql }: TestMigration) {
		const path = join(migrationsDirectory, name);
		mkdirSync(path, { recursive: true });
		writeFileSync(join(path, 'migration.sql'), sql);
	}

	function stop() {
		runtime?.close();
		runtime = undefined;
	}

	async function start() {
		stop();
		runtime = await openHousebook({
			dataDirectory,
			migrationsDirectory,
			clock: () => new Date(instant)
		});
		return runtime.core;
	}

	for (const migration of migrations) addMigration(migration);

	try {
		await start();
	} catch (error) {
		rmSync(directory, { recursive: true, force: true });
		throw error;
	}

	return {
		get core() {
			if (!runtime) throw new Error('The test Housebook is stopped.');
			return runtime.core;
		},
		dataDirectory,
		migrationsDirectory,
		setTime(value: string) {
			instant = new Date(value);
		},
		addMigration,
		start,
		stop,
		dispose() {
			stop();
			rmSync(directory, { recursive: true, force: true });
		}
	};
}
