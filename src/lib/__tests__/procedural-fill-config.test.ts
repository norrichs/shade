import { defaultCircleHolesFillConfig, defaultOutlinedPatternConfig } from '$lib/shades-config';
import { isCircleHolesFillConfig } from '$lib/types';
import { validateProceduralFillConfig } from '$lib/validators';

describe('defaultCircleHolesFillConfig', () => {
	it('is a valid circle-holes config', () => {
		const config = defaultCircleHolesFillConfig();
		expect(isCircleHolesFillConfig(config)).toBe(true);
		expect(validateProceduralFillConfig(config).isValid).toBe(true);
	});

	it('returns a fresh object each call', () => {
		expect(defaultCircleHolesFillConfig()).not.toBe(defaultCircleHolesFillConfig());
	});
});

describe('defaultOutlinedPatternConfig', () => {
	it('leaves fill off by default', () => {
		expect(defaultOutlinedPatternConfig().fill).toBeUndefined();
	});
});

describe('validateProceduralFillConfig', () => {
	const base = defaultCircleHolesFillConfig();

	it('rejects minRadius above maxRadius', () => {
		const v = validateProceduralFillConfig({ ...base, minRadius: 20, maxRadius: 5 });
		expect(v.isValid).toBe(false);
		expect(v.messages.join(' ')).toMatch(/minRadius/);
	});

	it('rejects a non-positive density', () => {
		expect(validateProceduralFillConfig({ ...base, density: 0 }).isValid).toBe(false);
	});

	it('rejects a non-positive minRadius', () => {
		expect(validateProceduralFillConfig({ ...base, minRadius: 0 }).isValid).toBe(false);
	});

	it('rejects a negative margin', () => {
		expect(validateProceduralFillConfig({ ...base, margin: -1 }).isValid).toBe(false);
	});

	it('rejects a negative spacing', () => {
		expect(validateProceduralFillConfig({ ...base, spacing: -1 }).isValid).toBe(false);
	});

	it('accepts a zero margin and zero spacing', () => {
		expect(validateProceduralFillConfig({ ...base, margin: 0, spacing: 0 }).isValid).toBe(true);
	});
});
