import { Vector3 } from 'three';
import type { LayoutItem, PageGeom, PageLayoutResult, PageRect } from './types';

const EPS = 1e-6;

type SkySeg = { x: number; width: number; top: number };
type Orient = { w: number; h: number; rot: number };

const orientsOf = (it: LayoutItem, allowRotation: boolean): Orient[] =>
	allowRotation && Math.abs(it.width - it.height) > EPS
		? [
				{ w: it.width, h: it.height, rot: 0 },
				{ w: it.height, h: it.width, rot: 90 }
			]
		: [{ w: it.width, h: it.height, rot: 0 }];

// Resting top for an item of width w whose left edge sits at segment i's x.
// Null if it would run past contentWidth.
const restAt = (sky: SkySeg[], i: number, w: number, contentWidth: number): number | null => {
	if (sky[i].x + w > contentWidth + EPS) return null;
	let top = 0;
	let acc = 0;
	for (let j = i; j < sky.length && acc < w - EPS; j++) {
		top = Math.max(top, sky[j].top);
		acc += sky[j].width;
	}
	return top;
};

// Raise the span [x, x+w] to newTop, splitting/merging segments; keeps sky sorted.
const raise = (sky: SkySeg[], x: number, w: number, newTop: number): SkySeg[] => {
	const x1 = x + w;
	const split: SkySeg[] = [];
	for (const s of sky) {
		const s1 = s.x + s.width;
		if (s1 <= x + EPS || s.x >= x1 - EPS) {
			split.push(s);
			continue;
		}
		if (s.x < x - EPS) split.push({ x: s.x, width: x - s.x, top: s.top });
		const a = Math.max(s.x, x);
		const b = Math.min(s1, x1);
		split.push({ x: a, width: b - a, top: newTop });
		if (s1 > x1 + EPS) split.push({ x: x1, width: s1 - x1, top: s.top });
	}
	const merged: SkySeg[] = [];
	for (const s of split) {
		const last = merged[merged.length - 1];
		if (last && Math.abs(last.top - s.top) < EPS && Math.abs(last.x + last.width - s.x) < EPS) {
			last.width += s.width;
		} else {
			merged.push({ ...s });
		}
	}
	return merged;
};

type Placement = { o: Orient; x: number; top: number; score: number };

// Best (lowest resulting top) placement for one item on the current skyline.
const bestPlacement = (
	it: LayoutItem,
	sky: SkySeg[],
	contentWidth: number,
	contentHeight: number,
	allowRotation: boolean
): Placement | null => {
	let best: Placement | null = null;
	for (const o of orientsOf(it, allowRotation)) {
		for (let i = 0; i < sky.length; i++) {
			const top = restAt(sky, i, o.w, contentWidth);
			if (top === null || top + o.h > contentHeight + EPS) continue;
			const score = top + o.h;
			const x = sky[i].x;
			if (!best || score < best.score - EPS || (Math.abs(score - best.score) < EPS && x < best.x - EPS)) {
				best = { o, x, top, score };
			}
		}
	}
	return best;
};

export const skylinePageLayout = (items: LayoutItem[], geom: PageGeom): PageLayoutResult => {
	const {
		pageScale,
		pageWidth,
		pageHeight,
		contentWidth,
		contentHeight,
		marginPx,
		pageGap,
		reorderWindow,
		allowRotation
	} = geom;
	const W = Math.max(1, Math.floor(reorderWindow));

	// Overflow: an item that cannot fit a fresh empty page in any orientation.
	let worst = -1;
	let factor = 0;
	items.forEach((it, i) => {
		const os = orientsOf(it, allowRotation);
		const fits = os.some((o) => o.w <= contentWidth + EPS && o.h <= contentHeight + EPS);
		if (!fits) {
			const f = Math.min(...os.map((o) => Math.max(o.w / contentWidth, o.h / contentHeight)));
			if (f > factor) {
				factor = f;
				worst = i;
			}
		}
	});
	if (worst >= 0) {
		return {
			origins: [],
			rotations: [],
			pages: [],
			overflow: { itemIndex: worst, requiredScale: pageScale * factor }
		};
	}

	const queue = items.map((_, i) => i);
	const origins: Vector3[] = new Array(items.length);
	const rotations: number[] = new Array(items.length).fill(0);
	const pages: PageRect[] = [];

	let page = 0;
	let sky: SkySeg[] = [{ x: 0, width: contentWidth, top: 0 }];
	const ensurePage = (idx: number) => {
		if (!pages[idx]) {
			pages[idx] = { x: 0, y: idx * (pageHeight + pageGap), width: pageWidth, height: pageHeight };
		}
	};
	ensurePage(0);

	const commit = (qi: number, p: Placement) => {
		const idx = queue[qi];
		const it = items[idx];
		const pageOffsetY = page * (pageHeight + pageGap);
		const cx = it.left + it.width / 2; // local bounds-center
		const cy = it.top + it.height / 2;
		origins[idx] = new Vector3(
			marginPx + p.x + p.o.w / 2 - cx,
			pageOffsetY + marginPx + p.top + p.o.h / 2 - cy,
			0
		);
		rotations[idx] = p.o.rot;
		sky = raise(sky, p.x, p.o.w, p.top + p.o.h);
		queue.splice(qi, 1);
	};

	while (queue.length > 0) {
		const wEnd = Math.min(W, queue.length);
		let choiceQi = -1;
		let choice: Placement | null = null;
		for (let qi = 0; qi < wEnd; qi++) {
			const p = bestPlacement(items[queue[qi]], sky, contentWidth, contentHeight, allowRotation);
			if (!p) continue;
			const better =
				!choice ||
				p.score < choice.score - EPS ||
				(Math.abs(p.score - choice.score) < EPS &&
					(p.x < choice.x - EPS ||
						(Math.abs(p.x - choice.x) < EPS && queue[qi] < queue[choiceQi])));
			if (better) {
				choice = p;
				choiceQi = qi;
			}
		}
		if (choice) {
			commit(choiceQi, choice);
		} else {
			// Nothing in the window fits the current page: new page, place the front item.
			page += 1;
			ensurePage(page);
			sky = [{ x: 0, width: contentWidth, top: 0 }];
			const front = bestPlacement(items[queue[0]], sky, contentWidth, contentHeight, allowRotation);
			// Non-null: overflow was pre-checked, so it fits a fresh page.
			commit(0, front as Placement);
		}
	}

	return { origins, rotations, pages };
};
