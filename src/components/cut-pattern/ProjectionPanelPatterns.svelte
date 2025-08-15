<script lang="ts">
	import {
		superGlobulePatternStore,
		patternConfigStore,
		viewControlStore,
		selectedProjectionGeometry,
		concatAddress_Facet,
		concatAddress_Band,
		concatAddress_Tube,
		isSuperGlobuleProjectionPanelPattern
	} from '$lib/stores';
	import BandPanelComponent from './BandPanelComponent.svelte';
	import PanelComponent from './PanelComponent.svelte';
	import type { BandPanelPattern, PatternScale, ProjectionPanelPattern } from '$lib/types';
	import type { ProjectionAddress_Facet } from '$lib/projection-geometry/types';
	import {
		sliceProjectionPanelPattern,
		type ProjectionRange
	} from '$lib/projection-geometry/filters';
	import Scalebar from './Scalebar.svelte';

	export let showSelectedOnly: 'panel' | 'band' | false = false;
	export let range: ProjectionRange = {};
	export let patternStyle: 'view' | 'cut';
	export let labelSize: number;
	export let scaleBar: PatternScale | undefined = undefined;

	const filtered = (
		store: typeof $superGlobulePatternStore,
		selectedGeometry: typeof $selectedProjectionGeometry,
		sliceRange: ProjectionRange
	) => {
		const projectionPattern = store.projectionPattern;
		if (!isSuperGlobuleProjectionPanelPattern(projectionPattern)) return null;
		const { projectionPanelPattern } = projectionPattern;

		const pattern =
			Object.keys(sliceRange).length > 0
				? sliceProjectionPanelPattern(projectionPanelPattern, sliceRange)
				: projectionPanelPattern;

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

	$: show = isSuperGlobuleProjectionPanelPattern($superGlobulePatternStore.projectionPattern);
	$: pattern = filtered($superGlobulePatternStore, $selectedProjectionGeometry, range) || {
		tubes: []
	};
</script>

{#if show}
	{#each pattern.tubes as tube, tubeIndex (concatAddress_Tube(tube.address))}
		{#each tube.bands?.reverse() || [] as band, bandIndex (concatAddress_Band(band.address))}
			<BandPanelComponent {band} index={tubeIndex * pattern.tubes[0].bands.length + bandIndex}>
				{#each band.panels as panel (concatAddress_Facet(panel.address))}
					<PanelComponent {panel} {patternStyle} {labelSize} />
				{/each}
			</BandPanelComponent>
			{#if scaleBar && patternStyle === 'cut'}
				<Scalebar scale={scaleBar} />
			{/if}
		{/each}
	{/each}
{/if}
