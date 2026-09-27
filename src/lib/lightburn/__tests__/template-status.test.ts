import { describe, it, expect } from '@jest/globals';
import { readTemplateUpload, missingTemplateLayers } from '../template-status';

const XML = `<LightBurnProject><CutSetting type="Cut"><index Value="0"/><name Value="Cut"/></CutSetting></LightBurnProject>`;

describe('readTemplateUpload', () => {
	it('accepts a LightBurn project with cut layers', () => {
		const r = readTemplateUpload('cutter.lbrn2', XML, new Date('2026-09-27T12:00:00Z'));
		expect(r).toEqual({ ok: true, template: { fileName: 'cutter.lbrn2', xml: XML, loadedAt: '2026-09-27T12:00:00.000Z' } });
	});
	it('rejects other files and projects with no cut layers', () => {
		expect(readTemplateUpload('x.svg', '<svg/>')).toEqual({ ok: false, error: 'Not a LightBurn project file' });
		expect(readTemplateUpload('e.lbrn2', '<LightBurnProject></LightBurnProject>')).toEqual({
			ok: false,
			error: 'The template has no cut layers'
		});
	});
});

describe('missingTemplateLayers', () => {
	it('lists mapped non-tool layers the template lacks', () => {
		// defaults use C00, C01, C02 and T1; the template has C00 only
		expect(missingTemplateLayers(undefined, XML)).toEqual(['C01', 'C02']);
		expect(missingTemplateLayers(undefined, undefined)).toEqual(['C00', 'C01', 'C02']);
	});
});
