export type PathEditorConfig = {
	padding: number;
	gutter: number;
	contentBounds: { top: number; left: number; width: number; height: number };
	size: { width: number; height: number };
};

export type PathEditorCanvas = {
	viewBox: string;
	viewBoxData: { top: number; left: number; width: number; height: number };
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	scale: number;
};

export const getCanvas = (pathEditorConfig: PathEditorConfig): PathEditorCanvas => {
	const { contentBounds, padding, gutter } = pathEditorConfig;
	const { top, left, width, height } = contentBounds;
	const minX = left - padding - gutter;
	const minY = top - padding - gutter;
	const maxX = left + width + padding + gutter * 2;
	const maxY = top + height + padding + gutter * 2;
	const viewBoxData = {
		top: top - padding,
		left: left - padding,
		width: width + padding * 2,
		height: height + padding * 2
	};
	const viewBox = `${viewBoxData.left} ${viewBoxData.top} ${viewBoxData.width} ${viewBoxData.height}`;
	const scale = (width + padding * 2) / pathEditorConfig.size.width;

	return { viewBox, viewBoxData, minX, minY, maxX, maxY, scale };
};
