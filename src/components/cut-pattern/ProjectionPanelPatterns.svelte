<script lang="ts">
	import {
		superGlobulePatternStore,
		patternConfigStore,
		selectedProjectionGeometry,
		isSuperGlobuleProjectionPanelPattern
	} from '$lib/stores';
	import BandPanelComponent from './BandPanelComponent.svelte';
	import PanelComponent from './PanelComponent.svelte';
	import type { PanelPattern, ProjectionPanelPattern, TubePanelPattern } from '$lib/types';
	import {
		sliceProjectionPanelPattern,
		type ProjectionRange
	} from '$lib/projection-geometry/filters';
	import Scalebar from './Scalebar.svelte';

	import { svgTextDictionary } from './SvgText/svg-text-store';
	import Fonts from './SvgText/fonts';
	import { processSvg } from './SvgText/svg-text';
	import HingePatternComponent from './HingePatternComponent.svelte';
	import { translatePS } from '$lib/patterns/utils';
	import type { TriangleEdge } from '$lib/projection-geometry/types';
	import { concatAddress } from '$lib/util';

	let {
		showSelectedOnly = false,
		range = {},
		patternStyle,
		labelSize,
		shouldUseSVGLabels = true,
		showScalebar,
		verbose
	}: {
		showSelectedOnly?: 'panel' | 'band' | false;
		range?: ProjectionRange;
		patternStyle: 'view' | 'cut';
		labelSize: number;
		shouldUseSVGLabels?: boolean;
		showScalebar: boolean;
		verbose: boolean;
	} = $props();

	let {
		distributionConfig,
		panelHoleConfig: holeConfig,
		scaleConfig
	} = $patternConfigStore.tiledPatternConfig.config;

	const FONT_NAME = 'reliefSingleLine';
	const updateLabels = (shouldUseSVGLabels: boolean) => {
		if (shouldUseSVGLabels) {
			$svgTextDictionary = processSvg(Fonts[FONT_NAME].keyString, Fonts[FONT_NAME].svgString);
		}
	};
	const getCumulativeOffsetX = (
		distributedPattern: TubePanelPattern[]
	): { tubes: { bands: { offsetX: number; offsetY: number }[] }[] } => {
		const result = {
			tubes: distributedPattern.map((tube) => {
				let cumulativeOffsetX = 0;
				return {
					bands: tube.bands.map((band, b, bands) => {
						cumulativeOffsetX += b === 0 ? 0 : (bands[b - 1].bounds?.width || 0) + 0;

						return {
							offsetY: -(band.bounds?.height || 0) / 2,
							offsetX: cumulativeOffsetX
						};
					})
				};
			})
		};
		return result;
	};

	const filtered = (
		store: typeof $superGlobulePatternStore,
		selectedGeometry: typeof $selectedProjectionGeometry,
		sliceRange: ProjectionRange = {}
	) => {
		const projectionPattern = store.projectionPattern;
		if (!isSuperGlobuleProjectionPanelPattern(projectionPattern)) return null;
		const { projectionPanelPattern } = projectionPattern;

		const pattern = sliceProjectionPanelPattern(projectionPanelPattern, sliceRange);

		if (showSelectedOnly) {
			if (!selectedGeometry) return pattern;
			const filterFn = selectedGeometry.isSelectedOrPartner;
			const filtered: ProjectionPanelPattern = {
				...pattern,
				tubes: pattern.tubes
					.filter(({ address }) => filterFn(address))
					.map((tube) => ({
						...tube,
						bands: tube.bands
							.filter(({ address }) => filterFn(address))
							.map((band) => ({
								...band,
								panels:
									showSelectedOnly === 'panel'
										? band.panels.filter(({ address }) => filterFn(address))
										: band.panels
							}))
					}))
			};

			return filtered;
		}
		return pattern;
	};

	const getPartnerPanel = (
		panel: PanelPattern,
		store: typeof $superGlobulePatternStore,
		edge: TriangleEdge
	) => {
		const projectionPattern = store.projectionPattern;
		if (!isSuperGlobuleProjectionPanelPattern(projectionPattern)) return null;
		const pattern = projectionPattern.projectionPanelPattern;
		const pa = panel.meta.edges[edge].partner;
		const partner = pattern.tubes[pa.tube].bands[pa.band].panels[pa.facet];

		return partner;
	};

	$effect(() => {
		updateLabels(shouldUseSVGLabels);
	});
	let labelStyle = $derived(
		shouldUseSVGLabels
			? ('svgLabels' as 'svgLabels' | 'textLabels')
			: ('textLabels' as 'svgLabels' | 'textLabels')
	);
	let show = $derived(
		isSuperGlobuleProjectionPanelPattern($superGlobulePatternStore.projectionPattern)
	);
	let pattern = $derived(
		filtered($superGlobulePatternStore, $selectedProjectionGeometry, range) || {
			tubes: []
		}
	);
	let cumulativeOffsetX = $derived(getCumulativeOffsetX(pattern.tubes));
	const showHingePatterns = true;
</script>

{#if show}
	{#each pattern.tubes as tube, t (concatAddress(tube.address))}
		<g id={`${concatAddress(tube.address)}`}>
			{#each tube.bands || [] as band, b (concatAddress(band.address))}
				<BandPanelComponent
					{band}
					index={t * pattern.tubes[0].bands.length + b}
					offsetX={cumulativeOffsetX.tubes[t].bands[b].offsetX}
					offsetY={cumulativeOffsetX.tubes[t].bands[b].offsetY}
				>
					{#each band.panels as panel, p (concatAddress(panel.address))}
						<g>
							<PanelComponent {panel} {patternStyle} {labelSize} {labelStyle} {verbose} />
							{#if showHingePatterns}
								{#each panel.meta.hingePatterns || [] as hingePattern, h}
									<g
										transform={`translate(${hingePattern.bounds.width / 2}, ${
											-hingePattern.bounds.height - p * 55 - h * 40
										})`}
									>
										<HingePatternComponent
											{hingePattern}
											{panel}
											showTriangles={true}
											{patternStyle}
										/>
									</g>
								{/each}
							{/if}
						</g>
					{/each}
				</BandPanelComponent>
			{/each}
		</g>
	{/each}

	<!-- {#if showHingePatterns}
		{#each pattern.tubes.slice(0, 1) as tube, t (concatAddress_Tube(tube.address))}
			{#each tube.bands.slice(0, 1) as band, b (concatAddress_Band(band.address))}
				{#each band.panels.slice(0, 2) as panel, p (concatAddress_Facet(panel.address))}
					{#each panel.meta.hingePatterns || [] as hingePattern}
						<HingePatternComponent {hingePattern} />
					{/each}
				{/each}
			{/each}
		{/each}
	{/if} -->

	{#if scaleConfig && showScalebar}
		<Scalebar scale={scaleConfig} />
		<Scalebar scale={{ ...scaleConfig, unit: 'in', quantity: 0.5 }} origin={{ x: 200, y: 100 }} />
	{/if}
{/if}
