/**
 * Screenshot capture for the agent bridge.
 *
 * Model: the WebGL canvas is created without `preserveDrawingBuffer`, so its
 * pixels are only readable in the same task as a render. `AgentCapture.svelte`
 * (mounted inside the Threlte canvas) registers a function that renders and
 * reads back synchronously.
 *
 * Pattern: the live pattern SVG sits on a huge page canvas where real bands are
 * a sliver, so the capture crops to the drawn content, then rasterizes. With
 * `annotate`, each band's `data-band` address is drawn over it so what the
 * agent sees can be named in a follow-up query.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

type ModelCapture = () => string;
let modelCapture: ModelCapture | null = null;

export const registerModelCapture = (capture: ModelCapture) => {
	modelCapture = capture;
	return () => {
		if (modelCapture === capture) modelCapture = null;
	};
};

export const captureModel = async (crop = true): Promise<string> => {
	if (!modelCapture) throw new Error('The 3D view is not mounted.');
	const dataUrl = modelCapture();
	return crop ? cropToContent(dataUrl) : dataUrl;
};

/**
 * Crop a transparent-background render to its opaque pixels plus a margin. The
 * camera sits at a fixed distance, so a small model is otherwise a speck.
 */
const cropToContent = (dataUrl: string): Promise<string> =>
	new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			const src = document.createElement('canvas');
			src.width = img.width;
			src.height = img.height;
			const ctx = src.getContext('2d');
			if (!ctx) return reject(new Error('No 2D canvas context'));
			ctx.drawImage(img, 0, 0);
			const { data } = ctx.getImageData(0, 0, img.width, img.height);
			let [x0, y0, x1, y1] = [img.width, img.height, -1, -1];
			for (let y = 0; y < img.height; y++) {
				for (let x = 0; x < img.width; x++) {
					if (data[(y * img.width + x) * 4 + 3] === 0) continue;
					if (x < x0) x0 = x;
					if (x > x1) x1 = x;
					if (y < y0) y0 = y;
					if (y > y1) y1 = y;
				}
			}
			if (x1 < 0) return resolve(dataUrl);
			const margin = Math.round(Math.max(x1 - x0, y1 - y0) * 0.08);
			const sx = Math.max(0, x0 - margin);
			const sy = Math.max(0, y0 - margin);
			const sw = Math.min(img.width, x1 + margin + 1) - sx;
			const sh = Math.min(img.height, y1 + margin + 1) - sy;
			// Upscale small crops so detail survives; cap the long side.
			const scale = Math.min(4, 1200 / Math.max(sw, sh));
			const out = document.createElement('canvas');
			out.width = Math.round(sw * Math.max(scale, 1));
			out.height = Math.round(sh * Math.max(scale, 1));
			const octx = out.getContext('2d');
			if (!octx) return reject(new Error('No 2D canvas context'));
			octx.fillStyle = '#ffffff';
			octx.fillRect(0, 0, out.width, out.height);
			octx.drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height);
			resolve(out.toDataURL('image/png'));
		};
		img.onerror = () => reject(new Error('The model render failed to decode'));
		img.src = dataUrl;
	});

type Rect = { x: number; y: number; width: number; height: number };

/** A client-space rect mapped into `svg`'s user space. */
const toUserRect = (svg: SVGSVGElement, el: Element): Rect | null => {
	const ctm = svg.getScreenCTM();
	const r = el.getBoundingClientRect();
	if (!ctm || r.width === 0 || r.height === 0) return null;
	const inv = ctm.inverse();
	const p0 = new DOMPoint(r.left, r.top).matrixTransform(inv);
	const p1 = new DOMPoint(r.right, r.bottom).matrixTransform(inv);
	return {
		x: Math.min(p0.x, p1.x),
		y: Math.min(p0.y, p1.y),
		width: Math.abs(p1.x - p0.x),
		height: Math.abs(p1.y - p0.y)
	};
};

