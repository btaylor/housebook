import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: 'http://127.0.0.1:4173',
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'phone-chromium',
			use: { ...devices['Pixel 7'] }
		}
	],
	webServer: {
		command: 'npm run build && npm start',
		url: 'http://127.0.0.1:4173',
		env: {
			HOST: '127.0.0.1',
			PORT: '4173',
			HOUSEBOOK_DATA_DIR: mkdtempSync(join(tmpdir(), 'housebook-e2e-'))
		},
		reuseExistingServer: false
	}
});
