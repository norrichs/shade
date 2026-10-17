/** Pure list operations for the multi-GCS editor. Each returns a new array. */
import type { ShapeConfig } from '#lib/types.js';

/** Insert a copy of `list[index]` right after it, as a non-primary, unpinned GCS. */
export const addGcs = (list: ShapeConfig[], index: number): ShapeConfig[] => {
	const source = list[index];
	if (!source) return list;
	const maxId = list.reduce((max, s) => Math.max(max, s.id ?? 0), 0);
	const copy: ShapeConfig = {
		...structuredClone(source),
		isPrimary: false,
		level: undefined,
		id: maxId + 1
	};
	return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)];
};

/** Remove `list[index]`; the last remaining GCS can't be deleted. */
export const deleteGcs = (list: ShapeConfig[], index: number): ShapeConfig[] => {
	if (list.length <= 1 || !list[index]) return list;
	const wasPrimary = !!list[index].isPrimary;
	const out = list.filter((_, i) => i !== index);
	if (!wasPrimary || out.some((s) => s.isPrimary)) return out;
	return out.map((s, i) => (i === 0 ? { ...s, isPrimary: true } : s));
};

/** Swap with the neighbour in direction `dir`; no-op at the ends. */
export const moveGcs = (list: ShapeConfig[], index: number, dir: -1 | 1): ShapeConfig[] => {
	const target = index + dir;
	if (!list[index] || target < 0 || target >= list.length) return list;
	const out = [...list];
	[out[index], out[target]] = [out[target], out[index]];
	return out;
};

export const setPrimary = (list: ShapeConfig[], index: number): ShapeConfig[] =>
	list.map((s, i) => ({ ...s, isPrimary: i === index }));

/** `undefined` clears the pin so the level is auto-placed again. */
export const setGcsLevel = (
	list: ShapeConfig[],
	index: number,
	level: number | undefined
): ShapeConfig[] => list.map((s, i) => (i === index ? { ...s, level } : s));
