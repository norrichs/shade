<script lang="ts">
	import type { IndexPair, TiledPatternSpec } from '$lib/patterns/spec-types';
	import { svgPathStringFromSegments } from '$lib/patterns/utils';
	import { getCanvas, type PathEditorConfig } from '../path-editor-shared';
	import { computeVertices, computeVerticesFromFlatPath, type Vertex } from '../segment-vertices';
	import { computeConnections } from '../vertex-addressing';
	import { ghostSvgTransform, ghostTransform, type EditorMode } from './editor-mode';
	import { flatIndexes } from '../vertex-addressing';
	import type { ResolvedPair } from './partner-pair-resolver';
	import UnitLabels from './UnitLabels.svelte';

	let {
		spec,
		mode,
		rules,
		config,
		distortedGhost,
		selectedTarget,
		selectedConnection,
		onSelectTarget,
		onSelectGhost,
		onSelectConnection,
		onSelectConnectionLine
	}: {
		spec: TiledPatternSpec;
		mode: EditorMode;
		rules: IndexPair[];
		config: PathEditorConfig;
		distortedGhost: ResolvedPair | null;
		selectedTarget: Vertex | null;
		selectedConnection: { sourceVertex: Vertex; targetVertex: Vertex } | null;
		onSelectTarget: (vertex: Vertex) => void;
		onSelectGhost: (vertex: Vertex) => void;
		onSelectConnection: (sourceVertex: Vertex, targetVertex: Vertex) => void;
		onSelectConnectionLine: (conn: { sourceVertex: Vertex; targetVertex: Vertex } | null) => void;
	} = $props();

	const canv = $derived(getCanvas(config));
	const vertices = $derived(computeVertices(spec.unit));
	const allSegments = $derived([...spec.unit.start, ...spec.unit.middle, ...spec.unit.end]);
	const pathString = $derived(svgPathStringFromSegments(allSegments));
	const ghostTransformStr = $derived(ghostSvgTransform(mode, spec.unit));
	const connections = $derived(computeConnections(rules, spec.unit, vertices));
	const ghostPositions = $derived(
		vertices.map((v) => ({
			vertex: v,
			...ghostTransform(mode, spec.unit, { x: v.x, y: v.y })
		}))
	);

	const GHOST_LABEL_OFFSET = 0.7;
	const GHOST_FONT_SIZE = 0.8;

	const ghostCorners = $derived([
		{ label: 'a', ...ghostTransform(mode, spec.unit, { x: 0, y: spec.unit.height }) },
		{ label: 'b', ...ghostTransform(mode, spec.unit, { x: spec.unit.width, y: spec.unit.height }) },
		{ label: 'c', ...ghostTransform(mode, spec.unit, { x: spec.unit.width, y: 0 }) },
		{ label: 'd', ...ghostTransform(mode, spec.unit, { x: 0, y: 0 }) }
	]);

	const distortedViewBox = $derived.by(() => {
		if (!distortedGhost) return null;
		const allCorners = [
			distortedGhost.mainQuad.a,
			distortedGhost.mainQuad.b,
			distortedGhost.mainQuad.c,
			distortedGhost.mainQuad.d,
			distortedGhost.ghostQuad.a,
			distortedGhost.ghostQuad.b,
			distortedGhost.ghostQuad.c,
			distortedGhost.ghostQuad.d
		];
		const xs = allCorners.map((p: any) => p.x);
		const ys = allCorners.map((p: any) => p.y);
		const padding = 4;
		const left = Math.min(...xs) - padding;
		const top = Math.min(...ys) - padding;
		const width = Math.max(...xs) - Math.min(...xs) + padding * 2;
		const height = Math.max(...ys) - Math.min(...ys) + padding * 2;
		return `${left} ${top} ${width} ${height}`;
	});

	const distortedMainPathStr = $derived(
		distortedGhost ? svgPathStringFromSegments(distortedGhost.mainPath) : ''
	);
	const distortedGhostPathStr = $derived(
		distortedGhost ? svgPathStringFromSegments(distortedGhost.ghostPath) : ''
	);
	const distortedMainVertices = $derived(
		distortedGhost ? computeVerticesFromFlatPath(distortedGhost.mainPath) : []
	);
	const distortedGhostVertices = $derived(
		distortedGhost ? computeVerticesFromFlatPath(distortedGhost.ghostPath) : []
	);

	const distortedConnections = $derived.by(() => {
		if (!distortedGhost) return [];
		const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
		for (const rule of rules) {
			const t = distortedGhost.mainPath[rule.target];
			const s = distortedGhost.ghostPath[rule.source];
			if (!t || !s) continue;
			const tx = (t as any)[1];
			const ty = (t as any)[2];
			const sx = (s as any)[1];
			const sy = (s as any)[2];
			if (typeof tx !== 'number' || typeof sx !== 'number') continue;
			lines.push({ x1: tx, y1: ty, x2: sx, y2: sy });
		}
		return lines;
	});

	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.key === 'Delete' || e.key === 'Backspace') && selectedConnection) {
				onSelectConnection(selectedConnection.sourceVertex, selectedConnection.targetVertex);
				onSelectConnectionLine(null);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<div class="container" style="width:{config.size.width}px; height:{config.size.height}px;">
	{#if distortedGhost}
		<svg
			width={config.size.width}
			height={config.size.height}
			viewBox={distortedViewBox}
			class="canvas"
		>
			<polygon
				points="{distortedGhost.mainQuad.a.x},{distortedGhost.mainQuad.a.y} {distortedGhost.mainQuad
					.b.x},{distortedGhost.mainQuad.b.y} {distortedGhost.mainQuad.c.x},{distortedGhost.mainQuad
					.c.y} {distortedGhost.mainQuad.d.x},{distortedGhost.mainQuad.d.y}"
				class="unit-bounds"
				style="fill: {mode === 'partnerStart' ? 'rgba(0,255,0,0.1)' : 'rgba(255,0,0,0.1)'}"
			/>
			<polygon
				points="{distortedGhost.ghostQuad.a.x},{distortedGhost.ghostQuad.a.y} {distortedGhost
					.ghostQuad.b.x},{distortedGhost.ghostQuad.b.y} {distortedGhost.ghostQuad.c
					.x},{distortedGhost.ghostQuad.c.y} {distortedGhost.ghostQuad.d.x},{distortedGhost
					.ghostQuad.d.y}"
				class="ghost-bounds"
				style="fill: {mode === 'partnerStart' ? 'rgba(255,0,0,0.1)' : 'rgba(0,255,0,0.1)'}"
			/>
			<path d={distortedMainPathStr} class="segments" />
			<path d={distortedGhostPathStr} class="ghost-segments" />

			{#each distortedConnections as line, i (i)}
				<line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} class="connection" />
			{/each}

			{#each distortedMainVertices as vertex (vertex.x + ':' + vertex.y)}
				<circle
					cx={vertex.x}
					cy={vertex.y}
					r="0.5"
					class="main-vertex"
					class:selected={selectedTarget === vertex}
					onclick={() => onSelectTarget(vertex)}
				/>
			{/each}

			{#each distortedGhostVertices as vertex (vertex.x + ':' + vertex.y)}
				<circle
					cx={vertex.x}
					cy={vertex.y}
					r="0.5"
					class="ghost-vertex"
					onclick={() => onSelectGhost(vertex)}
				/>
			{/each}
		</svg>
	{:else}
		<svg
			width={config.size.width}
			height={config.size.height}
			viewBox={canv.viewBox}
			class="canvas"
		>
			<rect x="0" y="0" width={spec.unit.width} height={spec.unit.height} class="unit-bounds" />
			<g transform={ghostTransformStr} class="ghost">
				<rect x="0" y="0" width={spec.unit.width} height={spec.unit.height} class="ghost-bounds" />
				<path d={pathString} class="ghost-segments" />
			</g>
			<path d={pathString} class="segments" />
			<UnitLabels unit={spec.unit} {vertices} placement="above" />

			{#each ghostPositions as gp (gp.vertex.x + ':' + gp.vertex.y)}
				<text
					x={gp.x}
					y={gp.y + GHOST_LABEL_OFFSET}
					font-size={GHOST_FONT_SIZE}
					text-anchor="middle"
					dominant-baseline="text-before-edge"
					fill="rgba(0, 0, 0, 0.4)"
					pointer-events="none"
					style="user-select: none;">{flatIndexes(spec.unit, gp.vertex).join(',')}</text
				>
			{/each}
			{#each ghostCorners as gc (gc.label)}
				<text
					x={gc.x}
					y={gc.y + GHOST_LABEL_OFFSET}
					font-size={GHOST_FONT_SIZE}
					text-anchor="middle"
					dominant-baseline="text-before-edge"
					fill="rgba(0, 0, 0, 0.4)"
					pointer-events="none"
					style="user-select: none;">{gc.label}</text
				>
			{/each}

			{#each connections as conn}
				{@const ghostPos = ghostPositions.find((g) => g.vertex === conn.sourceVertex)}
				<line
					x1={conn.targetVertex.x}
					y1={conn.targetVertex.y}
					x2={ghostPos?.x ?? 0}
					y2={ghostPos?.y ?? 0}
					class="connection"
					class:selected={selectedConnection?.sourceVertex === conn.sourceVertex &&
						selectedConnection?.targetVertex === conn.targetVertex}
					onclick={() =>
						onSelectConnectionLine({
							sourceVertex: conn.sourceVertex,
							targetVertex: conn.targetVertex
						})}
				/>
			{/each}

			{#each vertices as vertex (vertex.x + ':' + vertex.y)}
				<circle
					cx={vertex.x}
					cy={vertex.y}
					r="0.5"
					class:selected={selectedTarget === vertex}
					class="main-vertex"
					onclick={() => onSelectTarget(vertex)}
				/>
			{/each}

			{#each ghostPositions as gp (gp.vertex.x + ':' + gp.vertex.y)}
				<circle
					cx={gp.x}
					cy={gp.y}
					r="0.5"
					class="ghost-vertex"
					onclick={() => onSelectGhost(gp.vertex)}
				/>
			{/each}
		</svg>
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
	.unit-bounds {
		fill: none;
		stroke: rgba(0, 0, 0, 0.15);
		stroke-width: 0.2;
		stroke-dasharray: 0.5, 0.5;
	}
	.ghost-bounds {
		fill: none;
		stroke: rgba(0, 0, 0, 0.1);
		stroke-width: 0.2;
		stroke-dasharray: 0.5, 0.5;
	}
	.segments {
		fill: none;
		stroke: black;
		stroke-width: 0.4;
	}
	.ghost-segments {
		fill: none;
		stroke: rgba(0, 0, 0, 0.3);
		stroke-width: 0.4;
	}
	.main-vertex {
		fill: white;
		stroke: black;
		stroke-width: 0.15;
		cursor: pointer;
	}
	.main-vertex.selected {
		fill: orange;
	}
	.ghost-vertex {
		fill: rgba(255, 255, 255, 0.6);
		stroke: rgba(0, 0, 0, 0.5);
		stroke-width: 0.15;
		cursor: pointer;
	}
	.connection {
		stroke: rgba(0, 100, 200, 0.7);
		stroke-width: 0.3;
		cursor: pointer;
	}
	.connection:hover {
		stroke: rgba(0, 100, 200, 1);
		stroke-width: 0.5;
	}
	.connection.selected {
		stroke: red;
		stroke-width: 0.5;
	}
</style>
