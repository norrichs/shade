import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
	webServer: {
		command: 'npm run dev',
		port: 9775,
		reuseExistingServer: true
	},
	testDir: 'tests'
};

export default config;
