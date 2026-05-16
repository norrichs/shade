<script lang="ts">
	import type { Point } from '$lib/types';
	import { onMount, tick } from 'svelte';

	export let outer: Point[];
	export let base: [Point, Point];
	export let text: string;
	export let padding: number;
	export let color: string = 'black';

	const DEFAULT_FONT_SIZE = 8;
	const MIN_FONT_SIZE = 1;

	let textEl: SVGTextElement | undefined;
	let fontSize = DEFAULT_FONT_SIZE;
	let centroid: Point = { x: 0, y: 0 };
	let angleRad = 0;
	let angleDeg = 0;
	let availW = 0;
	let availH = 0;
	let measured = false;

	const computeCentroid = (pts: Point[]): Point => {
		if (!pts.length) return { x: 0, y: 0 };
		let sx = 0;
		let sy = 0;
		for (const p of pts) {
			sx += p.x;
			sy += p.y;
		}
		return { x: sx / pts.length, y: sy / pts.length };
	};

	const computeLocalBbox = (
		pts: Point[],
		c: Point,
		theta: number
	): { w: number; h: number } => {
		const cos = Math.cos(-theta);
		const sin = Math.sin(-theta);
		let minX = Infinity;
		let maxX = -Infinity;
		let minY = Infinity;
		let maxY = -Infinity;
		for (const p of pts) {
			const dx = p.x - c.x;
			const dy = p.y - c.y;
			const rx = dx * cos - dy * sin;
			const ry = dx * sin + dy * cos;
			if (rx < minX) minX = rx;
			if (rx > maxX) maxX = rx;
			if (ry < minY) minY = ry;
			if (ry > maxY) maxY = ry;
		}
		return { w: maxX - minX, h: maxY - minY };
	};

	const recomputeGeometry = () => {
		centroid = computeCentroid(outer);
		angleRad = Math.atan2(base[1].y - base[0].y, base[1].x - base[0].x);
		angleDeg = (angleRad * 180) / Math.PI;
		const { w, h } = computeLocalBbox(outer, centroid, angleRad);
		availW = w * (1 - 2 * padding);
		availH = h * (1 - 2 * padding);
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
	};

	$: if (text && outer && base) {
		recomputeGeometry();
	}

	$: if (text && textEl && availW > 0 && availH > 0) {
		// Re-fit whenever inputs change after mount
		void fitFontSize();
	}

	onMount(() => {
		recomputeGeometry();
		void fitFontSize();
	});
</script>

{#if text && fontSize >= MIN_FONT_SIZE}
	<g transform="translate({centroid.x} {centroid.y}) rotate({angleDeg})">
		<text
			bind:this={textEl}
			text-anchor="middle"
			dominant-baseline="central"
			fill={color}
			font-size={fontSize}
			style="user-select: none; pointer-events: none;"
		>{text}</text>
	</g>
{/if}
