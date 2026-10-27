import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'phone-chromium',
			use: { ...devices['Pixel 7'] }
		}
	]
});
