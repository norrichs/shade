<script lang="ts">
	import { getMidPoint } from '$lib/patterns/utils';
	import type { BandCutPattern } from '$lib/types';
	import { concatAddress } from '$lib/util';

	let { showQuadLabels = false, band }: { showQuadLabels?: boolean; band: BandCutPattern } =
		$props();

	const getQuadLabels = (band: BandCutPattern) => {
		if (!showQuadLabels) return undefined;
		return band.facets.map((facet) => {
			const { quad } = facet;
			if (!quad) return undefined;
			const centerPoint = {
				x: (quad.a.x + quad.b.x + quad.c.x + quad.d.x) / 4,
				y: (quad.a.y + quad.b.y + quad.c.y + quad.d.y) / 4
			};
			return {
				a: { position: getMidPoint(quad.a, centerPoint, 0.15), label: 'A' },
				b: { position: getMidPoint(quad.b, centerPoint, 0.15), label: 'B' },
				c: { position: getMidPoint(quad.c, centerPoint, 0.15), label: 'C' },
				d: { position: getMidPoint(quad.d, centerPoint, 0.15), label: 'D' }
			};
		});
	};

	const getBandLabels = (band: BandCutPattern) => {
		const quad = band.facets[Math.floor((band.facets.length - 1) / 2)].quad;
		if (!quad) return undefined;
		const centerPoint = {
			x: (quad.a.x + quad.b.x + quad.c.x + quad.d.x) / 4,
			y: (quad.a.y + quad.b.y + quad.c.y + quad.d.y) / 4
		};
		return {
			startPartner: concatAddress(band.meta?.startPartnerBand, 'tb'),
			endPartner: concatAddress(band.meta?.endPartnerBand, 'tb'),
			address: concatAddress(band.address, 'tb'),
			position: centerPoint
		};
	};

	let quadLabels = $derived(getQuadLabels(band));
	let bandLabels = $derived(getBandLabels(band));
</script>

{#if quadLabels && showQuadLabels}
	<g stroke="none" fill="black" font-size="30">
		{#if bandLabels}
			<rect
				x={bandLabels.position.x - 30}
				y={bandLabels.position.y - 30}
				width={60}
				height={50}
				fill="rgba(200, 200, 200, 0.5)"
			/>
			<text
				x={bandLabels.position.x}
				y={bandLabels.position.y - 20}
				text-anchor="middle"
				font-size="10"
			>
				{`s: ${bandLabels.startPartner}`}
			</text>
			<text x={bandLabels.position.x} y={bandLabels.position.y} text-anchor="middle" font-size="20">
				{`${bandLabels.address}`}
			</text>
			<text
				x={bandLabels.position.x}
				y={bandLabels.position.y + 15}
				text-anchor="middle"
				font-size="10"
			>
				{`e: ${bandLabels.endPartner}`}
			</text>
		{/if}
		{#each quadLabels as l}
			{#if l?.a}
				<rect
					x={l.a.position.x - 7}
					y={l.a.position.y - 12}
					width={15}
					height={15}
					fill="rgba(200, 200, 200, 0.5)"
				/>
				<text x={l.a.position.x} y={l.a.position.y} text-anchor="middle" font-size="10">
					{l.a.label}
				</text>
			{/if}
			{#if l?.b}
				<rect
					x={l.b.position.x - 7}
					y={l.b.position.y - 12}
					width={15}
					height={15}
					fill="rgba(200, 200, 200, 0.5)"
				/>
				<text x={l.b.position.x} y={l.b.position.y} text-anchor="middle" font-size="10">
					{l.b.label}
				</text>
			{/if}
			{#if l?.c}
				<rect
					x={l.c.position.x - 7}
					y={l.c.position.y - 12}
					width={15}
					height={15}
					fill="rgba(200, 200, 200, 0.5)"
				/>
				<text x={l.c.position.x} y={l.c.position.y} text-anchor="middle" font-size="10">
					{l.c.label}
				</text>
			{/if}
			{#if l?.d}
				<rect
					x={l.d.position.x - 7}
					y={l.d.position.y - 12}
					width={15}
					height={15}
					fill="rgba(200, 200, 200, 0.5)"
				/>
				<text x={l.d.position.x} y={l.d.position.y} text-anchor="middle" font-size="10">
					{l.d.label}
				</text>
			{/if}
		{/each}
	</g>
{/if}
