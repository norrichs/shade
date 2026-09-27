import type { LbProject, LbShape } from './types';
import { encodeSubpaths, fmt } from './lbrn2-path';
import { parseTemplate } from './template';
import { isToolLayer, layerByIndex } from './layers';

const minimalCutSetting = (index: number) =>
	`<CutSetting type="Cut">
        <index Value="${index}"/>
        <name Value="${layerByIndex(index)?.id ?? `C${String(index).padStart(2, '0')}`}"/>
    </CutSetting>`;

const shapeXml = (s: LbShape, indent: string): string => {
	if (s.kind === 'rect') {
		return (
			`${indent}<Shape Type="Rect" CutIndex="${s.cutIndex}" W="${fmt(s.width)}" H="${fmt(s.height)}" Cr="0">\n` +
			`${indent}    <XForm>1 0 0 1 ${fmt(s.x + s.width / 2)} ${fmt(s.y + s.height / 2)}</XForm>\n` +
			`${indent}</Shape>`
		);
	}
	return encodeSubpaths(s.segments)
		.map(
			(run) =>
				`${indent}<Shape Type="Path" CutIndex="${s.cutIndex}">\n` +
				`${indent}    <XForm>1 0 0 1 0 0</XForm>\n` +
				`${indent}    <VertList>${run.vertList}</VertList>\n` +
				`${indent}    <PrimList>${run.primList}</PrimList>\n` +
				`${indent}</Shape>`
		)
		.join('\n');
};

/**
 * One `.lbrn2` project. Every page is a Group (select a page, cut selected);
 * shapes sit on their layers; each non-tool layer used gets a CutSetting,
 * copied verbatim from the template when it has one and minimal otherwise.
 * `missingLayers` lists the minimal ones so the UI can warn before download.
 */
export const writeLbrn2 = (
	project: LbProject,
	templateXml?: string
): { xml: string; missingLayers: number[] } => {
	const template = templateXml
		? parseTemplate(templateXml)
		: { cutSettings: new Map<number, string>() };
	const used = [...new Set(project.pages.flatMap((p) => p.shapes.map((s) => s.cutIndex)))].sort(
		(a, b) => a - b
	);
	const missingLayers: number[] = [];
	const settings = used
		.filter((i) => {
			const l = layerByIndex(i);
			return !l || !isToolLayer(l);
		})
		.map((i) => {
			const block = template.cutSettings.get(i);
			if (block) return `    ${block}`;
			missingLayers.push(i);
			return `    ${minimalCutSetting(i)}`;
		});
	const groups = project.pages.map((page) => {
		const children = page.shapes.map((s) => shapeXml(s, '            ')).join('\n');
		return (
			`    <Shape Type="Group" CutIndex="${page.shapes[0]?.cutIndex ?? 0}">\n` +
			`        <XForm>1 0 0 1 0 0</XForm>\n` +
			`        <Children>\n${children}\n        </Children>\n` +
			`    </Shape>`
		);
	});
	const xml = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<LightBurnProject AppVersion="1.7.08" FormatVersion="1" MaterialHeight="0" MirrorX="False" MirrorY="False">',
		...settings,
		...groups,
		'</LightBurnProject>',
		''
	].join('\n');
	return { xml, missingLayers };
};
