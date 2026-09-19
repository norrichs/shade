import { sveltekit } from '@sveltejs/kit/vite';
import type { UserConfig } from 'vite';

const config: UserConfig = {
	plugins: [sveltekit()],
	// Rollup's tree-shaking mis-compiles SvelteKit's own runtime server entry:
	// `set_private_env(filter_env(env, env_private_prefix, env_public_prefix))`
	// in `@sveltejs/kit/src/runtime/server/index.js` gets its arguments stripped
	// to `filter_env()`, and `vite preview` then crashes with
	// "Cannot convert undefined or null to object" before it can serve anything.
	// Reproduced with rollup 4.34.0 / @sveltejs/kit 2.60.1 and 2.70.3; disabling
	// tree-shaking is the narrowest fix found. Safe to revisit/remove once the
	// upstream rollup bug is identified or a kit/rollup upgrade fixes it.
	build: { rollupOptions: { treeshake: false } },
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
