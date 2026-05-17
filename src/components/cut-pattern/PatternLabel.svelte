<script lang="ts">
	import { getPathSize, svgPathStringFromSegments, translatePS } from '$lib/patterns/utils';
	import type { PathSegment } from '$lib/types';
	import type { Point } from 'bezier-js';
	import { tick } from 'svelte';
	import { numberPathSegments } from './number-path-segments';
	import { onDestroy, onMount } from 'svelte';
	import { LABEL_TAG_PORTAL_ID } from './constants';
	import LabelText from './LabelText.svelte';

	let {
		id = undefined,
		color = 'black',
		value,
		addressStrings = undefined,
		radius = 10,
		height = 14,
		angle = 0,
		anchor = { x: 0, y: 0 },
		padding = 10,
		stemLength = 20,
		stemWidth = 4,
		portal = undefined
	}: {
		id?: string | undefined;
		color?: string;
		value: number;
		addressStrings?: string[] | undefined;
		radius?: number;
		height?: number;
		angle?: number;
		anchor?: Point;
		padding?: number;
		stemLength?: number;
		stemWidth?: number;
		portal?: { transform: string } | undefined;
	} = $props();

	// Default body dimensions used (a) for the numeric/non-addressStrings branch
	// (computed from rendered glyph paths via getPathSize) and (b) as a fallback
	// for the addressStrings branch on the very first render before the SvgText
	// bbox has been measured. The addressStrings branch keeps visibility hidden
	// until measurement completes to avoid a flash at the fallback size.
	const FALLBACK_WIDTH = 350;
	const FALLBACK_HEIGHT = 280;

	// Bbox of the rendered LabelText (the addressStrings) — measured via
	// getBBox() on the wrapping <g>. Width/height feed into the outline
	// path so the callout body sizes to the actual rendered text + padding.
	// `x`/`y` capture the bbox origin in the LabelText's local coord space so
	// we can offset the LabelText to center it inside the path body.
	let textBbox: { x: number; y: number; width: number; height: number } = $state({
		x: 0,
		y: 0,
		width: FALLBACK_WIDTH,
		height: FALLBACK_HEIGHT
	});
	let textMeasured = $state(false);

	// LabelText element bound here so we can re-measure when its children mount.
	let labelTextElement: SVGGElement | undefined = $state();
	// Hidden measurement <g> for the in-flow render path. When `portal` is in
	// use the LabelText is detached on mount, so we mirror the LabelText into
	// this hidden measurement node to keep bbox readings stable.
	let measurementHost: SVGGElement | undefined = $state();
	let measurementText: SVGGElement | undefined = $state();

	const measureText = async () => {
		if (!addressStrings || addressStrings.length === 0) {
			textMeasured = true;
			return;
		}
		await tick();
		// Prefer the bbox of the hidden measurement render — its position is
		// always stable (sibling of this component, not relocated into a
		// portal) and it always exists when addressStrings is set.
		const target = measurementText ?? labelTextElement;
		if (!target) return;
		try {
			const b = target.getBBox();
			if (b.width === 0 || b.height === 0) {
				// Glyph paths not yet realized — leave fallback in place but mark
				// as measured so the path becomes visible.
				textMeasured = true;
				return;
			}
			textBbox = { x: b.x, y: b.y, width: b.width, height: b.height };
			textMeasured = true;
		} catch {
			textMeasured = true;
		}
	};

	$effect(() => {
		// Re-measure whenever inputs that affect rendered text geometry change.
		void addressStrings;
		void measurementText;
		void labelTextElement;
		void measureText();
	});

	const getLabelPathSegments = ({
		value,
		r,
		addressStrings,
		measuredWidth,
		measuredHeight,
		padding,
		stemLength,
		stemWidth
	}: {
		value: number;
		r: number;
		addressStrings: string[] | undefined;
		measuredWidth: number;
		measuredHeight: number;
		padding: number;
		stemLength: number;
		stemWidth: number;
	}) => {
		const labelTextPathSegments = `${value}`
			.split('')
			.map((digit, i) => {
				return translatePS(numberPathSegments[Number.parseInt(digit, 10)], 60 * i, 0);
			})
			.flat(1);

		const { width, height } = addressStrings
			? { width: measuredWidth, height: measuredHeight }
			: getPathSize(labelTextPathSegments);

		const halfWidth = (width + padding * 2) / 2;
		const bodyHeight = height + padding * 2;
		const labelOutlinePathSegments: PathSegment[] = [
			['M', 0, 0],
			['L', stemWidth / 2, 0],
			['L', stemWidth / 2, stemLength],
			['L', halfWidth - r, stemLength],
			['Q', halfWidth, stemLength, halfWidth, r + stemLength],
			['L', halfWidth, stemLength + bodyHeight - r],
			['Q', halfWidth, bodyHeight + stemLength, halfWidth - r, bodyHeight + stemLength],
			['L', r - halfWidth, bodyHeight + stemLength],
			['Q', -halfWidth, bodyHeight + stemLength, -halfWidth, bodyHeight - r + stemLength],
			['L', -halfWidth, r + stemLength],
			['Q', -halfWidth, stemLength, r - halfWidth, stemLength],
			['L', -stemWidth / 2, stemLength],
			['L', -stemWidth / 2, stemLength],
			['L', -stemWidth / 2, 0],
			['Z']
		];

		return [
			...labelOutlinePathSegments,
			...(addressStrings ? [] : translatePS(labelTextPathSegments, 20 - halfWidth, 15 + stemLength))
		];
	};

	let tagElement: SVGGElement;
	let textElement: SVGGElement;

	// Snapshots captured at portal-mount time. The live bindings above can be
	// reset by the time onDestroy fires (LabelText resets its `$bindable`
	// element on unmount, and Svelte may already have torn things down). The
	// snapshots give us stable handles for the elements we relocated so we can
	// remove them and any children they own (e.g. SvgText glyphs inside the
	// LabelText <g>) in lock step with this component's destruction.
	let portaledTag: SVGElement | undefined;

	onMount(() => {
		if (portal) {
			// Both the path outline and the LabelText now share a single <g>
			// wrapper (`tagElement`) so they translate + rotate as a unit. The
			// dedicated text portal is no longer needed — we send the whole
			// wrapper to the tag portal.
			const lableTagContainer = document.getElementById(LABEL_TAG_PORTAL_ID);
			if (lableTagContainer && tagElement) {
				lableTagContainer.appendChild(tagElement);
				portaledTag = tagElement;
			}
		}
		// Trigger an initial measurement after mount — measurement nodes are
		// in the DOM at this point.
		void measureText();
	});

	onDestroy(() => {
		// Elements were moved into the portal containers via appendChild on mount,
		// so they are no longer cleaned up automatically when this component is
		// destroyed. Remove the snapshot (and via DOM tree-removal, every child
		// rendered inside it — including the SvgText glyphs LabelText renders)
		// to avoid stale labels persisting after toggles or pattern range changes.
		(portaledTag ?? tagElement)?.remove();
		// Remove the measurement host if it was mounted (it lives in the SVG
		// tree as a sibling and is not portalled, but be explicit for safety).
		measurementHost?.remove();
	});

	// Path is now produced purely in path-space (origin at stem tip = (0,0)).
	// Translation + rotation are applied via the wrapping <g> transform so the
	// outline and the LabelText share a single rotational frame.
	let path = $derived(
		svgPathStringFromSegments(
			getLabelPathSegments({
				value,
				r: radius,
				addressStrings,
				measuredWidth: textBbox.width,
				measuredHeight: textBbox.height,
				padding,
				stemLength,
				stemWidth
			})
		)
	);

	// Visibility: keep the outline hidden until we've measured the text so we
	// don't flash at the fallback size. The numeric/non-addressStrings branch
	// derives dimensions synchronously from glyph paths, so it's always
	// considered measured.
	let visible = $derived(!addressStrings || textMeasured);

	// Body center in path-space — the LabelText should be centered on this point.
	let bodyCenter = $derived({
		x: 0,
		y: stemLength + (textBbox.height + padding * 2) / 2
	});

	// Offset to apply to the LabelText so that the center of its bbox lands at
	// `bodyCenter` (path-space). We translate the LabelText <g> by
	// (bodyCenter - bboxCenter) where bboxCenter = (bbox.x + bbox.w/2,
	// bbox.y + bbox.h/2) — the bbox is measured in the LabelText's local
	// coordinate space (anchor (0,0)).
	let textTranslate = $derived({
		x: bodyCenter.x - (textBbox.x + textBbox.width / 2),
		y: bodyCenter.y - (textBbox.y + textBbox.height / 2)
	});

	// Convert radians to degrees for SVG transform.
	let angleDeg = $derived((angle * 180) / Math.PI);

	// Wrapper transform: position the path-space origin at `anchor`, then
	// rotate around it. For the portal branch, prepend the portal transform
	// so the portal positioning still applies but the rotation is local to
	// the label coords.
	let wrapperTransform = $derived(
		portal
			? `${portal.transform} translate(${anchor.x} ${anchor.y}) rotate(${angleDeg})`
			: `translate(${anchor.x} ${anchor.y}) rotate(${angleDeg})`
	);
