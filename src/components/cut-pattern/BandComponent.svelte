<script lang="ts">
	import type { BandCutPattern, Point, TubeCutPattern } from '$lib/types';
	import type { Snippet } from 'svelte';
	import PatternLabel from './PatternLabel.svelte';
	import OnTabLabel from './OnTabLabel.svelte';
	import { resolveTabLabel } from '$lib/cut-pattern/resolve-tab-label';
	import { patternConfigStore, selectedProjection, selectedSurfaceProjection } from '$lib/stores';
	import type { Vector3 } from 'three';
	import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';
	import { concatAddress } from '$lib/util';

	let {
		band,
		index,
		origin,
		tube,
		showBounds = false,
		portal = false,
		tagAnchorPoint,
		tagAngle,
		selectionTarget = 'projection',
		children
	}: {
		band: BandCutPattern;
		index: number;
		origin: Vector3;
		tube: TubeCutPattern;
		showBounds?: boolean;
		portal?: boolean;
		tagAnchorPoint: Point;
		tagAngle: number | undefined;
		selectionTarget?: 'projection' | 'surfaceProjection';
		children?: Snippet;
	} = $props();

	let labels = $derived($patternConfigStore.patternTypeConfig.labels);
	let externalTagEnabled = $derived(labels?.externalTag?.enabled ?? false);
	let onTabEnabled = $derived(labels?.onTab?.enabled ?? false);
	let hasTabs = $derived(!!band.tabs && band.tabs.length > 0);

	let colors = {
		default: 'orange',
		hovered: 'blue',
		focused: 'rebeccapurple'
	};

	let isFocused = $state(false);
	let isHovered = $state(false);
	let color = $derived(isHovered ? colors.hovered : isFocused ? colors.focused : colors.default);

	const handleMouseOver = (address: GlobuleAddress_Band) => {
		isHovered = true;
	};
	const handleMouseOut = (address: GlobuleAddress_Band) => {
		isHovered = false;
	};

	const handleClick = (address: GlobuleAddress_Band) => {
		if (selectionTarget === 'surfaceProjection') {
			$selectedSurfaceProjection = { ...address, facet: 0 };
		} else {
			$selectedProjection = { ...address, facet: 0 };
		}
	};
</script>

<g
	transform={`translate(${origin.x} ${origin.y})`}
	id={`band-${band.id}`}
	role="group"
	onmouseover={() => handleMouseOver(band.address)}
	onmouseout={() => handleMouseOut(band.address)}
	onfocus={() => {
		handleClick(band.address);
		isFocused = true;
	}}
	onblur={() => (isFocused = false)}
	stroke={color}
>
	{#if showBounds && band.bounds}<rect
			x={band.bounds.left}
			y={band.bounds.top}
			width={band.bounds.width}
			height={band.bounds.height}
			fill="rgba(0, 0, 0, 0.05)"
			stroke="red"
			stroke-width={0.1}
		/>{/if}
	{@render children?.()}
	{#if externalTagEnabled}
		<PatternLabel
			id={`band-${band.id}`}
			{color}
			value={index}
			radius={20}
			scale={labels?.externalTag?.scale ?? 0.1}
			angle={labels?.externalTag?.angle ?? band.tagAngle ?? 0}
			anchor={tagAnchorPoint || { x: -50, y: -50 }}
			addressStrings={[
				concatAddress(band.address, 'tb'),
				...(band.meta?.startPartnerBand
					? [` > ${concatAddress(band.meta?.startPartnerBand, 'tb')}`]
					: []),
				...(band.meta?.endPartnerBand
					? [` > ${concatAddress(band.meta?.endPartnerBand, 'tb')}`]
					: [])
			]}
			portal={portal ? { transform: `translate(${origin.x} ${origin.y})` } : undefined}
		/>
	{/if}
	{#if onTabEnabled && hasTabs}
		{#each band.tabs ?? [] as tab, tabIndex (tabIndex)}
			<OnTabLabel
				outer={tab.outer}
				base={tab.base}
				text={resolveTabLabel(tab, band, tube)}
				padding={labels?.onTab?.padding ?? 0.1}
				color={labels?.onTab?.color ?? 'black'}
			/>
		{/each}
	{/if}
</g>
