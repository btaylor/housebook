import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base } from '@playwright/test';

interface RunningApp {
	url: string;
	setupCode: string;
}

export const test = base.extend<{ app: RunningApp; appOrigin: string | undefined }>({
	appOrigin: [undefined, { option: true }],
	app: async ({ appOrigin }, use) => {
		const dataDirectory = mkdtempSync(join(tmpdir(), 'housebook-e2e-'));
		const child = spawn(process.execPath, ['server.js'], {
			env: {
				...process.env,
				HOST: '127.0.0.1',
				PORT: '0',
				PROTOCOL_HEADER: appOrigin ? 'x-forwarded-proto' : '',
				HOST_HEADER: appOrigin ? 'x-forwarded-host' : '',
				HOUSEBOOK_DATA_DIR: dataDirectory
			},
			stdio: ['ignore', 'pipe', 'pipe']
		});
		try {
			const app = await new Promise<RunningApp>((resolve, reject) => {
				let output = '';
				const timeout = setTimeout(() => reject(new Error('App startup timed out.')), 15_000);
				function read(chunk: Buffer) {
					output += chunk.toString();
					const url = output.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
					const setupCode = output.match(/Housebook setup code: (\S+)/)?.[1];
					if (url && setupCode) {
						clearTimeout(timeout);
						resolve({ url, setupCode });
					}
				}
				child.stdout.on('data', read);
				child.stderr.on('data', read);
				child.once('error', (error) => {
					clearTimeout(timeout);
					reject(error);
				});
				child.once('exit', (code) => {
					clearTimeout(timeout);
					reject(new Error(`App exited during startup (${code}).`));
				});
			});
			await use(app);
		} finally {
			const closed = once(child, 'close');
			child.kill('SIGTERM');
			await closed;
			rmSync(dataDirectory, { recursive: true, force: true });
		}
	},
	baseURL: async ({ app }, use) => use(app.url)
});
