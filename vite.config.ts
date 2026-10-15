import { sveltekit } from '@sveltejs/kit/vite';
import { agentBridgePlugin } from './src/lib/agent-bridge/vite-plugin';
import type { UserConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const fromRoot = (dir: string) => fileURLToPath(new URL(dir, import.meta.url));

const config: UserConfig = {
	plugins: [sveltekit(), agentBridgePlugin()],
	server: {
		port: 9775,
		watch: {
			// Worktrees nested under this checkout are separate apps. Their `svelte-kit sync`
			// rewrites `.svelte-kit/tsconfig.json`, and Vite answers any tsconfig.json change
			// in the watched tree with a full reload that invalidates every module.
			// Anchored to this file so a worktree, which itself lives under
			// `.claude/worktrees/`, still watches its own sources.
			ignored: ['.claude/worktrees/', '.worktree/', '.worktrees/'].map(
				(dir) => `${fromRoot(dir)}**`
			)
		},
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
