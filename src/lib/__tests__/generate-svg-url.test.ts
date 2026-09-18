import { generateSvgUrl } from '../util';

/**
 * The exported SVG drives a cutter/plotter: anything serialised into it is a
 * stroke somebody has to cut. Split seams are screen furniture — a grey dashed
 * hairline per legal boundary while placing splits, a red one per existing
 * split, plus a transparent `.hit` line carrying `role="button"` — and none of
 * it belongs in the cut file.
 *
 * jsdom is not available in this project's Jest environment (see
 * `download-text-file.test.ts`), so the DOM the exporter walks is stubbed: a
 * minimal element tree with the handful of operations `generateSvgUrl` uses,
 * and a serializer that renders it back to markup. The assertions are over that
 * exported STRING, which is the artefact that reaches the cutter.
 */

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

	append(...children: FakeElement[]): FakeElement {
		for (const child of children) {
			child.parent = this;
			this.children.push(child);
		}
		return this;
	}

	descendants(): FakeElement[] {
		return this.children.flatMap((child) => [child, ...child.descendants()]);
	}

	querySelectorAll(selector: string): FakeElement[] {
		const wanted = selector
			.split(',')
			.map((s) => s.trim().replace(/^\./, ''))
			.filter(Boolean);
		return this.descendants().filter((el) => el.classes.some((c) => wanted.includes(c)));
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
		new FakeElement('path', ['band-outline'], { d: 'M0 0 L10 0' }),
		new FakeElement('g', ['svg-pattern-quad']).append(new FakeElement('path', [], { d: 'M0 0' })),
		seam
	);
	return new FakeElement('svg', [], { id: 'pattern-svg' }).append(band);
};

let serialized = '';

const install = (root: FakeElement) => {
	serialized = '';
	const globals = global as unknown as Record<string, unknown>;
	globals.document = {
		getElementById: (id: string) => (root.attrs.id === id ? root : null)
	};
	globals.XMLSerializer = class {
		serializeToString(node: FakeElement) {
			serialized = node.toString();
			return serialized;
		}
	};
	globals.Blob = class {
		constructor(public parts: string[]) {}
	};
	globals.URL = { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} };
};

describe('generateSvgUrl', () => {
	test('leaves split seams out of the exported SVG when a split is placed', () => {
		const root = buildPatternSvg({ interactive: false });
		install(root);

		generateSvgUrl('pattern-svg');

		expect(serialized).not.toContain('split-target');
		expect(serialized).not.toContain('hairline');
		// The band itself must still be there — this is the cut geometry.
		expect(serialized).toContain('band-outline');
	});

	test('leaves the click targets out of the exported SVG while split mode is on', () => {
		const root = buildPatternSvg({ interactive: true });
		install(root);

		generateSvgUrl('pattern-svg');

		expect(serialized).not.toContain('split-target');
		expect(serialized).not.toContain('hairline');
		expect(serialized).not.toContain('role="button"');
		expect(serialized).not.toContain('tabindex');
		expect(serialized).toContain('band-outline');
	});

	test('strips the pattern quads, as it always has', () => {
		const root = buildPatternSvg({ interactive: false });
		install(root);

		generateSvgUrl('pattern-svg');

		expect(serialized).not.toContain('svg-pattern-quad');
	});

	test('does not mutate the live document', () => {
		const root = buildPatternSvg({ interactive: true });
		install(root);

		generateSvgUrl('pattern-svg');

		// Export is a read: the on-screen split targets are Svelte-owned nodes and
		// ripping them out of the live tree would leave the placing UI dead until
		// the next full re-render.
		const live = root.toString();
		expect(live).toContain('split-target');
		expect(live).toContain('svg-pattern-quad');
	});
});
