export type PagePreset = { id: string; label: string; width: number; height: number }; // mm

export const PAGE_PRESETS: PagePreset[] = [
	{ id: '12x12', label: '12 × 12 in', width: 304.8, height: 304.8 },
	{ id: '8.5x11', label: '8.5 × 11 in', width: 215.9, height: 279.4 },
	{ id: '11x17', label: '11 × 17 in', width: 279.4, height: 431.8 }
];
