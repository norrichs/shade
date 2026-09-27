import { describe, it, expect } from '@jest/globals';
import { fileStamp } from '../file-stamp';

describe('fileStamp', () => {
	const at = new Date(2026, 8, 27, 14, 5, 3);
	it('formats name and local time', () => {
		expect(fileStamp('Shade 4', at)).toBe('Shade 4 - 2026-09-27 14.05.03');
	});
	it('falls back to untitled and strips path separators', () => {
		expect(fileStamp('  ', at)).toBe('untitled - 2026-09-27 14.05.03');
		expect(fileStamp(undefined, at)).toBe('untitled - 2026-09-27 14.05.03');
		expect(fileStamp('a/b:c', at)).toBe('a-b-c - 2026-09-27 14.05.03');
	});
});
