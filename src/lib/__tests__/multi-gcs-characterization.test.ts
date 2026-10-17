import { describe, it, expect } from '@jest/globals';

import { generateGlobuleTube } from '../generate-shape';
import { generateDefaultGlobuleConfig } from '../shades-config';
import type { GlobuleConfig } from '../types';
import sconce from './asymmetric-sconce-globule.fixture.json';

// Freezes today's single-GCS geometry so the multi-GCS refactor can prove
// byte-identical output for existing configs.
const round = (n: number) => Math.round(n * 1e9) / 1e9 + 0;

const snapshotPoints = (config: GlobuleConfig) =>
	generateGlobuleTube(config).sections.map((s) =>
		s.points.map((p) => p.toArray().slice(0, 3).map(round))
	);

describe('single-GCS characterization', () => {
	it('default globule', () => {
		expect(snapshotPoints(generateDefaultGlobuleConfig())).toMatchSnapshot();
	});

	it('asymmetric sconce globule', () => {
		expect(snapshotPoints(sconce as unknown as GlobuleConfig)).toMatchSnapshot();
	});

	it('default globule with preserveAspectRatio sampling', () => {
		const config = generateDefaultGlobuleConfig();
		config.levelConfig.silhouetteSampleMethod = { method: 'preserveAspectRatio', divisions: 12 };
		expect(snapshotPoints(config)).toMatchSnapshot();
	});
});
