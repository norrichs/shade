<script lang="ts">
	import type { Point } from '$lib/types';
	import { tick } from 'svelte';
	import SvgText from './SvgText/SvgText.svelte';

	export let outer: Point[];
	export let base: [Point, Point];
	export let text: string;
	export let padding: number;
	export let color: string = 'black';

	const DEFAULT_FONT_SIZE = 8;
	const MIN_FONT_SIZE = 1;

	// SvgText renders character paths under its own transform. We wrap it in a
	// <g> so we can measure the rendered geometry via getBBox() and drive the
	// same font-fit behavior the old <text>-based implementation had.
	let textEl: SVGGElement | undefined;
	let fontSize = DEFAULT_FONT_SIZE;
	let center: Point = { x: 0, y: 0 };
	let angleRad = 0;
	let angleDeg = 0;
	let availW = 0;
	let availH = 0;
	let measured = false;
	// Corrective translation derived from the actual rendered text bbox so the
	// glyphs' geometric center lands on local (0,0). The font's character cell
	// isn't symmetric around 0.5 (glyphs occupy roughly y ∈ [0.05, 0.75]), so
	// SvgText's `offset: 'center'` alone isn't enough.
	let textTranslate: { x: number; y: number } | undefined = undefined;

	const recomputeGeometry = () => {
		angleRad = Math.atan2(base[1].y - base[0].y, base[1].x - base[0].x);
		angleDeg = (angleRad * 180) / Math.PI;

		// Build the local frame around base[0]: x-axis along base direction,
		// y-axis perpendicular. Project every outer vertex into this frame so
		// the axis-aligned bbox represents the tab's true length × depth.
		const cos = Math.cos(-angleRad);
		const sin = Math.sin(-angleRad);
		let minX = Infinity;
		let maxX = -Infinity;
		let minY = Infinity;
		let maxY = -Infinity;
		for (const p of outer) {
			const dx = p.x - base[0].x;
			const dy = p.y - base[0].y;
			const rx = dx * cos - dy * sin;
			const ry = dx * sin + dy * cos;
			if (rx < minX) minX = rx;
			if (rx > maxX) maxX = rx;
			if (ry < minY) minY = ry;
			if (ry > maxY) maxY = ry;
		}

		const tabLength = maxX - minX;
		const tabDepth = maxY - minY;

		// Geometric center of the local-frame bbox (NOT the vertex centroid,
		// which gets biased toward dense regions on rounded tabs and drags the
		// label off-center toward the base). Rotate the local-frame midpoint
		// back into world coordinates so the <g transform> lands the label on
		// the tab's true geometric center.
		const midX = (minX + maxX) / 2;
		const midY = (minY + maxY) / 2;
		const worldCos = Math.cos(angleRad);
		const worldSin = Math.sin(angleRad);
		center = {
			x: base[0].x + midX * worldCos - midY * worldSin,
			y: base[0].y + midX * worldSin + midY * worldCos
		};

		// Padding is an absolute distance in the same units as tab geometry,
		// applied to BOTH sides of each axis. Clamp at 0 so an over-large
		// padding collapses the label rather than going negative.
		availW = Math.max(0, tabLength - 2 * padding);
		availH = Math.max(0, tabDepth - 2 * padding);
	};

	const fitFontSize = async () => {
		if (!text || !textEl) return;
		if (availW <= 0 || availH <= 0) {
			fontSize = 0;
			return;
		}
		// Initial candidate: bounded by available height
		fontSize = Math.max(MIN_FONT_SIZE, availH * 0.8);
		await tick();
		let bbox: DOMRect | undefined;
		try {
			bbox = textEl.getBBox();
		} catch {
			bbox = undefined;
		}
		if (!bbox || bbox.width === 0 || bbox.height === 0) {
			measured = true;
			return;
		}
		const scale = Math.min(availW / bbox.width, availH / bbox.height);
		fontSize = fontSize * scale;
		measured = true;
		// Re-measure after the scale change so the correction reflects the
		// final rendered text, not the pre-scale candidate. getBBox() ignores
		// the element's own transform, so applying textTranslate doesn't
		// invalidate this measurement on the next pass.
		await tick();
		try {
			const b = textEl.getBBox();
			textTranslate = { x: -(b.x + b.width / 2), y: -(b.y + b.height / 2) };
		} catch {
			textTranslate = undefined;
		}
	};

	$: if (text && outer && base && padding !== undefined) {
		recomputeGeometry();
	}

	// Re-fit whenever any input changes. The reads of availW/availH inside the
	// statement register them as reactive deps, so changing padding (which
	// recomputeGeometry feeds into availW/availH) re-runs the fit even when
	// the over-padded case collapses both to 0 — fitFontSize handles that by
	// setting fontSize = 0, ensuring the label is hidden instead of stuck at
	// its prior size.
	$: if (text && textEl) {
		void availW;
		void availH;
		void fitFontSize();
	}
</script>

{#if text && fontSize >= MIN_FONT_SIZE}
	<g
		transform="translate({center.x} {center.y}) rotate({angleDeg})"
		style="visibility: {measured ? 'visible' : 'hidden'};"
	>
		<g
			bind:this={textEl}
			transform={textTranslate ? `translate(${textTranslate.x} ${textTranslate.y})` : ''}
			style="pointer-events: none;"
		>
			<SvgText
				string={text}
				size={fontSize}
				{color}
				anchor={{ x: 0, y: 0 }}
				offset={{ x: 'center', y: 'center' }}
			/>
		</g>
	</g>
{/if}
