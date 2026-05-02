import { generateShieldTesselationTile } from '../generator';
import { defaultShieldSpec } from '../default-spec';
import type { Band } from '$lib/types';

describe('shield-tesselation generator snapshot', () => {
	const sideOrientations: Band['sideOrientation'][] = ['inside', 'outside'];
	const sizes = [1, 100];
	const columnsList = [1, 2, 3, 5];

	for (const size of sizes) {
		for (const columns of columnsList) {
			for (const sideOrientation of sideOrientations) {
				it(`generator output snapshot: size=${size} columns=${columns} side=${sideOrientation}`, () => {
					const result = generateShieldTesselationTile(defaultShieldSpec, {
						size,
						rows: 1,
						columns,
						variant: 'rect',
						sideOrientation
					});
					expect(result).toMatchSnapshot();
				});
			}
		}
	}
});
