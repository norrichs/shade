<script lang="ts">
	import {
		superGlobulePatternStore,
		patternConfigStore,
		selectedProjectionGeometry,
		concatAddress_Facet,
		concatAddress_Band,
		concatAddress_Tube,
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

	export let showSelectedOnly: 'panel' | 'band' | false = false;
	export let range: ProjectionRange = {};
	export let patternStyle: 'view' | 'cut';
	export let labelSize: number;
	export let shouldUseSVGLabels = true;
	export let showScalebar: boolean;

	let {
		distributionConfig,
		panelHoleConfig: holeConfig,
		scaleConfig
	} = $patternConfigStore.tiledPatternConfig.config;

	const FONT_NAME = 'reliefSingleLine';
	const updateLabels = (shouldUseSVGLabels: boolean) => {
		console.debug('UPDATE LABELS');
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
		console.debug({ result });
		return result;
	};

	const filtered = (
		store: typeof $superGlobulePatternStore,
		selectedGeometry: typeof $selectedProjectionGeometry,
		sliceRange: ProjectionRange = {}
	) => {
		console.debug('sliceRange', sliceRange, Object.keys(sliceRange).length > 0);
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
			console.debug({ filtered });
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
		console.debug({ partner, pa, pattern });
		return partner;
	};

	$: updateLabels(shouldUseSVGLabels);
	$: labelStyle = shouldUseSVGLabels
		? ('svgLabels' as 'svgLabels' | 'textLabels')
		: ('textLabels' as 'svgLabels' | 'textLabels');
	$: show = isSuperGlobuleProjectionPanelPattern($superGlobulePatternStore.projectionPattern);
	$: pattern = filtered($superGlobulePatternStore, $selectedProjectionGeometry, range) || {
		tubes: []
	};
	$: cumulativeOffsetX = getCumulativeOffsetX(pattern.tubes);
	const showHingePatterns = true;
</script>

{#if show}
	{#each pattern.tubes as tube, t (concatAddress_Tube(tube.address))}
		<g id={`${concatAddress_Tube(tube.address)}`}>
			<!-- <circle cx={0} cy={0} r={10} fill="red" /> -->
			{#each tube.bands || [] as band, b (concatAddress_Band(band.address))}
				<BandPanelComponent
					{band}
					index={t * pattern.tubes[0].bands.length + b}
					offsetX={cumulativeOffsetX.tubes[t].bands[b].offsetX}
					offsetY={cumulativeOffsetX.tubes[t].bands[b].offsetY}
				>
					{#each band.panels as panel, p (concatAddress_Facet(panel.address))}
						<g>
							<PanelComponent {panel} {patternStyle} {labelSize} {labelStyle} {holeConfig} />
							{#if showHingePatterns}
								{#each panel.meta.hingePatterns || [] as hingePattern, h}
									<g transform={`translate(${-400 +b * 300 + h * 140}, ${300 +p * -20})`}>
										<HingePatternComponent {hingePattern} {panel} showTriangles={false} />
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
