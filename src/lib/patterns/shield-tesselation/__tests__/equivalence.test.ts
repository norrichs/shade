import { generateShieldTesselationTile as oldGenerate } from '../../tiled-shield-tesselation-pattern';
import { generateShieldTesselationTile as newGenerate } from '../generator';
import { defaultShieldSpec } from '../default-spec';
import type { Band } from '$lib/types';

describe('shield-tesselation generator equivalence', () => {
	const sideOrientations: Band['sideOrientation'][] = ['inside', 'outside'];
	const sizes = [1, 100];
	const columnsList = [1, 2, 3, 5];
	const rowsList = [1];

	for (const size of sizes) {
		for (const columns of columnsList) {
			for (const rows of rowsList) {
				for (const sideOrientation of sideOrientations) {
					it(`matches old output for size=${size} rows=${rows} columns=${columns} side=${sideOrientation}`, () => {
						const props = {
							size,
							rows,
							columns,
							variant: 'rect' as const,
							sideOrientation
						};
						const oldResult = oldGenerate(props);
						const newResult = newGenerate(defaultShieldSpec, props);
						expect(newResult).toEqual(oldResult);
					});
				}
			}
		}
	}
});
