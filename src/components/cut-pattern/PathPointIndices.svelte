<script lang="ts">
	import { getMidPoint } from '$lib/patterns/utils';
	import type { BandCutPattern, PathSegment, Point } from '$lib/types';

	export let showPathPointIndices = false;
	export let band: BandCutPattern;
	export let facetRange: [number, number] = [0, band.facets.length];

	const getPathPointIndices = (band: BandCutPattern, showPathPointIndices: boolean) => {
		if (!showPathPointIndices) return [];
		return band.facets.map((facet) => {
			const segmentPairs = facet.path.reduce((pairs, segment, index) => {
				if (index % 2 === 0 && index + 1 < facet.path.length) {
					pairs.push([segment, facet.path[index + 1]]);
				}
				return pairs;
			}, [] as [PathSegment, PathSegment][]);

			return facet.path.map((segment: PathSegment, index: number) => {
				let p: Point;
				let otherSegment: PathSegment;
				switch (segment[0]) {
					case 'M':
						otherSegment = facet.path[(index + 1) % facet.path.length];
						p =
							otherSegment[0] !== 'Z'
								? getMidPoint(
										{ x: segment[1], y: segment[2] },
										{ x: otherSegment[1], y: otherSegment[2] },
										0.2
								  )
								: { x: segment[1], y: segment[2] };
						return { ...p, index };
					case 'L':
						otherSegment = facet.path[(index - 1 + facet.path.length) % facet.path.length];
						p =
							otherSegment[0] !== 'Z'
								? getMidPoint(
										{ x: otherSegment[1], y: otherSegment[2] },
										{ x: segment[1], y: segment[2] },
										0.8
								  )
								: { x: segment[1], y: segment[2] };
						return { ...p, index };
					case 'C':
						return { x: segment[5], y: segment[6], index };
					case 'Q':
						return { x: segment[3], y: segment[4], index };
					case 'Z':
						return null;
				}
			});
		});
	};

	$: pathPointIndices = getPathPointIndices(band, showPathPointIndices);
</script>

{#if showPathPointIndices}
	<g stroke="none" text-anchor="middle">
		{#each pathPointIndices.slice(facetRange[0], facetRange[1]) as facet, f}
			{#each facet as point}
				{#if point}
					<rect
						x={point.x - 2.5}
						y={point.y - 2.5}
						width="5"
						height="5"
						fill="lightgray"
						stroke="none"
					/>
					<text x={point.x} y={point.y + 2} font-size={4} fill="black">{point.index}</text>
				{/if}
			{/each}
		{/each}
	</g>
{/if}
