<script lang="ts">
	import type { Point } from '$lib/patterns/flower-of-life.types';
	import { getIntersectionOfLimitedLines } from '$lib/patterns/utils';
	import CombinedNumberInput from '../../components/controls/CombinedNumberInput.svelte';

	let l0: { p0: Point; p1: Point } = {
		p0: { x: 0, y: 0 },
		p1: { x: 100, y: 100 }
	};
	let l1: { p0: Point; p1: Point } = {
		p0: { x: 80, y: 120 },
		p1: { x: 150, y: 80 }
	};
	let limits = {
		l0P0: true,
		l0P1: false,
		l1P0: true,
		l1P1: true
	};

	$: intersection = getIntersectionOfLimitedLines(l0, l1, limits);
</script>

<div>
	<header>Line intersection test</header>
	<div>
		<div class="input-group">
			<CombinedNumberInput bind:value={l0.p0.x} label="l0 p0 x" min={-1000} max={1000} step={1} />
			<CombinedNumberInput bind:value={l0.p0.y} label="l0 p0 y" min={-1000} max={1000} step={1} />
			<div class="input-group">
				<span>limit</span>
				<span>
					<input type="checkbox" bind:checked={limits.l0P0} />
				</span>
			</div>
		</div>

		<div class="input-group">
			<CombinedNumberInput bind:value={l0.p1.x} label="l0 p1 x" min={-1000} max={1000} step={1} />
			<CombinedNumberInput bind:value={l0.p1.y} label="l0 p1 x" min={-1000} max={1000} step={1} />
			<div class="input-group">
				<span>limit</span>
				<span>
					<input type="checkbox" bind:checked={limits.l0P1} />
				</span>
			</div>
		</div>

		<div class="input-group">
			<CombinedNumberInput bind:value={l1.p0.x} label="l1 p0 x" min={-1000} max={1000} step={1} />
			<CombinedNumberInput bind:value={l1.p0.y} label="l1 p0 x" min={-1000} max={1000} step={1} />
			<div class="input-group">
				<span>limit</span>
				<span>
					<input type="checkbox" bind:checked={limits.l1P0} />
				</span>
			</div>
		</div>

		<div class="input-group">
			<CombinedNumberInput bind:value={l1.p1.x} label="l1 p1 x" min={-1000} max={1000} step={1} />
			<CombinedNumberInput bind:value={l1.p1.y} label="l1 p1 x" min={-1000} max={1000} step={1} />
			<div class="input-group">
				<span>limit</span>
				<span>
					<input type="checkbox" bind:checked={limits.l1P1} />
				</span>
			</div>
		</div>
	</div>
	<svg viewBox="-500 -500 1000 1000" width="1000" height="1000">
		<defs>
			<marker id={`circle-marker`} refX="4" refY="4" viewBox="0 0 8 8">
				<circle cx="4" cy="4" r="4" />
			</marker>
			<marker
				id={`directional-marker`}
				viewBox="0 0 10 10"
				refX="10"
				refY="5"
				markerWidth="6"
				markerHeight="6"
				orient="auto-start-reverse"
			>
				<path d="M 0 0 L 10 5 L 0 10 L 5 5 z" />
			</marker>
		</defs>

		<g>
			<path
				d={`M ${l0.p0.x} ${l0.p0.y} L ${l0.p1.x} ${l0.p1.y}`}
				stroke-width="2"
				stroke="red"
				marker-end={limits.l0P1 ? 'url(#circle-marker' : 'url(#directional-marker)'}
				marker-start={limits.l0P0 ? 'url(#circle-marker' : 'url(#directional-marker)'}
			/>
			<path
				d={`M ${l1.p0.x} ${l1.p0.y} L ${l1.p1.x} ${l1.p1.y}`}
				stroke-width="2"
				stroke="green"
				marker-end={limits.l1P1 ? 'url(#circle-marker' : 'url(#directional-marker)'}
				marker-start={limits.l1P0 ? 'url(#circle-marker' : 'url(#directional-marker)'}
			/>
			{#if intersection}
				<circle cx={intersection.x} cy={intersection.y} r="5" fill="rgba(100,0,0,0.5)" />
			{:else}
				<div>No intersection</div>
			{/if}
		</g>
	</svg>
</div>

<style>
	.input-group {
		display: flex;
		flex-direction: row;
	}
</style>
