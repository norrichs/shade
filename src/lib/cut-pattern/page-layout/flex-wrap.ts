import { Vector3 } from 'three';
import { pageOrigin } from './page-grid';
import { keepOutFitFactor } from './registration-mark';
import type { LayoutItem, PageGeom, PageLayoutResult, PageRect } from './types';

export const PAGE_STACK_GAP = 40; // pattern units (default gap between neighbouring pages)

type Interval = { x0: number; x1: number; bottom: number };

const skylineBottom = (placed: Interval[], x0: number, x1: number): number =>
	placed.reduce((max, iv) => (iv.x1 > x0 && iv.x0 < x1 ? Math.max(max, iv.bottom) : max), 0);

export const flexWrapPageLayout = (items: LayoutItem[], geom: PageGeom): PageLayoutResult => {
	const { pageScale, pageWidth, pageHeight, contentWidth, contentHeight, marginPx, gap, keepOut } =
		geom;

	// Overflow: any single item that fits a fresh page neither beside nor below the
	// keep-out (or, without one, is larger than the content box). Compute the
	// smallest pageScale that makes every offending item fit.
	let factor = 0;
	let worst = -1;
	items.forEach((it, i) => {
		const f = keepOutFitFactor(it.width, it.height, contentWidth, contentHeight, keepOut, gap);
		if (f > 1) {
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

	const origins: Vector3[] = [];
	const pages: PageRect[] = [];

	let page = 0;
	let cursorX = 0;
	let rowTop = 0;
	let rowMaxH = 0;
	// The keep-out, gap-inflated on its left, is a pre-placed obstacle on every
	// page so push-up packing never raises an item beside or into it.
	const pageObstacles = (): Interval[] =>
		keepOut
			? [{ x0: contentWidth - keepOut.width - gap, x1: contentWidth, bottom: keepOut.height }]
			: [];
	let placed: Interval[] = pageObstacles();
	// A row whose top is level with the keep-out must end short of it.
	const rowLimit = () =>
		keepOut && rowTop < keepOut.height + gap ? contentWidth - keepOut.width - gap : contentWidth;
	// An item too wide to sit beside the keep-out starts its row below it.
	const dropBelowKeepOut = (it: LayoutItem) => {
		if (keepOut && cursorX === 0 && it.width > rowLimit()) rowTop = keepOut.height + gap;
	};

	const ensurePage = (idx: number) => {
		if (pages[idx]) return;
		pages[idx] = { ...pageOrigin(idx, geom), width: pageWidth, height: pageHeight };
	};
	ensurePage(0);

	for (const it of items) {
		// Wrap to a new row when the item would exceed the content width.
		if (cursorX > 0 && cursorX + it.width > rowLimit()) {
			rowTop = rowTop + rowMaxH + gap;
			cursorX = 0;
			rowMaxH = 0;
		}
		dropBelowKeepOut(it);
		// Page break when the row's top + this item's height exceeds content height.
		if (rowTop + it.height > contentHeight) {
			page += 1;
			ensurePage(page);
			cursorX = 0;
			rowTop = 0;
			rowMaxH = 0;
			placed = pageObstacles();
			dropBelowKeepOut(it);
		}

		// Push-up packing: raise the item into the previous row's ragged underside,
		// bounded so its vertical midpoint never rises above rowTop.
		const sky = skylineBottom(placed, cursorX, cursorX + it.width);
		let itemTop = Math.max(sky > 0 ? sky + gap : 0, rowTop - it.height / 2);
		itemTop = Math.min(itemTop, rowTop);
		itemTop = Math.max(itemTop, 0);

		const contentOriginX = pages[page].x + marginPx;
		const contentOriginY = pages[page].y + marginPx;

		origins.push(
			new Vector3(
				contentOriginX + cursorX - it.left,
				contentOriginY + itemTop + it.alignedYOffset - it.top,
				0
			)
		);

		placed.push({ x0: cursorX, x1: cursorX + it.width, bottom: itemTop + it.height });
		cursorX += it.width + gap;
		rowMaxH = Math.max(rowMaxH, it.height);
	}

	return { origins, rotations: origins.map(() => 0), pages };
};
