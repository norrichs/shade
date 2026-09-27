import { buildExportSvg } from '../util';
import type { ExportFrame } from '$lib/download/export-frame';

/**
 * The exported SVG drives a cutter/plotter: anything serialised into it is a
 * stroke somebody has to cut. Split seams are screen furniture — a grey dashed
 * hairline per legal boundary while placing splits, a red one per existing
 * split, plus a transparent `.hit` line carrying `role="button"` — and none of
 * it belongs in the cut file.
 *
 * jsdom is not available in this project's Jest environment (see
 * `download-text-file.test.ts`), so the DOM `buildExportSvg` walks is stubbed:
 * a minimal element tree with the handful of operations it uses (class- and
 * tag-based `querySelectorAll`, `closest`, attribute get/set, cloning, and a
 * `toString` that renders it back to markup). The assertions are over that
 * exported STRING, which is the artefact that reaches the cutter.
 */

const FAKE_FRAME: ExportFrame = {
	width: '100mm',
	height: '100mm',
	viewBox: '0 0 100 100',
	contentTransform: 'scale(1) translate(0 0)',
	widthMm: 100,
	heightMm: 100
};

class FakeElement {
	tag: string;
	classes: string[];
	attrs: Record<string, string>;
	children: FakeElement[] = [];
	parent: FakeElement | undefined;

	constructor(tag: string, classes: string[] = [], attrs: Record<string, string> = {}) {
		this.tag = tag;
		this.classes = classes;
		this.attrs = attrs;
	}

	get tagName(): string {
		return this.tag;
	}

	get childNodes(): FakeElement[] {
		return this.children;
	}

	append(...children: FakeElement[]): FakeElement {
		for (const child of children) {
			child.parent = this;
			this.children.push(child);
		}
		return this;
	}

	appendChild(child: FakeElement): FakeElement {
		return this.append(child);
	}

	getAttribute(name: string): string | null {
		return this.attrs[name] ?? null;
	}

	setAttribute(name: string, value: string): void {
		this.attrs[name] = value;
	}

	descendants(): FakeElement[] {
		return this.children.flatMap((child) => [child, ...child.descendants()]);
	}

	/** Supports the three selector shapes this codebase actually uses:
	 * `.class, .class2`, a bare comma list of tag names, and `[attr]`. */
	private matches(selector: string): boolean {
		return selector
			.split(',')
			.map((s) => s.trim())
			.some((part) => {
				if (part.startsWith('.')) return this.classes.includes(part.slice(1));
				if (part.startsWith('[') && part.endsWith(']')) {
					return Object.hasOwn(this.attrs, part.slice(1, -1));
				}
				return this.tag === part;
			});
	}

	querySelectorAll(selector: string): FakeElement[] {
		return this.descendants().filter((el) => el.matches(selector));
	}

	closest(selector: string): FakeElement | null {
		let node: FakeElement | undefined = this;
		while (node) {
			if (node.matches(selector)) return node;
			node = node.parent;
		}
		return null;
	}

	remove(): void {
		if (!this.parent) return;
		this.parent.children = this.parent.children.filter((c) => c !== this);
		this.parent = undefined;
	}

	cloneNode(deep: boolean): FakeElement {
		const copy = new FakeElement(this.tag, [...this.classes], { ...this.attrs });
		if (deep) copy.append(...this.children.map((child) => child.cloneNode(true)));
		return copy;
	}

	toString(): string {
		const classAttr = this.classes.length ? ` class="${this.classes.join(' ')}"` : '';
		const attrs = Object.entries(this.attrs)
			.map(([k, v]) => ` ${k}="${v}"`)
			.join('');
		return `<${this.tag}${classAttr}${attrs}>${this.children
			.map((c) => c.toString())
			.join('')}</${this.tag}>`;
	}
}

/** A pattern SVG holding one band with a split seam and a live hit target. */
const buildPatternSvg = ({ interactive }: { interactive: boolean }): FakeElement => {
	const seam = new FakeElement('g', ['split-target', 'active']).append(
		new FakeElement('line', ['hairline'], { x1: '0', y1: '0', x2: '10', y2: '0' })
	);
	if (interactive) {
		seam.append(
			new FakeElement('line', ['hit'], {
				role: 'button',
				tabindex: '0',
				'aria-label': 'Remove split at quad 30'
			})
		);
	}
	const band = new FakeElement('g', ['band']).append(
		new FakeElement('path', ['band-outline'], { d: 'M0 0 L10 0', 'data-geometry': 'pattern-outline' }),
		new FakeElement('g', ['svg-pattern-quad']).append(new FakeElement('path', [], { d: 'M0 0' })),
		// The assembler cross-view highlight: a filled rect over the whole band.
		new FakeElement('rect', ['screen-only'], { fill: 'rgb(255,0,0)', width: '10' }),
		// The bounds debug overlay.
		new FakeElement('g', ['bounds', 'screen-only']).append(
			new FakeElement('rect', [], { width: '10' })
		),
		seam
	);
	return new FakeElement('svg', [], { id: 'pattern-svg' }).append(band);
};

const install = (root: FakeElement) => {
	const globals = global as unknown as Record<string, unknown>;
	globals.document = {
		getElementById: (id: string) => (root.attrs.id === id ? root : null),
		createElementNS: (_ns: string, tag: string) => new FakeElement(tag)
	};
};

/** Runs `buildExportSvg`, asserting success, and returns the serialised markup. */
const buildAndSerialize = (): string => {
	const result = buildExportSvg(FAKE_FRAME);
	if ('error' in result) throw new Error(`buildExportSvg failed: ${result.error}`);
	return (result.svg as unknown as FakeElement).toString();
};