const union = (rects: Rect[]): Rect | null => {
	if (rects.length === 0) return null;
	const x0 = Math.min(...rects.map((r) => r.x));
	const y0 = Math.min(...rects.map((r) => r.y));
	const x1 = Math.max(...rects.map((r) => r.x + r.width));
	const y1 = Math.max(...rects.map((r) => r.y + r.height));
	return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};

export type PatternCaptureOptions = {
	annotate?: boolean;
	/** Output width in px; height follows the content's aspect ratio. */
	width?: number;
	/** Restrict the crop to these band addresses (e.g. `g0t3b7`). */
	bands?: string[];
};

const rasterize = (svgText: string, width: number, height: number): Promise<string> =>
	new Promise((resolve, reject) => {
		const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			if (!ctx) return reject(new Error('No 2D canvas context'));
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, width, height);
			ctx.drawImage(img, 0, 0, width, height);
			URL.revokeObjectURL(url);
			resolve(canvas.toDataURL('image/png'));
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('The pattern SVG failed to rasterize'));
		};
		img.src = url;
	});

export const capturePattern = async (
	options: PatternCaptureOptions = {}
): Promise<{ dataUrl: string; bands: number; slices: number; viewBox: Rect }> => {
	const live = document.getElementById('pattern-svg') as SVGSVGElement | null;
	if (!live) throw new Error('The pattern view is not rendered.');
	const wanted = options.bands ? new Set(options.bands) : null;
	const bandEls = Array.from(live.querySelectorAll<SVGGElement>('[data-band]')).filter(
		(el) => !wanted || wanted.has(el.dataset.band ?? '')
	);
	const bandRects = bandEls
		.map((el) => ({ el, rect: toUserRect(live, el) }))
		.filter((b): b is { el: SVGGElement; rect: Rect } => b.rect !== null);
	const pageRects = wanted
		? []
		: Array.from(live.querySelectorAll('[data-geometry="page-outline"]'))
				.map((el) => toUserRect(live, el))
				.filter((r): r is Rect => r !== null);
	const content = union([...bandRects.map((b) => b.rect), ...pageRects]);
	if (!content) {
		throw new Error(
			'Nothing visible to capture: the pattern pane is hidden, empty, or the bands are not rendered.'
		);
	}
	const pad = Math.max(content.width, content.height) * 0.02;
	const viewBox = {
		x: content.x - pad,
		y: content.y - pad,
		width: content.width + 2 * pad,
		height: content.height + 2 * pad
	};

	// The content is drawn once into <defs> and shown through one nested <svg>
	// window per slice, so slicing a long strip costs no extra DOM.
	const drawing = document.createElementNS(SVG_NS, 'g');
	drawing.setAttribute('id', 'agent-capture-content');
	for (const child of Array.from(live.childNodes)) drawing.appendChild(child.cloneNode(true));
	drawing.querySelectorAll('.svg-pattern-quad, .split-target').forEach((n) => n.remove());
	if (options.annotate) {
		for (const { el, rect } of bandRects)
			drawing.appendChild(bandLabel(el.dataset.band ?? '', rect));
	}

	const width = Math.min(Math.max(options.width ?? 1600, 200), 4000);
	const slices = sliceView(viewBox);
	const gap = 12;
	const cellWidth =
		slices.across === 1 ? width : (width - gap * (slices.across - 1)) / slices.across;
	const cellHeight = (cellWidth * slices.rects[0].height) / slices.rects[0].width;
	const down = slices.rects.length / slices.across;
	const height = Math.min(Math.round(down * cellHeight + gap * (down - 1)), 8000);

	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('xmlns', SVG_NS);
	svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
	svg.setAttribute('width', String(width));
	svg.setAttribute('height', String(height));
	const defs = document.createElementNS(SVG_NS, 'defs');
	defs.appendChild(drawing);
	svg.appendChild(defs);
	slices.rects.forEach((slice, i) => {
		const cell = document.createElementNS(SVG_NS, 'svg');
		cell.setAttribute('x', String((i % slices.across) * (cellWidth + gap)));
		cell.setAttribute('y', String(Math.floor(i / slices.across) * (cellHeight + gap)));
		cell.setAttribute('width', String(cellWidth));
		cell.setAttribute('height', String(cellHeight));
		cell.setAttribute('viewBox', `${slice.x} ${slice.y} ${slice.width} ${slice.height}`);
		const use = document.createElementNS(SVG_NS, 'use');
		use.setAttribute('href', '#agent-capture-content');
		cell.appendChild(use);
		svg.appendChild(cell);
		if (i > 0) {
			const rule = document.createElementNS(SVG_NS, 'rect');
			const vertical = slices.across > 1;
			rule.setAttribute(
				'x',
				String(vertical ? (i % slices.across) * (cellWidth + gap) - gap / 2 - 1 : 0)
			);
			rule.setAttribute('y', String(vertical ? 0 : i * (cellHeight + gap) - gap / 2 - 1));
			rule.setAttribute('width', String(vertical ? 2 : width));
			rule.setAttribute('height', String(vertical ? height : 2));
			rule.setAttribute('fill', '#cccccc');
			svg.appendChild(rule);
		}
	});

	const dataUrl = await rasterize(new XMLSerializer().serializeToString(svg), width, height);
	return { dataUrl, bands: bandRects.length, slices: slices.rects.length, viewBox };
};

