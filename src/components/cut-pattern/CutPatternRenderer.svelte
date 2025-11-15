<script lang="ts">
	import {
		sliceProjectionCutPattern,
		type ProjectionRange
	} from '$lib/projection-geometry/filters';
	import { patternConfigStore, viewControlStore, concatAddress } from '$lib/stores';
	import { Vector3 } from 'three';
	import type { CutPattern, TubeCutPattern } from '$lib/types';
	import BandComponent from './BandComponent.svelte';
	import BandCutPatternComponent from './BandCutPatternComponent.svelte';
	import QuadPattern from '../pattern-svg/QuadPattern.svelte';

	// export let projectionPattern: SuperGlobuleProjectionPattern | undefined;
	export let tubes: TubeCutPattern[] = [];

	// $: range = $patternConfigStore.patternViewConfig.range;
	let range: ProjectionRange = {};
	let filteredTubes: TubeCutPattern[] = [];
	let origins: { tubes: { bands: Vector3[] }[] } = { tubes: [{ bands: [] }] };

	const getCumulativeOrigins = (tubes: TubeCutPattern[], gap: number = 20) => {
		const cumulativeOrigin = new Vector3(0, 0, 0);

		const origins = {
			tubes: tubes.map((tube) => ({
				bands: tube.bands.map((band) => {
					const result = cumulativeOrigin.clone();
					cumulativeOrigin.set(cumulativeOrigin.x + (band.bounds?.width || 0) + gap, 0, 0);
					return result;
				})
			}))
		};

		return origins;
	};

	const filtered = ({ tubes, range }: { tubes: TubeCutPattern[]; range: ProjectionRange }) => {
		const sliced = sliceProjectionCutPattern(tubes, range);
		return sliced;
	};

	const update = (
		store: typeof $viewControlStore,
		tubes: TubeCutPattern[],
		range: ProjectionRange
	) => {
		console.debug('update', { tubes, range });
		const { showGlobuleTubeGeometry, showProjectionGeometry } = store;
		const any = showGlobuleTubeGeometry.any || showProjectionGeometry.any;
		const bands = showGlobuleTubeGeometry.bands || showProjectionGeometry.bands;
		const facets = showGlobuleTubeGeometry.facets || showProjectionGeometry.facets;
		showPattern = any && (bands || facets);

		filteredTubes = filtered({ tubes, range });
		origins = getCumulativeOrigins(tubes, 20);
	};

	let showPattern = false;

	const minPoint = (facets: CutPattern[]) => {
		let maxY: number = 0;
		let X: number = 0;
		facets.forEach((facet) =>
			facet.path.forEach((segment) => {
				if (segment[2] && segment[2] > maxY) {
					maxY = segment[2];
					X = segment[1] || 0;
				}
			})
		);
		return { x: X, y: maxY };
	};

	$: update($viewControlStore, tubes, range);
</script>

{#if showPattern}
	{#each filteredTubes || [] as tube, t}
		<g id={`${concatAddress(tube.address)}`}>
			{#each tube.bands || [] as band, b (concatAddress(band.address))}
				<BandComponent
					{band}
					index={b}
					origin={origins.tubes[t].bands[b]}
					showLabel
					tagAnchorPoint={minPoint(band.facets)}
					tagAngle={band.tagAngle}
					showBounds={false}
				>
					{#if band.projectionType === 'patterned'}
						<QuadPattern
							{band}
							showQuads={$patternConfigStore.patternViewConfig.showQuads}
							showLabels={$patternConfigStore.patternViewConfig.showLabels}
						/>
						<BandCutPatternComponent {band} />
					{/if}
				</BandComponent>
			{/each}
		</g>
	{/each}
	<g id="label-text-container" />
{/if}
