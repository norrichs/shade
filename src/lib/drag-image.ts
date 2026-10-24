/**
 * The drag image for every `asDraggable` in the app — pass it as `Dummy`.
 *
 * The library's own `Dummy: 'none'` appends a 1px `position:absolute` div to
 * `<body>` on each dragstart. With no top/left it sits at its static position,
 * after the full-height layout, i.e. just below the viewport. Chrome on macOS
 * refuses to start a native drag whose image is off-screen: `dragend` follows
 * `dragstart` within a few ms and no `drag` events fire, so the point never moves.
 * Appending and removing it also reflows the page, which showed as a jitter.
 *
 * This one is fixed to the viewport's top-left (always on-screen, out of flow),
 * nearly transparent, and created once and kept, so dragging never touches layout.
 */
let dragImage: HTMLElement | undefined;

export const transparentDragImage = (doc: Document = document): HTMLElement => {
	if (!dragImage || !dragImage.isConnected) {
		dragImage = doc.createElement('div');
		dragImage.setAttribute('aria-hidden', 'true');
		dragImage.setAttribute(
			'style',
			'position:fixed; left:0; top:0; width:1px; height:1px; pointer-events:none; opacity:0.01'
		);
		doc.body.appendChild(dragImage);
	}
	return dragImage;
};
