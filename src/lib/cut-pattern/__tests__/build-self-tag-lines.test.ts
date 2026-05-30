import { buildSelfTagLines } from '../build-self-tag-lines';

describe('buildSelfTagLines', () => {
	test('external tag off -> base address only', () => {
		expect(buildSelfTagLines('t0/b1', '0003', false)).toEqual(['t0/b1']);
	});

	test('external tag on with code -> space-joined', () => {
		expect(buildSelfTagLines('t0/b1', '0003', true)).toEqual(['t0/b1 0003']);
	});

	test('external tag on but no code -> base address only', () => {
		expect(buildSelfTagLines('t0/b1', undefined, true)).toEqual(['t0/b1']);
	});

	test('external tag off with code -> base address only', () => {
		expect(buildSelfTagLines('t0/b1', '0003', false)).toEqual(['t0/b1']);
	});
});
