// @ts-expect-error - paper-core has no bundled types; we treat the default export as `any`
import paper from 'paper/dist/paper-core';

let initialized = false;

/**
 * Lazily initializes a headless paper scope and returns the paper module.
 * Safe to call repeatedly; only sets up once per process.
 */
export const getPaperScope = (): typeof paper => {
	if (!initialized) {
		// Size is irrelevant for headless geometry ops; paper just needs a Project.
		paper.setup([1, 1]);
		initialized = true;
	}
	return paper;
};
