import { sveltekit } from '@sveltejs/kit/vite';
import type { UserConfig } from 'vite';

const config: UserConfig = {
	plugins: [sveltekit()],
	server: {
		port: 9775,
		fs: {
			// Allow serving files from the shared node_modules symlinked from the
			// main `shades` checkout (sibling git worktree). Vite resolves the
			// symlink to its real path, which lives outside this worktree root.
			allow: ['..']
		}
	},
	ssr: {
		noExternal: ['three', 'troika-three-text']
	}
};

export default config;
