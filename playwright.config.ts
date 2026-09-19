import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
	webServer: {
		command: 'npm run dev',
		port: 9775,
		// Must stay false: Vite does not rebuild worker bundles for a running
		// dev server, so reusing an existing server on 9775 could silently
		// serve a stale worker and launder a pass/fail unrelated to the code
		// on disk. A busy-port failure is loud and correct; a stale-worker
		// pass is not.
		reuseExistingServer: false
	},
	testDir: 'tests'
};

export default config;
