import { describe, it, expect } from '@jest/globals';
import { parseTemplate } from '../template';

const TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<LightBurnProject AppVersion="1.7.08" FormatVersion="1">
    <CutSetting type="Cut">
        <index Value="0"/>
        <name Value="Cut paper"/>
        <maxPower Value="35"/>
        <speed Value="40"/>
    </CutSetting>
    <CutSetting type="Cut">
        <index Value="2"/>
        <name Value="Score"/>
        <maxPower Value="8"/>
    </CutSetting>
    <CutSetting_Img type="Image">
        <index Value="5"/>
    </CutSetting_Img>
</LightBurnProject>`;

describe('parseTemplate', () => {
	it('extracts CutSetting blocks verbatim by index', () => {
		const t = parseTemplate(TEMPLATE);
		expect([...t.cutSettings.keys()]).toEqual([0, 2]);
		expect(t.cutSettings.get(0)).toContain('<maxPower Value="35"/>');
		expect(t.cutSettings.get(0)!.startsWith('<CutSetting type="Cut">')).toBe(true);
		expect(t.cutSettings.get(0)!.endsWith('</CutSetting>')).toBe(true);
	});

	it('rejects a file that is not a LightBurn project', () => {
		expect(() => parseTemplate('<svg></svg>')).toThrow('Not a LightBurn project file');
	});
});
