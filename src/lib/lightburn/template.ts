export type ParsedTemplate = { cutSettings: Map<number, string> };

/**
 * `<CutSetting>` blocks from a LightBurn project saved on the cutting machine,
 * keyed by layer index and kept verbatim, so every parameter (and any
 * material-library link) travels into generated files unchanged.
 * `<CutSetting_Img>` (image layers) is not matched.
 */
export const parseTemplate = (xml: string): ParsedTemplate => {
	if (!/<LightBurnProject[\s>]/.test(xml)) throw new Error('Not a LightBurn project file');
	const cutSettings = new Map<number, string>();
	for (const block of xml.match(/<CutSetting\b[^>]*>[\s\S]*?<\/CutSetting>/g) ?? []) {
		const index = block.match(/<index\s+Value="(\d+)"/);
		if (index) cutSettings.set(Number(index[1]), block);
	}
	return { cutSettings };
};
