<script lang="ts">
	import { getBandPoints } from '$lib/generate-globulegeometry';
	import { getBandTrianglePoints } from '$lib/projection-geometry/generate-projection';
	import type {
		CrossSectionConfig,
		ManualDivisionsConfig,
		ProjectionAddress_Band,
		ProjectionAddress_Facet,
		ProjectionAddress_Tube,
		ProjectionCurveSampleMethod
	} from '$lib/projection-geometry/types';
	import { superConfigStore, superGlobuleStore } from '$lib/stores';
	import { Vector3 } from 'three';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import LabeledControl from './LabeledControl.svelte';
	import type { SuperGlobule } from '$lib/types';

	const handleChangeSampleMethod = (event: Event, crossSection: CrossSectionConfig) => {
		const newMethod = (event.target as HTMLSelectElement)
			.value as ProjectionCurveSampleMethod['method'];
		const divisions = crossSection.sampleMethod.divisions;
		const newSampleMethod =
			newMethod === 'divideCurvePath'
				? {
						method: newMethod,
						divisions
				  }
				: {
						method: newMethod,
						divisions,
						divisionsArray: Array.from({ length: divisions - 1 }, (_, i) => (i + 1) / divisions)
				  };
		crossSection.sampleMethod = newSampleMethod as ProjectionCurveSampleMethod;
		$superConfigStore = $superConfigStore;
	};

	const handleChangeDivisions = (newDivisions: number, crossSection: CrossSectionConfig) => {
		const oldDivisions = crossSection.sampleMethod.divisions;
		if (crossSection.sampleMethod.method === 'manualDivisions') {
			const oldDivisionsArray = crossSection.sampleMethod.divisionsArray;
			const newDivisionsArray = [...oldDivisionsArray];
			if (oldDivisions < newDivisions) {
				const space = 1 - oldDivisionsArray[oldDivisionsArray.length - 1];
				newDivisionsArray.push(
					...Array.from(
						{ length: newDivisions - oldDivisions },
						(_, i) => (space / (newDivisions - oldDivisions)) * (i + 1)
					)
				);
				crossSection.sampleMethod.divisionsArray = newDivisionsArray as any;
			} else {
				newDivisionsArray.splice(newDivisions, oldDivisions - newDivisions);
				crossSection.sampleMethod.divisionsArray = newDivisionsArray as any;
			}
		} else {
			console.log('newDivisions', newDivisions);
			crossSection.sampleMethod.divisions = newDivisions;
		}
		$superConfigStore = $superConfigStore;
	};

	// TODO - fix this, it ain't right
	const Z_AXIS = new Vector3(0, 0, 1);
	const getCrossSectionPath = (
		address: ProjectionAddress_Tube,
		projections: SuperGlobule['projections'],
		sectionIndex?: number
	): string => {
		const tube = projections[address.projection].tubes[address.tube];
    if (!sectionIndex) sectionIndex = Math.ceil(tube.bands[0].facets.length / 4)
		if (sectionIndex !== undefined && (sectionIndex < 0 || sectionIndex > tube.bands[0].facets.length / 2 + 1))
			throw Error(`Invalid section index: ${sectionIndex}`);

		const vectors = tube.bands.map((band, i) => {
			const [
				{
					base: { p0: basePoint },
					second: { p0: secondPoint }
				}
			] = getBandTrianglePoints(band.orientation);

			if ((sectionIndex = band.facets.length / 2 + 1))
				return band.facets[band.facets.length - 1].triangle[secondPoint].clone();
			return band.facets[0].triangle[basePoint].clone();
		});

		const middle = vectors.length / 2;
		const relativeVectors = vectors.map((v) => v.clone().addScaledVector(vectors[0], -1));
		const referenceVector = relativeVectors[middle];
		const params = relativeVectors.map((v, i) => {
			const angle = v.angleTo(referenceVector);
			const length = v.length();
			return { angle: i < middle ? angle : -angle, length };
		});

		const newReferenceVector = new Vector3(0, params[middle].length, 0);
		const pathVectors = params.map((p, i) => {
			if (i === 0) return new Vector3(0, 0, 0);
			if (i === middle) return newReferenceVector.clone();
			return newReferenceVector.clone().applyAxisAngle(Z_AXIS, p.angle).setLength(p.length);
		});

		const path =
			pathVectors.reduce((path, v) => {
				return path + `L ${v.x} ${v.y}`;
			}, `M 0 0`) + `Z`;

		return path;
	};

	$: crossSectionPath = getCrossSectionPath(
		{ projection: 0, tube: 0 },
		$superGlobuleStore.projections
	);
</script>

<div>CrossSection</div>
<main>
	{#each $superConfigStore.projectionConfigs[0].projectorConfig.polyhedron.crossSectionCurves as crossSection, crossSectionIndex}
		<section class="cross-section-container">
			<header>{crossSectionIndex}</header>
			<div>
				<div>
					<svg width="400" height="400" viewBox="-500 -500 1000 1000">
						<path d={crossSectionPath} transform='scale(1 -1)' />
					</svg>
				</div>
				<div>
					<LabeledControl label="Divisions:">
						<NumberInput
							value={crossSection.sampleMethod.divisions}
							onChange={(newValue) => {
								handleChangeDivisions(newValue, crossSection);
							}}
							min={2}
							step={1}
							hasButtons
						/>
					</LabeledControl>
					<LabeledControl label="Method:">
						<select
							value={crossSection.sampleMethod.method}
							on:change={(event) => handleChangeSampleMethod(event, crossSection)}
						>
							<option value="manualDivisions">Manual</option>
							<option value="divideCurvePath">Divide Curve</option>
						</select>
					</LabeledControl>
					<LabeledControl
						label="Divide at:"
						show={crossSection.sampleMethod.method === 'manualDivisions'}
					>
						<div>
							{#each crossSection.sampleMethod.divisionsArray as division, index}
								<div>{Math.round(division * 100) / 100}</div>
								<input
									type="range"
									min={0}
									max={1}
									step={0.001}
									bind:value={crossSection.sampleMethod.divisionsArray[index]}
								/>
							{/each}
						</div>
					</LabeledControl>
					<LabeledControl label={`Width: ${crossSection.scaling.width}`}>
						<input
							type="range"
							min={0}
							step={1}
							max={$superConfigStore.projectionConfigs[0].surfaceConfig.radius * 2}
							bind:value={crossSection.scaling.width}
						/>
					</LabeledControl>
					<LabeledControl label={`Height: ${crossSection.scaling.height}`}>
						<input
							type="range"
							min={0}
							step={1}
							max={$superConfigStore.projectionConfigs[0].surfaceConfig.radius * 2}
							bind:value={crossSection.scaling.height}
						/>
					</LabeledControl>
				</div>
			</div>
		</section>
	{/each}
</main>

<style>
	:root {
		font-family: monospace;
	}
	.cross-section-container {
		border: 1px dotted black;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.cross-section-container > header {
		background-color: rgba(0, 0, 0, 0.1);
		padding: 4px;
		font-size: 1em;
	}
	.cross-section-container > div {
		display: flex;
		flex-direction: row;
	}
	.cross-section-container > div > div {
		padding: 10px;
	}
	.labeled-control {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
	}
</style>
