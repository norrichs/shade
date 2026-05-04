<!-- src/components/modal/editor/tile-editor/PartnersViewport.svelte -->
<script lang="ts">
	import type { PathSegment, Quadrilateral } from '$lib/types';
	import type { IndexPair } from '$lib/patterns/spec-types';
	import { svgPathStringFromSegments } from '$lib/patterns/utils';
	import type { Vertex } from '../segment-vertices';
	import type { PartnerBundle, PartnerRole, ResolvedPartner } from './partner-neighbors';

	export type PartnerSelection = {
		role: PartnerRole | 'base';
		vertex: Vertex;
	};

	let {
		bundle,
		withinBand,
		acrossBands,
		partnerStartEnd,
		partnerEndEnd,
		size = { width: 800, height: 500 },
		onAddRule,
		onDeleteConnection
	}: {
		bundle: PartnerBundle;
		withinBand: IndexPair[];
		acrossBands: IndexPair[];
		partnerStartEnd: IndexPair[];
		partnerEndEnd: IndexPair[];
		size?: { width: number; height: number };
		onAddRule: (partner: ResolvedPartner, baseVertex: Vertex, partnerVertex: Vertex) => void;
		onDeleteConnection: (
			partner: ResolvedPartner,
			baseVertex: Vertex,
			partnerVertex: Vertex
		) => void;
	} = $props();

	type Pt = { x: number; y: number };

	// Stage 2 viewport transform: rotate so base.d→c is along +x, translate so bbox center is origin.
	const viewportTransform = $derived.by(() => {
		const q = bundle.base.quad;
		const angle = Math.atan2(q.c.y - q.d.y, q.c.x - q.d.x);
		const cos = Math.cos(-angle);
		const sin = Math.sin(-angle);

		const partners = [bundle.top, bundle.bottom, bundle.left, bundle.right].filter(
			(p): p is ResolvedPartner => p !== null
		);
		const corners: Pt[] = [];
		const rotateOnly = (p: Pt): Pt => ({ x: cos * p.x - sin * p.y, y: sin * p.x + cos * p.y });
		for (const c of [q.a, q.b, q.c, q.d] as Pt[]) corners.push(rotateOnly(c));
		for (const p of partners) {
			for (const c of [p.quad.a, p.quad.b, p.quad.c, p.quad.d] as unknown as Pt[]) {
				corners.push(rotateOnly(c));
			}
		}
		const xs = corners.map((c) => c.x);
		const ys = corners.map((c) => c.y);
		const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
		const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
		return { cos, sin, tx: -cx, ty: -cy };
	});

	const tp = (x: number, y: number): Pt => {
		const { cos, sin, tx, ty } = viewportTransform;
		return { x: cos * x - sin * y + tx, y: sin * x + cos * y + ty };
	};

	const transformPath = (path: PathSegment[]): PathSegment[] =>
		path.map((seg) => {
			if (seg[0] === 'M' || seg[0] === 'L') {
				const p = tp(seg[1] as number, seg[2] as number);
				return [seg[0], p.x, p.y] as PathSegment;
			}
			return seg;
		});

	const transformQuad = (q: Quadrilateral): Quadrilateral =>
		({
			a: { ...tp(q.a.x, q.a.y), z: q.a.z },
			b: { ...tp(q.b.x, q.b.y), z: q.b.z },
			c: { ...tp(q.c.x, q.c.y), z: q.c.z },
			d: { ...tp(q.d.x, q.d.y), z: q.d.z }
		}) as unknown as Quadrilateral;

	const tBaseQuad = $derived(transformQuad(bundle.base.quad));
	const tBasePath = $derived(transformPath(bundle.base.path));
	const tBaseOriginal = $derived(
		bundle.base.originalPath ? transformPath(bundle.base.originalPath) : null
	);

	const tPartner = (p: ResolvedPartner | null) =>
		p
			? {
					...p,
					quad: transformQuad(p.quad),
					path: transformPath(p.path),
					originalPath: p.originalPath ? transformPath(p.originalPath) : undefined
				}
			: null;

	const tTop = $derived(tPartner(bundle.top));
	const tBottom = $derived(tPartner(bundle.bottom));
	const tLeft = $derived(tPartner(bundle.left));
	const tRight = $derived(tPartner(bundle.right));

	const viewBox = $derived.by(() => {
		const partners = [tTop, tBottom, tLeft, tRight].filter((p) => p !== null);
		const corners: Pt[] = [tBaseQuad.a, tBaseQuad.b, tBaseQuad.c, tBaseQuad.d] as any;
		for (const p of partners) {
			corners.push(p!.quad.a, p!.quad.b, p!.quad.c, p!.quad.d);
		}
		const xs = corners.map((c) => c.x);
		const ys = corners.map((c) => c.y);
		const padding = 4;
		const halfW = Math.max(Math.abs(Math.min(...xs)), Math.abs(Math.max(...xs))) + padding;
		const halfH = Math.max(Math.abs(Math.min(...ys)), Math.abs(Math.max(...ys))) + padding;
		return `${-halfW} ${-halfH} ${halfW * 2} ${halfH * 2}`;
	});

	// Stroke / font scale relative to a 42-unit reference (matches unit-mode look).
	const scale = $derived.by(() => {
		const xs = [tBaseQuad.a.x, tBaseQuad.b.x, tBaseQuad.c.x, tBaseQuad.d.x];
		const ys = [tBaseQuad.a.y, tBaseQuad.b.y, tBaseQuad.c.y, tBaseQuad.d.y];
		const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
		return Math.max(span / 42, 0.5);
	});
</script>

<div class="container" style:width="{size.width}px" style:height="{size.height}px">
	<svg width={size.width} height={size.height} {viewBox} class="canvas">
		<!-- placeholder; quads, paths, vertices added in subsequent tasks -->
	</svg>
</div>

<style>
	.container {
		border: 1px dotted black;
		padding: 0;
		position: relative;
		box-sizing: content-box;
		flex: none;
	}
	.canvas {
		background-color: beige;
		display: block;
	}
</style>
