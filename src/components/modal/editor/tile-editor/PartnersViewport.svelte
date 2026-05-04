<!-- src/components/modal/editor/tile-editor/PartnersViewport.svelte -->
<script lang="ts">
	import type { PathSegment, Quadrilateral } from '$lib/types';
	import type { IndexPair } from '$lib/patterns/spec-types';
	import { svgPathStringFromSegments } from '$lib/patterns/utils';
	import type { Vertex } from '../segment-vertices';
	import { computeVerticesFromFlatPath } from '../segment-vertices';
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

	const ROLE_FILL: Record<PartnerRole | 'base', string> = {
		base: 'rgba(80, 130, 200, 0.1)',
		top: 'rgba(180, 140, 80, 0.1)',
		bottom: 'rgba(180, 140, 80, 0.1)',
		left: 'rgba(120, 120, 120, 0.1)',
		right: 'rgba(120, 120, 120, 0.1)'
	};
	const ROLE_FILL_CROSS_TUBE_TOP = 'rgba(0, 200, 0, 0.1)';
	const ROLE_FILL_CROSS_TUBE_BOTTOM = 'rgba(220, 0, 0, 0.1)';

	const fillFor = (
		role: PartnerRole | 'base',
		partner: ResolvedPartner | null
	): string => {
		if (role === 'base') return ROLE_FILL.base;
		if (partner?.ruleSet === 'partner.endEnd') return ROLE_FILL_CROSS_TUBE_TOP;
		if (partner?.ruleSet === 'partner.startEnd') return ROLE_FILL_CROSS_TUBE_BOTTOM;
		return ROLE_FILL[role];
	};

	const ORIGINAL_STROKE: Record<PartnerRole | 'base', string> = {
		base: 'rgba(40, 70, 130, 0.3)',
		top: 'rgba(120, 80, 30, 0.3)',
		bottom: 'rgba(120, 80, 30, 0.3)',
		left: 'rgba(60, 60, 60, 0.3)',
		right: 'rgba(60, 60, 60, 0.3)'
	};
	const ORIGINAL_STROKE_CROSS_TUBE_TOP = 'rgba(0, 90, 0, 0.3)';
	const ORIGINAL_STROKE_CROSS_TUBE_BOTTOM = 'rgba(90, 0, 0, 0.3)';

	const originalStrokeFor = (
		role: PartnerRole | 'base',
		partner: ResolvedPartner | null
	): string => {
		if (role === 'base') return ORIGINAL_STROKE.base;
		if (partner?.ruleSet === 'partner.endEnd') return ORIGINAL_STROKE_CROSS_TUBE_TOP;
		if (partner?.ruleSet === 'partner.startEnd') return ORIGINAL_STROKE_CROSS_TUBE_BOTTOM;
		return ORIGINAL_STROKE[role];
	};

	const partnersList = $derived(
		[tTop, tBottom, tLeft, tRight].filter((p): p is NonNullable<typeof tTop> => p !== null)
	);

	const baseVertices = $derived(computeVerticesFromFlatPath(tBasePath));
	const partnerVertices = $derived(
		new Map(partnersList.map((p) => [p.role, computeVerticesFromFlatPath(p.path)]))
	);

	let selectedConnection: {
		partnerRole: PartnerRole;
		baseVertex: Vertex;
		partnerVertex: Vertex;
	} | null = $state(null);

	const findVertexAtFlatIndex = (vs: Vertex[], idx: number): Vertex | undefined =>
		vs.find((v) => v.refs.some((r) => r.index === idx));

	type ConnectionLine = {
		partner: ResolvedPartner;
		baseVertex: Vertex;
		partnerVertex: Vertex;
		x1: number;
		y1: number;
		x2: number;
		y2: number;
	};

	const connectionsFor = (rules: IndexPair[], partner: ResolvedPartner | null): ConnectionLine[] => {
		if (!partner) return [];
		const pVerts = partnerVertices.get(partner.role) ?? [];
		const out: ConnectionLine[] = [];
		for (const rule of rules) {
			const t = tBasePath[rule.target];
			const s = partner.path[rule.source];
			if (!t || !s) continue;
			const tx = (t as any)[1];
			const ty = (t as any)[2];
			const sx = (s as any)[1];
			const sy = (s as any)[2];
			if (typeof tx !== 'number' || typeof sx !== 'number') continue;
			const baseV = findVertexAtFlatIndex(baseVertices, rule.target);
			const partnerV = findVertexAtFlatIndex(pVerts, rule.source);
			if (!baseV || !partnerV) continue;
			out.push({ partner, baseVertex: baseV, partnerVertex: partnerV, x1: tx, y1: ty, x2: sx, y2: sy });
		}
		return out;
	};

	const allConnections = $derived.by(() => {
		const out: ConnectionLine[] = [];
		if (tTop) out.push(...connectionsFor(tTop.ruleSet === 'withinBand' ? withinBand : partnerEndEnd, tTop));
		if (tBottom) out.push(...connectionsFor(tBottom.ruleSet === 'withinBand' ? withinBand : partnerStartEnd, tBottom));
		if (tLeft) out.push(...connectionsFor(acrossBands, tLeft));
		if (tRight) out.push(...connectionsFor(acrossBands, tRight));
		return out;
	});

	let selectedBaseVertex: Vertex | null = $state(null);

	const handleBaseVertexClick = (v: Vertex) => {
		if (selectedBaseVertex === v) {
			selectedBaseVertex = null;
		} else {
			selectedBaseVertex = v;
		}
	};

	const handlePartnerVertexClick = (partner: ResolvedPartner, v: Vertex) => {
		if (!selectedBaseVertex) return;
		onAddRule(partner, selectedBaseVertex, v);
		selectedBaseVertex = null;
	};

	const ROLE_LABEL_COLOR: Record<PartnerRole | 'base', string> = {
		base: 'rgb(80, 130, 200)',
		top: 'rgb(120, 80, 30)',
		bottom: 'rgb(120, 80, 30)',
		left: 'rgb(60, 60, 60)',
		right: 'rgb(60, 60, 60)'
	};
	const ROLE_LABEL_CROSS_TOP = 'rgb(0, 140, 0)';
	const ROLE_LABEL_CROSS_BOTTOM = 'rgb(180, 0, 0)';

	const labelColorFor = (
		role: PartnerRole | 'base',
		partner: ResolvedPartner | null
	): string => {
		if (role === 'base') return ROLE_LABEL_COLOR.base;
		if (partner?.ruleSet === 'partner.endEnd') return ROLE_LABEL_CROSS_TOP;
		if (partner?.ruleSet === 'partner.startEnd') return ROLE_LABEL_CROSS_BOTTOM;
		return ROLE_LABEL_COLOR[role];
	};

	const baseRuleTargetIndices = $derived.by(() => {
		const set = new Set<number>();
		for (const r of withinBand) set.add(r.target);
		for (const r of acrossBands) set.add(r.target);
		for (const r of partnerStartEnd) set.add(r.target);
		for (const r of partnerEndEnd) set.add(r.target);
		return set;
	});

	const partnerRuleSourceIndices = (partner: ResolvedPartner): Set<number> => {
		const rules =
			partner.ruleSet === 'withinBand'
				? withinBand
				: partner.ruleSet === 'acrossBands'
					? acrossBands
					: partner.ruleSet === 'partner.startEnd'
						? partnerStartEnd
						: partnerEndEnd;
		return new Set(rules.map((r) => r.source));
	};

	const baseLabeledVertices = $derived(
		baseVertices.filter((v) =>
			v.refs.some((r) => baseRuleTargetIndices.has(r.index))
		)
	);

	let tooltip: {
		x: number;
		y: number;
		indices: number[];
		color: string;
	} | null = $state(null);

	const tooltipFor = (v: Vertex, color: string) => {
		const all = new Set<number>();
		for (const r of v.refs) all.add(r.index);
		tooltip = {
			x: v.x,
			y: v.y,
			indices: Array.from(all).sort((a, b) => a - b),
			color
		};
	};

	const clearTooltip = () => {
		tooltip = null;
	};

	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.key === 'Delete' || e.key === 'Backspace') && selectedConnection) {
				const partner = partnersList.find((p) => p.role === selectedConnection!.partnerRole);
				if (partner) {
					onDeleteConnection(partner, selectedConnection.baseVertex, selectedConnection.partnerVertex);
					selectedConnection = null;
				}
			}
			if (e.key === 'Escape') selectedConnection = null;
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<div class="container" style:width="{size.width}px" style:height="{size.height}px">
	<svg width={size.width} height={size.height} {viewBox} class="canvas">
		<polygon
			points="{tBaseQuad.a.x},{tBaseQuad.a.y} {tBaseQuad.b.x},{tBaseQuad.b.y} {tBaseQuad.c.x},{tBaseQuad.c.y} {tBaseQuad.d.x},{tBaseQuad.d.y}"
			style:fill={fillFor('base', null)}
			stroke="rgba(0,0,0,0.15)"
			stroke-width={0.2 * scale}
			stroke-dasharray="{0.5 * scale},{0.5 * scale}"
		/>
		{#each partnersList as p (p.role)}
			<polygon
				points="{p.quad.a.x},{p.quad.a.y} {p.quad.b.x},{p.quad.b.y} {p.quad.c.x},{p.quad.c.y} {p.quad.d.x},{p.quad.d.y}"
				style:fill={fillFor(p.role, p)}
				stroke="rgba(0,0,0,0.1)"
				stroke-width={0.2 * scale}
				stroke-dasharray="{0.5 * scale},{0.5 * scale}"
			/>
		{/each}

		{#if tBaseOriginal}
			<path
				d={svgPathStringFromSegments(tBaseOriginal)}
				fill="none"
				stroke={originalStrokeFor('base', null)}
				style:stroke-width="{0.4 * scale}"
			/>
		{/if}
		{#each partnersList as p (p.role + ':orig')}
			{#if p.originalPath}
				<path
					d={svgPathStringFromSegments(p.originalPath)}
					fill="none"
					stroke={originalStrokeFor(p.role, p)}
					style:stroke-width="{0.4 * scale}"
				/>
			{/if}
		{/each}

		<path
			d={svgPathStringFromSegments(tBasePath)}
			fill="none"
			stroke="black"
			style:stroke-width="{0.4 * scale}"
		/>
		{#each partnersList as p (p.role + ':path')}
			<path
				d={svgPathStringFromSegments(p.path)}
				fill="none"
				stroke="black"
				style:stroke-width="{0.4 * scale}"
			/>
		{/each}

		{#each allConnections as conn, i (i)}
			<line
				x1={conn.x1}
				y1={conn.y1}
				x2={conn.x2}
				y2={conn.y2}
				class="connection"
				class:selected={selectedConnection?.partnerRole === conn.partner.role &&
					selectedConnection?.baseVertex === conn.baseVertex &&
					selectedConnection?.partnerVertex === conn.partnerVertex}
				style:stroke-width="{0.3 * scale}"
				onclick={() =>
					(selectedConnection = {
						partnerRole: conn.partner.role,
						baseVertex: conn.baseVertex,
						partnerVertex: conn.partnerVertex
					})}
			/>
		{/each}

		{#each baseVertices as v (v.x + ':' + v.y + ':base')}
			<circle
				cx={v.x}
				cy={v.y}
				r={0.5 * scale}
				class="base-vertex"
				class:selected={selectedBaseVertex === v}
				style:stroke-width="{0.15 * scale}"
				onclick={() => handleBaseVertexClick(v)}
				onmouseenter={() => tooltipFor(v, labelColorFor('base', null))}
				onmouseleave={clearTooltip}
			/>
		{/each}
		{#each partnersList as p (p.role + ':vs')}
			{#each partnerVertices.get(p.role) ?? [] as v (v.x + ':' + v.y + ':' + p.role)}
				<circle
					cx={v.x}
					cy={v.y}
					r={0.5 * scale}
					class="partner-vertex"
					style:stroke-width="{0.15 * scale}"
					onclick={() => handlePartnerVertexClick(p, v)}
					onmouseenter={() => tooltipFor(v, labelColorFor(p.role, p))}
					onmouseleave={clearTooltip}
				/>
			{/each}
		{/each}

		{#each baseLabeledVertices as v (v.x + ':' + v.y + ':blbl')}
			<text
				x={v.x}
				y={v.y - 0.7 * scale}
				font-size={0.8 * scale}
				text-anchor="middle"
				dominant-baseline="text-after-edge"
				fill={labelColorFor('base', null)}
				pointer-events="none"
				style="user-select: none;"
			>
				{v.refs[0]?.index ?? ''}
			</text>
		{/each}
		{#each partnersList as p (p.role + ':lbl')}
			{@const sources = partnerRuleSourceIndices(p)}
			{@const verts = (partnerVertices.get(p.role) ?? []).filter((v) =>
				v.refs.some((r) => sources.has(r.index))
			)}
			{#each verts as v (v.x + ':' + v.y + ':' + p.role + ':lbl')}
				<text
					x={v.x}
					y={v.y + 0.7 * scale}
					font-size={0.8 * scale}
					text-anchor="middle"
					dominant-baseline="text-before-edge"
					fill={labelColorFor(p.role, p)}
					pointer-events="none"
					style="user-select: none;"
				>
					{v.refs[0]?.index ?? ''}
				</text>
			{/each}
		{/each}
	</svg>
	{#if tooltip}
		<div
			class="tooltip"
			style:left="{((tooltip.x + parseFloat(viewBox.split(' ')[2]) / 2) / parseFloat(viewBox.split(' ')[2])) * size.width + 8}px"
			style:top="{((tooltip.y + parseFloat(viewBox.split(' ')[3]) / 2) / parseFloat(viewBox.split(' ')[3])) * size.height + 8}px"
			style:border-left-color={tooltip.color}
		>
			{tooltip.indices.join(', ')}
		</div>
	{/if}
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
	.connection {
		stroke: rgba(0, 100, 200, 0.7);
		stroke-width: 0.3;
		cursor: pointer;
	}
	.connection:hover {
		stroke: rgba(0, 100, 200, 1);
	}
	.connection.selected {
		stroke: red;
	}
	.base-vertex {
		fill: white;
		stroke: rgb(80, 130, 200);
		cursor: pointer;
	}
	.base-vertex.selected {
		fill: orange;
	}
	.partner-vertex {
		fill: rgba(255, 255, 255, 0.6);
		stroke: rgba(0, 0, 0, 0.5);
		cursor: pointer;
	}
	.tooltip {
		position: absolute;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.3);
		border-left-width: 3px;
		padding: 2px 6px;
		font-size: 0.8em;
		pointer-events: none;
		white-space: nowrap;
	}
</style>