</script>

<!--
	Hidden measurement render: we always render the LabelText into a
	non-visible <g> so getBBox() can read its dimensions, regardless of
	whether the visible LabelText below is later portalled into another
	container. The host is positioned at (0,0) and not displayed — only its
	bbox is consumed.
-->
{#if addressStrings && addressStrings.length > 0}
	<g
		bind:this={measurementHost}
		style="visibility: hidden; pointer-events: none;"
		aria-hidden="true"
	>
		<LabelText lines={addressStrings} anchor={{ x: 0, y: 0 }} size={height} bind:element={measurementText} />
	</g>
{/if}

{#if portal}
	<g
		id={`band-label${id ? `-${id}` : ''}`}
		bind:this={tagElement}
		transform={wrapperTransform}
		style="visibility: {visible ? 'visible' : 'hidden'};"
	>
		<path d={path} fill-rule="evenodd" stroke={color} fill="none" />
		<g transform={`translate(${textTranslate.x} ${textTranslate.y})`}>
			<LabelText
				lines={addressStrings}
				anchor={{ x: 0, y: 0 }}
				size={height}
				bind:element={textElement}
			/>
		</g>
	</g>
{:else}
	<g
		id={`band-label${id ? `-${id}` : ''}`}
		transform={wrapperTransform}
		style="visibility: {visible ? 'visible' : 'hidden'};"
	>
		<path d={path} fill-rule="evenodd" fill="none" stroke={color} />
		<g transform={`translate(${textTranslate.x} ${textTranslate.y})`}>
			<LabelText
				lines={addressStrings}
				anchor={{ x: 0, y: 0 }}
				size={height}
				color="black"
				bind:element={labelTextElement}
			/>
		</g>
	</g>
{/if}