/** A band address centred on its band, sized to fit inside it. */
const bandLabel = (label: string, rect: Rect) => {
	const fontSize = Math.max(
		1e-3,
		Math.min(rect.height * 0.45, (rect.width * 0.9) / (0.62 * Math.max(label.length, 1)))
	);
	const text = document.createElementNS(SVG_NS, 'text');
	text.setAttribute('x', String(rect.x + rect.width / 2));
	text.setAttribute('y', String(rect.y + rect.height / 2));
	text.setAttribute('font-size', String(fontSize));
	text.setAttribute('font-family', 'sans-serif');
	text.setAttribute('font-weight', 'bold');
	text.setAttribute('text-anchor', 'middle');
	text.setAttribute('dominant-baseline', 'middle');
	text.setAttribute('fill', '#d0006f');
	text.setAttribute('stroke', '#ffffff');
	text.setAttribute('stroke-width', String(fontSize / 5));
	text.setAttribute('paint-order', 'stroke');
	text.textContent = label;
	return text;
};

/**
 * Cut a very long or very tall view into slices stacked across the other axis,
 * so a single-row layout still lands as a readable, roughly 3:2 image. Slices
 * overlap slightly so a band on a cut appears whole in one of them.
 */
export const sliceView = (view: Rect): { rects: Rect[]; across: number } => {
	const aspect = view.width / view.height;
	const MAX_ASPECT = 3;
	if (aspect <= MAX_ASPECT && aspect >= 1 / MAX_ASPECT) return { rects: [view], across: 1 };
	const wide = aspect > MAX_ASPECT;
	const ratio = wide ? aspect : 1 / aspect;
	const count = Math.max(2, Math.round(Math.sqrt(ratio / 1.5)));
	const span = wide ? view.width : view.height;
	const step = span / count;
	const overlap = step * 0.04;
	const rects = Array.from({ length: count }, (_, i) => {
		const start = Math.max(0, i * step - overlap);
		const end = Math.min(span, (i + 1) * step + overlap);
		return wide
			? { x: view.x + start, y: view.y, width: end - start, height: view.height }
			: { x: view.x, y: view.y + start, width: view.width, height: end - start };
	});
	// Equalize so every cell shares one scale (the end slices lose an overlap).
	const longest = Math.max(...rects.map((r) => (wide ? r.width : r.height)));
	for (const r of rects) {
		if (wide) r.width = longest;
		else r.height = longest;
	}
	return { rects, across: wide ? 1 : count };
};
