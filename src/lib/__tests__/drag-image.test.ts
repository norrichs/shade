import { transparentDragImage } from '../drag-image';

/** Just enough of a Document for the helper; the test env has no DOM. */
const fakeDocument = () => {
	const children: { isConnected: boolean; attrs: Record<string, string> }[] = [];
	const doc = {
		createElement: () => {
			const attrs: Record<string, string> = {};
			return { isConnected: false, attrs, setAttribute: (k: string, v: string) => (attrs[k] = v) };
		},
		body: {
			appendChild: (el: { isConnected: boolean; attrs: Record<string, string> }) => {
				el.isConnected = true;
				children.push(el);
			}
		}
	};
	return { doc: doc as unknown as Document, children };
};

describe('transparentDragImage', () => {
	it('is fixed to the top-left of the viewport, so the drag image is never off-screen', () => {
		const { doc } = fakeDocument();
		const image = transparentDragImage(doc) as unknown as { attrs: Record<string, string> };
		expect(image.attrs.style).toContain('position:fixed');
		expect(image.attrs.style).toContain('left:0');
		expect(image.attrs.style).toContain('top:0');
	});

	it('is created once and reused, so drags never add or remove body children', () => {
		const { doc, children } = fakeDocument();
		const first = transparentDragImage(doc);
		expect(transparentDragImage(doc)).toBe(first);
		expect(children.length).toBeLessThanOrEqual(1);
	});

	it('is recreated if something removed it from the document', () => {
		const { doc } = fakeDocument();
		const first = transparentDragImage(doc) as unknown as { isConnected: boolean };
		first.isConnected = false;
		expect(transparentDragImage(doc)).not.toBe(first);
	});
});
