import { bandTransform } from '../band-transform';

describe('bandTransform', () => {
	it('returns a plain translate when rotation is 0', () => {
		expect(bandTransform({ x: 10, y: 20 }, 0, { x: 5, y: 5 })).toBe('translate(10 20)');
	});

	it('appends a rotate about the pivot when rotation is non-zero', () => {
		expect(bandTransform({ x: 10, y: 20 }, 90, { x: 5, y: 6 })).toBe(
			'translate(10 20) rotate(90 5 6)'
		);
	});
});
