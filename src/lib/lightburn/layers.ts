import type { GeometryType } from '$lib/cut-pattern/post-process-types';

export const LAYER_IDS = [
	'C00', 'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09',
	'C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17', 'C18', 'C19',
	'C20', 'C21', 'C22', 'C23', 'C24', 'C25', 'C26', 'C27', 'C28', 'C29',
	'T1', 'T2'
] as const;
export type LayerId = (typeof LAYER_IDS)[number];

export type LightBurnLayer = {
	id: LayerId;
	/** CutIndex in a .lbrn2 file. */
	index: number;
	/** Exact LightBurn palette value; near colors mis-match on import. */
	hex: string;
	colorName: string;
	/** Hard-coded meaning in Ben's LightBurn setup. Edit here to rename. */
	functionName: string;
};

const layer = (
	id: LayerId,
	index: number,
	hex: string,
	colorName: string,
	functionName: string
): LightBurnLayer => ({ id, index, hex, colorName, functionName });

export const LIGHTBURN_LAYERS: readonly LightBurnLayer[] = [
	layer('C00', 0, '#000000', 'black', 'cut'),
	layer('C01', 1, '#0000FF', 'blue', 'skip'),
	layer('C02', 2, '#FF0000', 'red', 'score'),
	layer('C03', 3, '#00E000', 'green', 'engrave'),
	layer('C04', 4, '#D0D000', 'yellow', 'light cut'),
	layer('C05', 5, '#FF8000', 'orange', 'perforate'),
	layer('C06', 6, '#00E0E0', 'cyan', 'unassigned'),
	layer('C07', 7, '#FF00FF', 'magenta', 'unassigned'),
	layer('C08', 8, '#B4B4B4', 'light grey', 'unassigned'),
	layer('C09', 9, '#0000A0', 'dark blue', 'unassigned'),
	layer('C10', 10, '#A00000', 'dark red', 'unassigned'),
	layer('C11', 11, '#00A000', 'dark green', 'unassigned'),
	layer('C12', 12, '#A0A000', 'olive', 'unassigned'),
	layer('C13', 13, '#C08000', 'ochre', 'unassigned'),
	layer('C14', 14, '#00A0FF', 'sky blue', 'unassigned'),
	layer('C15', 15, '#A000A0', 'purple', 'unassigned'),
	layer('C16', 16, '#808080', 'grey', 'unassigned'),
	layer('C17', 17, '#7D87B9', 'periwinkle', 'unassigned'),
	layer('C18', 18, '#BB7784', 'dusty rose', 'unassigned'),
	layer('C19', 19, '#4A6FE3', 'royal blue', 'unassigned'),
	layer('C20', 20, '#D33F6A', 'raspberry', 'unassigned'),
	layer('C21', 21, '#8CD78C', 'light green', 'unassigned'),
	layer('C22', 22, '#F0B98D', 'peach', 'unassigned'),
	layer('C23', 23, '#F6C4E1', 'pale pink', 'unassigned'),
	layer('C24', 24, '#FA9ED4', 'pink', 'unassigned'),
	layer('C25', 25, '#500A78', 'indigo', 'unassigned'),
	layer('C26', 26, '#B45A00', 'brown', 'unassigned'),
	layer('C27', 27, '#004754', 'dark teal', 'unassigned'),
	layer('C28', 28, '#86FA88', 'mint', 'unassigned'),
	layer('C29', 29, '#FFDB66', 'gold', 'unassigned'),
	layer('T1', 30, '#F36926', 'tool orange', 'page'),
	layer('T2', 31, '#0C96D9', 'tool blue', 'guide')
];

const BY_ID = new Map(LIGHTBURN_LAYERS.map((l) => [l.id, l]));
const BY_INDEX = new Map(LIGHTBURN_LAYERS.map((l) => [l.index, l]));

export const isLayerId = (v: unknown): v is LayerId =>
	typeof v === 'string' && BY_ID.has(v as LayerId);
export const layerById = (id: LayerId): LightBurnLayer => BY_ID.get(id)!;
export const layerByIndex = (index: number): LightBurnLayer | undefined => BY_INDEX.get(index);
/** Tool layers are never sent to the laser and carry no cut settings. */
export const isToolLayer = (l: LightBurnLayer): boolean => l.id === 'T1' || l.id === 'T2';

export type LayerMap = Partial<Record<GeometryType, LayerId>>;

export const DEFAULT_LAYER_MAP: Record<GeometryType, LayerId> = {
	'pattern-outline': 'C00',
	'pattern-hole': 'C00',
	'surround-disconnect': 'C00',
	'outline-gap': 'C01',
	'label-text': 'C02',
	'page-label': 'C02',
	'page-outline': 'T1'
};

export const resolveLayer = (type: GeometryType, map?: LayerMap): LightBurnLayer =>
	layerById(map?.[type] ?? DEFAULT_LAYER_MAP[type]);

export const layerStroke = (type: GeometryType, map?: LayerMap): string =>
	resolveLayer(type, map).hex;

export const layerOptionLabel = (l: LightBurnLayer): string =>
	`${l.id} · ${l.colorName} · ${l.functionName}`;
