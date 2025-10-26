<script lang="ts">
	import type {
		CrossSectionConfig,
		ManualDivisionsConfig,
		ProjectionCurveSampleMethod
	} from '$lib/projection-geometry/types';
	import { superConfigStore } from '$lib/stores';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';

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
		// const newDivisions = parseInt((event.target as HTMLInputElement).value);
		const oldDivisions = crossSection.sampleMethod.divisions;
		console.debug('handleChangeDivisions', newDivisions, oldDivisions);
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
</script>

<div>CrossSection</div>
<main>
	{#each $superConfigStore.projectionConfigs[0].projectorConfig.polyhedron.edgeCurves as edgeCurve, edgeCurveIndex}
		<section class="cross-section-container">
			<header>{edgeCurveIndex}</header>
			<div>
				<div class="labeled-control">
					<div>Divisions:</div>

					<NumberInput
						value={edgeCurve.sampleMethod.divisions}
						onChange={(newValue) => {
							handleChangeDivisions(newValue, edgeCurve);
						}}
						min={2}
						step={1}
						hasButtons
					/>
				</div>

				<div class="labeled-control">
					<div>Method:</div>
					<select
						value={edgeCurve.sampleMethod.method}
						on:change={(event) => handleChangeSampleMethod(event, edgeCurve)}
					>
						<option value="manualDivisions">Manual</option>
						<option value="divideCurvePath">Divide Curve</option>
					</select>
				</div>

				{#if edgeCurve.sampleMethod.method === 'manualDivisions'}
					<div class="labeled-control">
						<div>Divide at:</div>
						<div>
							{#each edgeCurve.sampleMethod.divisionsArray as division, index}
								<div>{Math.round(division * 100) / 100}</div>
								<input
									type="range"
									min={0}
									max={1}
									step={0.001}
									bind:value={$superConfigStore.projectionConfigs[0].projectorConfig.polyhedron
										.edgeCurves[edgeCurveIndex].sampleMethod.divisionsArray[index]}
								/>
							{/each}
						</div>
					</div>
				{/if}
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
		padding: 10px;
	}
	.labeled-control {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
	}
</style>
