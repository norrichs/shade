<script lang="ts">
	import { getPathSize, svgPathStringFromSegments, translatePS } from '$lib/patterns/utils';
	import type { PathSegment } from '$lib/types';
	import type { Point } from 'bezier-js';
	import { tick } from 'svelte';
	import { numberPathSegments } from './number-path-segments';
	import { onMount } from 'svelte';
	import LabelText from './LabelText.svelte';
	import {
		buildLabelOutlinePath,
		FALLBACK_TEXT_WIDTH,
		FALLBACK_TEXT_HEIGHT
	} from '$lib/cut-pattern/label-outline-path';
	import { dropLabelText, layerStrokes, mergedBandPaths, setLabelTextDimension } from '$lib/stores';

	let {
		id = undefined,
		bandId = undefined,
		value,
		addressStrings = undefined,
		radius = 10,
		height = 14,
		angle = 0,
		autoAngle = undefined,
		anchor = { x: 0, y: 0 },
		padding = 10,
		stemLength = 20,
		stemWidth = 4
	}: {
		id?: string | undefined;
		bandId?: string | undefined;
		value: number;
		addressStrings?: string[] | undefined;
		radius?: number;
		height?: number;
		angle?: number;
		autoAngle?: number | undefined;
		anchor?: Point;
		padding?: number;
		stemLength?: number;
		stemWidth?: number;
	} = $props();

	// Bbox of the rendered LabelText (the addressStrings) — measured via
	// getBBox() on the wrapping <g>. Width/height feed into the outline
	// path so the callout body sizes to the actual rendered text + padding.
	// `x`/`y` capture the bbox origin in the LabelText's local coord space so
	// we can offset the LabelText to center it inside the path body.
	let textBbox: { x: number; y: number; width: number; height: number } = $state({
		x: 0,
		y: 0,
		width: FALLBACK_TEXT_WIDTH,
		height: FALLBACK_TEXT_HEIGHT
	});
	let textMeasured = $state(false);

	// LabelText element bound here so we can re-measure when its children mount.
	let labelTextElement: SVGGElement | undefined = $state();
	// Hidden measurement <g>: a mirror of the LabelText whose position is never
	// affected by the centering transform applied to the visible copy, so bbox
	// readings stay stable across re-measures.
	let measurementHost: SVGGElement | undefined = $state();
	let measurementText: SVGGElement | undefined = $state();

	const measureText = async () => {
		if (!addressStrings || addressStrings.length === 0) {
			textMeasured = true;
			return;
		}
		await tick();
		// Prefer the bbox of the hidden measurement render — its position is
		// always stable and it always exists when addressStrings is set.
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

	$effect(() => {
		if (textMeasured && bandId) {
			// Read textBbox synchronously so Svelte tracks it as a dep — without
			// this, the effect would only fire once when textMeasured flips true
			// (often with a stale 0-size bbox) and never refresh.
			const width = textBbox.width;
			const height = textBbox.height;
			// Batched: N labels measuring after one mount used to mean N store
			// updates, each re-laying-out every band (see mergedPathStore).
			setLabelTextDimension(bandId, { width, height });
		}
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
		const labelOutlinePathSegments: PathSegment[] = buildLabelOutlinePath({
			measuredWidth: width,
			measuredHeight: height,
			radius: r,
			padding,
			stemLength,
			stemWidth
		});

		return [
			...labelOutlinePathSegments,
			...(addressStrings ? [] : translatePS(labelTextPathSegments, 20 - halfWidth, 15 + stemLength))
		];
	};

	onMount(() => {
		// Trigger an initial measurement after mount — measurement nodes are
		// in the DOM at this point.
		void measureText();
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

	// When `autoAngle` is provided (outlined bands), `angle` is interpreted as
	// a relative offset added to it. For tiled bands and any legacy caller,
	// `autoAngle` is undefined and `angle` keeps its previous absolute-rotation
	// behavior.
	let effectiveAngle = $derived(angle + (autoAngle ?? 0));
	let effectiveAngleDeg = $derived((effectiveAngle * 180) / Math.PI);

	// Stem-width/2 shift: the path-space stem has its two long sides at internal
	// x = ±stemWidth/2. We want the +x side to land exactly on `anchor` (so one
	// long side passes through M and the other is offset by stemWidth along the
	// edge direction). The wrapper translate must therefore be shifted by
	// −R(θ) · (stemWidth/2, 0) where θ is the effective angle. Only apply this
	// when autoAngle is defined; otherwise preserve the legacy "anchor = stem
	// tip center" behavior.
	let renderAnchor = $derived(
		autoAngle === undefined
			? anchor
			: {
					x: anchor.x - (stemWidth / 2) * Math.cos(effectiveAngle),
					y: anchor.y - (stemWidth / 2) * Math.sin(effectiveAngle)
				}
	);

	// Wrapper transform: position the path-space origin at `renderAnchor`, then
	// rotate around it. The label renders inside its band's <g>, which already
	// carries the band transform, so nothing is prepended here.
	let wrapperTransform = $derived(
		`translate(${renderAnchor.x} ${renderAnchor.y}) rotate(${effectiveAngleDeg})`
	);
</script>

<!--
	Hidden measurement render: the LabelText is mirrored into a non-visible <g>
	so getBBox() can read its dimensions without the centering transform the
	visible copy carries. Only its bbox is consumed — it is `screen-only` so the
	exporter strips it, since its glyph paths are real <path> data a cutter
	would otherwise trace.
-->
{#if addressStrings && addressStrings.length > 0}
	<g
		class="screen-only"
		bind:this={measurementHost}
		style="visibility: hidden; pointer-events: none;"
		aria-hidden="true"
	>
		<LabelText
			lines={addressStrings}
			anchor={{ x: 0, y: 0 }}
			size={height}
			bind:element={measurementText}
		/>
	</g>
{/if}

<!--
	The label renders in flow, inside its band's <g>, so the export groups a
	band's cut paths and the text naming it as one piece.
-->
<g
	id={`band-label${id ? `-${id}` : ''}`}
	transform={wrapperTransform}
	style="visibility: {visible ? 'visible' : 'hidden'};"
>
	{#if !bandId || !$mergedBandPaths.has(bandId)}
		<path
			d={path}
			fill-rule="evenodd"
			fill="none"
			stroke={$layerStrokes['pattern-outline']}
			stroke-width="1"
			vector-effect="non-scaling-stroke"
			data-geometry="pattern-outline"
		/>
	{/if}
	<!-- Post-process can drop the text from prepared bands; the hidden
	     measurement copy above stays, so the tag outline keeps its size. -->
	{#if !($dropLabelText && bandId && $mergedBandPaths.has(bandId))}
		<g transform={`translate(${textTranslate.x} ${textTranslate.y})`}>
			<LabelText
				lines={addressStrings}
				anchor={{ x: 0, y: 0 }}
				size={height}
				bind:element={labelTextElement}
			/>
		</g>
	{/if}
</g>
