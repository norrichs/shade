/**
 * Rasterise one band's RAW pattern (no Prepare Download union) into a canvas
 * covering `bounds` in path space. Canvas `Path2D` takes the SVG `d` strings
 * as-is, so this is the whole "SVG → texture" step.
 *
 * Tiled: every facet path is stroked at its own `strokeWidth`, round caps and
 * joins — visually the stroke-expansion + union the cut file gets. The stroke is
 * the material; everything else is a hole, painted `holeColor` (translucent).
 * Outlined: the outline is filled solid and the procedural fill (holes) is
 * repainted in `holeColor`.
 */
import type { BandCutPattern } from '#lib/types.js';
import { svgPathStringFromSegments } from '#lib/patterns/utils.js';
import type { PatternBandMesh } from './band-uv-mesh';

export const MAX_TEXTURE_SIDE = 2048;

const dOf = (facet: BandCutPattern['facets'][number]) =>
	facet.svgPath || (facet.path.length ? svgPathStringFromSegments(facet.path) : '');

export const rasterizeBand = (
	band: BandCutPattern,
	bounds: PatternBandMesh['bounds'],
	{
		density,
		color,
		holeColor,
		outlined
	}: { density: number; color: string; holeColor: string; outlined: boolean }
): HTMLCanvasElement => {
	const scale = Math.min(density, MAX_TEXTURE_SIDE / Math.max(bounds.width, bounds.height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.ceil(bounds.width * scale));
	canvas.height = Math.max(1, Math.ceil(bounds.height * scale));
	const ctx = canvas.getContext('2d');
	if (!ctx) return canvas;
	// Map path space onto the canvas exactly as the UVs do (bounds → [0, size]).
	ctx.setTransform(
		canvas.width / bounds.width,
		0,
		0,
		canvas.height / bounds.height,
		(-bounds.minX * canvas.width) / bounds.width,
		(-bounds.minY * canvas.height) / bounds.height
	);
	ctx.fillStyle = color;
	ctx.strokeStyle = color;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';

	if (outlined) {
		const [outline, ...rest] = band.facets;
		const d = outline ? dOf(outline) : '';
		if (d) ctx.fill(new Path2D(d));
		// Holes: clear the material, then lay the hole colour in their place.
		ctx.fillStyle = holeColor;
		for (const facet of rest) {
			if (facet.quad) continue;
			const fd = dOf(facet);
			if (!fd) continue;
			const hole = new Path2D(fd);
			ctx.globalCompositeOperation = 'destination-out';
			ctx.fill(hole, 'evenodd');
			ctx.globalCompositeOperation = 'source-over';
			ctx.fill(hole, 'evenodd');
		}
		return canvas;
	}

	// Everything the strokes leave uncovered is a hole. Only the band's own
	// triangles are textured, so filling the whole box is safe.
	ctx.fillStyle = holeColor;
	ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);

	// Never thinner than a texel, or a stroke can vanish from the texture entirely.
	const minWidth = 1 / scale;
	for (const facet of band.facets) {
		const d = dOf(facet);
		if (!d) continue;
		ctx.lineWidth = Math.max(facet.strokeWidth ?? 1, minWidth);
		ctx.stroke(new Path2D(d));
	}
	return canvas;
};
