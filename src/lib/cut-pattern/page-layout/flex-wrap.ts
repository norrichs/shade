import { Vector3 } from 'three';
import type { LayoutItem, PageGeom, PageLayoutResult, PageRect } from './types';

export const PAGE_STACK_GAP = 40; // pattern units (default vertical gap between stacked pages)

type Interval = { x0: number; x1: number; bottom: number };

const skylineBottom = (placed: Interval[], x0: number, x1: number): number =>
	placed.reduce((max, iv) => (iv.x1 > x0 && iv.x0 < x1 ? Math.max(max, iv.bottom) : max), 0);

export const flexWrapPageLayout = (items: LayoutItem[], geom: PageGeom): PageLayoutResult => {
	const { pageScale, pageWidth, pageHeight, contentWidth, contentHeight, marginPx, pageGap, gap } =
		geom;

	// Overflow: any single item larger than the content box. Compute the smallest
	// pageScale that makes every offending item fit both dimensions.
	let factor = 0;
	let worst = -1;
	items.forEach((it, i) => {
		if (it.width > contentWidth || it.height > contentHeight) {
			const f = Math.max(it.width / contentWidth, it.height / contentHeight);
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
	let placed: Interval[] = [];

	const ensurePage = (idx: number) => {
		if (pages[idx]) return;
		pages[idx] = { x: 0, y: idx * (pageHeight + pageGap), width: pageWidth, height: pageHeight };
	};
	ensurePage(0);

	for (const it of items) {
		// Wrap to a new row when the item would exceed the content width.
		if (cursorX > 0 && cursorX + it.width > contentWidth) {
			rowTop = rowTop + rowMaxH + gap;
			cursorX = 0;
			rowMaxH = 0;
		}
		// Page break when the row's top + this item's height exceeds content height.
		if (rowTop + it.height > contentHeight) {
			page += 1;
			ensurePage(page);
			cursorX = 0;
			rowTop = 0;
			rowMaxH = 0;
			placed = [];
		}

		// Push-up packing: raise the item into the previous row's ragged underside,
		// bounded so its vertical midpoint never rises above rowTop.
		const sky = skylineBottom(placed, cursorX, cursorX + it.width);
		let itemTop = Math.max(sky > 0 ? sky + gap : 0, rowTop - it.height / 2);
		itemTop = Math.min(itemTop, rowTop);
		itemTop = Math.max(itemTop, 0);

		const contentOriginX = marginPx;
		const contentOriginY = page * (pageHeight + pageGap) + marginPx;

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