describe('buildExportSvg', () => {
	test('leaves split seams out of the exported SVG when a split is placed', () => {
		install(buildPatternSvg({ interactive: false }));

		const serialized = buildAndSerialize();

		expect(serialized).not.toContain('split-target');
		expect(serialized).not.toContain('hairline');
		// The band itself must still be there — this is the cut geometry.
		expect(serialized).toContain('band-outline');
	});

	test('leaves the click targets out of the exported SVG while split mode is on', () => {
		install(buildPatternSvg({ interactive: true }));

		const serialized = buildAndSerialize();

		expect(serialized).not.toContain('split-target');
		expect(serialized).not.toContain('hairline');
		expect(serialized).not.toContain('role="button"');
		expect(serialized).not.toContain('tabindex');
		expect(serialized).toContain('band-outline');
	});

	test('strips the pattern quads, as it always has', () => {
		install(buildPatternSvg({ interactive: false }));

		const serialized = buildAndSerialize();

		expect(serialized).not.toContain('svg-pattern-quad');
	});

	test('leaves the band overlay rectangles out of the exported SVG', () => {
		// A filled rect over a whole band is the worst thing to hand a cutter, and
		// the highlight follows the selection — so the export used to depend on
		// which band happened to be clicked last.
		install(buildPatternSvg({ interactive: false }));

		const serialized = buildAndSerialize();

		expect(serialized).not.toContain('screen-only');
		expect(serialized).not.toContain('bounds');
		expect(serialized).not.toContain('<rect');
		expect(serialized).toContain('band-outline');
	});

	test('keeps each band label inside the band group it names', () => {
		// Labels used to be appendChild'd out of their band and into a shared
		// `label-tag-portal-container` sibling, so the cut file arrived as a pile
		// of band paths followed by a pile of unattached glyphs. Downstream the
		// grouping IS the identity of a physical piece: a band's outline and the
		// text naming it have to travel together.
		const band = new FakeElement('g', ['band'], { id: 'band-b1' }).append(
			new FakeElement('path', ['band-outline'], {
				d: 'M0 0 L10 0',
				'data-geometry': 'pattern-outline'
			}),
			new FakeElement('g', [], { id: 'band-label-band-self-b1' }).append(
				new FakeElement('path', [], { d: 'M0 0 L1 1', 'data-geometry': 'label-text' })
			)
		);
		install(new FakeElement('svg', [], { id: 'pattern-svg' }).append(band));

		const serialized = buildAndSerialize();

		expect(serialized).toMatch(
			/<g class="band" id="band-b1">.*id="band-label-band-self-b1".*<\/g>/s
		);
		// And no portal container survives as a sibling holding loose labels.
		expect(serialized).not.toContain('label-tag-portal-container');
	});

	test('leaves the hidden label measurement mirror out of the exported SVG', () => {
		// PatternLabel renders a second, invisible copy of the label text purely
		// so getBBox() has a stable node to read. It is hidden with inline
		// `visibility`, which the serializer happily carries into the cut file —
		// real glyph paths the cutter would trace. It must carry `screen-only`.
		const band = new FakeElement('g', ['band'], { id: 'band-b1' }).append(
			new FakeElement('path', ['band-outline'], {
				d: 'M0 0 L10 0',
				'data-geometry': 'pattern-outline'
			}),
			new FakeElement('g', ['screen-only'], { style: 'visibility: hidden;' }).append(
				new FakeElement('path', ['measured-glyph'], { d: 'M5 5 L6 6' })
			)
		);
		install(new FakeElement('svg', [], { id: 'pattern-svg' }).append(band));

		const serialized = buildAndSerialize();

		expect(serialized).not.toContain('measured-glyph');
		expect(serialized).not.toContain('visibility: hidden');
		expect(serialized).toContain('band-outline');
	});

	test('does not mutate the live document', () => {
		const root = buildPatternSvg({ interactive: true });
		install(root);

		buildExportSvg(FAKE_FRAME);

		// Export is a read: the on-screen split targets are Svelte-owned nodes and
		// ripping them out of the live tree would leave the placing UI dead until
		// the next full re-render.
		const live = root.toString();
		expect(live).toContain('split-target');
		expect(live).toContain('svg-pattern-quad');
	});

	test('refuses export when a drawable has no geometry tag', () => {
		const band = new FakeElement('g', ['band']).append(
			// No `data-geometry` — this is the guard's whole reason for existing.
			new FakeElement('path', ['band-outline'], { d: 'M0 0 L10 0' })
		);
		install(new FakeElement('svg', [], { id: 'pattern-svg' }).append(band));

		const result = buildExportSvg(FAKE_FRAME);

		expect(result).toHaveProperty('error');
	});

	test('wraps content in a group carrying the frame content transform', () => {
		install(buildPatternSvg({ interactive: false }));

		const serialized = buildAndSerialize();

		expect(serialized).toContain(`transform="${FAKE_FRAME.contentTransform}"`);
	});

	test('sizes the root in millimetres from the frame', () => {
		install(buildPatternSvg({ interactive: false }));

		const serialized = buildAndSerialize();

		expect(serialized).toContain(`width="${FAKE_FRAME.width}"`);
		expect(serialized).toContain(`height="${FAKE_FRAME.height}"`);
		expect(serialized).toContain(`viewBox="${FAKE_FRAME.viewBox}"`);
	});
});
