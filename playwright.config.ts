import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
	webServer: {
		command: 'npm run dev',
		port: 4239,
		reuseExistingServer: !process.env.CI
	},
	testDir: 'tests/e2e',
	testMatch: /(.+\.)?(test|spec)\.[jt]s/,
	use: {
		baseURL: 'http://localhost:4239',
		launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
			? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
			: undefined,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	retries: process.env.CI ? 2 : 0,
	// In CI also emit the HTML report, so the workflow's playwright-report
	// artifact actually has something to upload when a run fails.
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list'
};

export default config;
