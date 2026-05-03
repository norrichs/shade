import type { UnitDefinition } from '$lib/patterns/spec-types';
import { isLinePathSegment, isMovePathSegment } from '$lib/types';
import type { PathSegment } from '$lib/types';

export type VertexRef = {
	group: 'start' | 'middle' | 'end';
	index: number;
};

export type Vertex = {
	x: number;
	y: number;
	refs: VertexRef[];
};

const groups: VertexRef['group'][] = ['start', 'middle', 'end'];

export const computeVertices = (unit: UnitDefinition): Vertex[] => {
	const byKey = new Map<string, Vertex>();
	for (const group of groups) {
		const segments: PathSegment[] = unit[group];
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			if (!isMovePathSegment(seg) && !isLinePathSegment(seg)) continue;
			const x = seg[1];
			const y = seg[2];
			const key = `${x}::${y}`;
			const existing = byKey.get(key);
			if (existing) {
				existing.refs.push({ group, index: i });
			} else {
				byKey.set(key, { x, y, refs: [{ group, index: i }] });
			}
		}
	}
	return Array.from(byKey.values());
};

export const computeVerticesFromFlatPath = (path: PathSegment[]): Vertex[] => {
	const byKey = new Map<string, Vertex>();
	for (let i = 0; i < path.length; i++) {
		const seg = path[i];
		if (!isMovePathSegment(seg) && !isLinePathSegment(seg)) continue;
		const x = seg[1];
		const y = seg[2];
		const key = `${x}::${y}`;
		const existing = byKey.get(key);
		if (existing) {
			existing.refs.push({ group: 'middle', index: i });
		} else {
			byKey.set(key, { x, y, refs: [{ group: 'middle', index: i }] });
		}
	}
	return Array.from(byKey.values());
};

export const updateUnitForVertexMove = (
	unit: UnitDefinition,
	vertex: Vertex,
	newX: number,
	newY: number
): UnitDefinition => {
	const next: UnitDefinition = {
		width: unit.width,
		height: unit.height,
		start: [...unit.start],
		middle: [...unit.middle],
		end: [...unit.end]
	};
	for (const ref of vertex.refs) {
		const seg = next[ref.group][ref.index];
		if (!isMovePathSegment(seg) && !isLinePathSegment(seg)) continue;
		next[ref.group] = [...next[ref.group]];
		next[ref.group][ref.index] = [seg[0], newX, newY];
	}
	return next;
};
