import { describe, it, expect } from '@jest/globals';
import { writeLbrn2 } from '../lbrn2-writer';
import type { LbProject } from '../types';

const project: LbProject = {
	pages: [
		{
			shapes: [
				{ kind: 'rect', cutIndex: 30, x: 0, y: 0, width: 300, height: 300 },
				{ kind: 'path', cutIndex: 0, segments: [['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['Z']] },
				{ kind: 'path', cutIndex: 1, segments: [['M', 1, 1], ['L', 2, 2]] }
			]
		},
		{ shapes: [{ kind: 'rect', cutIndex: 30, x: 0, y: 310, width: 300, height: 300 }] }
	]
};
const TEMPLATE = `<LightBurnProject><CutSetting type="Cut">
        <index Value="0"/>
        <name Value="Cut paper"/>
        <maxPower Value="35"/>
    </CutSetting></LightBurnProject>`;

const balanced = (xml: string, tag: string) =>
	(xml.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length ===
	(xml.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;

describe('writeLbrn2', () => {
	it('writes one Group per page with each page rect centred', () => {
		const { xml } = writeLbrn2(project);
		expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
		expect((xml.match(/<Shape Type="Group"/g) ?? []).length).toBe(2);
		expect(xml).toContain('<Shape Type="Rect" CutIndex="30" W="300" H="300" Cr="0">');
		expect(xml).toContain('<XForm>1 0 0 1 150 150</XForm>');
		expect(xml).toContain('<XForm>1 0 0 1 150 460</XForm>');
		expect(balanced(xml, 'Shape')).toBe(true);
		expect(balanced(xml, 'Children')).toBe(true);
		expect(balanced(xml, 'CutSetting')).toBe(true);
	});

	it('copies template CutSettings verbatim and reports missing layers', () => {
		const { xml, missingLayers } = writeLbrn2(project, TEMPLATE);
		expect(xml).toContain('<maxPower Value="35"/>');
		expect(missingLayers).toEqual([1]);
		expect(xml).toMatch(/<CutSetting type="Cut">\s*<index Value="1"\/>\s*<name Value="C01"\/>/);
	});

	it('gives tool layers no CutSetting', () => {
		const { xml, missingLayers } = writeLbrn2(project);
		expect(xml).not.toContain('<index Value="30"/>');
		expect(missingLayers).toEqual([0, 1]);
	});

	it('writes path shapes with encoded vertices', () => {
		const { xml } = writeLbrn2(project);
		expect(xml).toContain('<Shape Type="Path" CutIndex="0">');
		expect(xml).toContain('<PrimList>L0 1L1 2L2 0</PrimList>');
	});
});
