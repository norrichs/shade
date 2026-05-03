import { generateBoxPattern } from '../../../tiled-box-pattern';

describe('box generator snapshot', () => {
	const sizes = [1, 100];
	const heightList = [1, 2, 3];
	const widthList = [1, 2, 3, 5];

	for (const size of sizes) {
		for (const height of heightList) {
			for (const width of widthList) {
				it(`generateBoxPattern size=${size} height=${height} width=${width}`, () => {
					const result = generateBoxPattern({ size, height, width });
					expect(result).toMatchSnapshot();
				});
			}
		}
	}
});
