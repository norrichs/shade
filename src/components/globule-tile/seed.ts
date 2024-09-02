import type { Level, Band, Strut } from '$lib/types';

export type GlobuleData = { levels?: Level[]; bands: Band[]; struts?: Strut[] };
export type Globule = { name: string; globuleConfigId: string; data: GlobuleData };
