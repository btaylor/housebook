import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';

test('exits before listening when the database has unknown migrations', async () => {
	const dataDirectory = mkdtempSync(join(tmpdir(), 'housebook-downgrade-'));
	const database = new DatabaseSync(join(dataDirectory, 'housebook.sqlite'));
	database.exec(`
		CREATE TABLE __drizzle_migrations (
			id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC, name TEXT, applied_at TEXT
		);
		INSERT INTO __drizzle_migrations (hash, created_at, name)
		VALUES ('future-hash', 9999999999999, '20990101000000_future');
	`);
	database.close();
	const child = spawn(process.execPath, ['build'], {
		env: { ...process.env, HOUSEBOOK_DATA_DIR: dataDirectory, HOST: '127.0.0.1', PORT: '0' },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let output = '';
	child.stdout.on('data', (data) => (output += data));
	child.stderr.on('data', (data) => (output += data));
	try {
		const [exitCode] = await once(child, 'close', { signal: AbortSignal.timeout(10_000) });
		expect(exitCode).toBe(1);
		expect(output).toContain('Downgrading is not supported');
		expect(output).not.toContain('Listening on');
	} finally {
		child.kill('SIGKILL');
		rmSync(dataDirectory, { recursive: true, force: true });
	}
});
