import type { LevelConfig } from '../types';

/**
 * A minimal level config for exercising `generateLevelPrototype`. Only
 * `levelPrototypeSampleMethod` matters here; the silhouette fields are along
 * for the ride.
 */
export const defaultLevelConfigForTest = (): LevelConfig => ({
	type: 'LevelConfig',
	silhouetteSampleMethod: { method: 'divideCurve', divisions: 10 },
	levelPrototypeSampleMethod: 'curve',
	levelCount: 11,
	levelOffsets: []
});
