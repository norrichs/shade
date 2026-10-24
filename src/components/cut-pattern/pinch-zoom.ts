import { patternConfigStore } from '#lib/stores/index.js';
import { clampZoom, zoomAboutPoint } from '#lib/cut-pattern/pattern-view-navigation.js';

// Zoom change per unit of ctrl+wheel deltaY (trackpad pinch in Chrome/Firefox).
const WHEEL_ZOOM_RATE = 0.01;

type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number };

/** The pattern-space point under the cursor, via the inner pattern svg. */
const patternPointAt = (node: HTMLElement, clientX: number, clientY: number) => {
	const svg = node.querySelector<SVGSVGElement>('#pattern-svg');
	const ctm = svg?.getScreenCTM();
	if (!svg || !ctm) return undefined;
	const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
	return { x: p.x, y: p.y };
};

const zoomBy = (node: HTMLElement, deltaZoom: number, clientX: number, clientY: number) => {
	const anchor = patternPointAt(node, clientX, clientY);
	patternConfigStore.update((config) => {
		const view = config.patternViewConfig;
		const zoom = clampZoom(view.zoom + deltaZoom);
		if (anchor) view.centerOffset = zoomAboutPoint(view.centerOffset, anchor, zoom - view.zoom);
		view.zoom = zoom;
		return config;
	});
};

/**
 * Pinch to zoom the pattern view instead of the browser tab. Chrome and
 * Firefox report a trackpad pinch as a wheel event with `ctrlKey` set; Safari
 * fires its own `gesture*` events. Both need a non-passive listener so
 * `preventDefault` can stop the page zoom.
 */
export const pinchZoom = (node: HTMLElement) => {
	const onWheel = (ev: WheelEvent) => {
		if (!ev.ctrlKey) return;
		ev.preventDefault();
		zoomBy(node, -ev.deltaY * WHEEL_ZOOM_RATE, ev.clientX, ev.clientY);
	};

	let lastScale = 1;
	const onGestureStart = (ev: Event) => {
		ev.preventDefault();
		lastScale = 1;
	};
	const onGestureChange = (ev: Event) => {
		ev.preventDefault();
		const { scale, clientX, clientY } = ev as GestureEvent;
		zoomBy(node, Math.log10(scale / lastScale), clientX, clientY);
		lastScale = scale;
	};

	node.addEventListener('wheel', onWheel, { passive: false });
	node.addEventListener('gesturestart', onGestureStart);
	node.addEventListener('gesturechange', onGestureChange);
	return {
		destroy() {
			node.removeEventListener('wheel', onWheel);
			node.removeEventListener('gesturestart', onGestureStart);
			node.removeEventListener('gesturechange', onGestureChange);
		}
	};
};
