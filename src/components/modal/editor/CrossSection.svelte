<script lang="ts">
	import { getCrossSectionPath } from '$lib/projection-geometry/generate-projection';
	import type {
		CrossSectionConfig,
		ProjectionCurveSampleMethod
	} from '$lib/projection-geometry/types';
	import { superConfigStore } from '$lib/stores';
	import { get } from 'svelte/store';
	import { generateCrossSectionPath } from '$lib/projection-geometry/preview-utils';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import Button from '../../design-system/Button.svelte';
	import LabeledControl from './LabeledControl.svelte';
	import { endPointsInRange, endPointsZeroX, insertPoint, neighborPointMatch } from './path-editor';
	import PathEditor from './PathEditor.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';

	let { editCurve = true, sectionIndex = 0 }: { editCurve?: boolean; sectionIndex?: number } = $props();

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
		superConfigStore.set(get(superConfigStore));
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
		superConfigStore.set(get(superConfigStore));
	};
</script>

<Editor>
	{#each $superConfigStore.projectionConfigs[0].projectorConfig.polyhedron.crossSectionCurves as crossSection, crossSectionIndex}
		<section class="cross-section-container">
			<header>{crossSectionIndex}</header>
			<Container>
				<Container direction="column">
					<LabeledControl label="Edit Curve:">
						<input type="checkbox" bind:checked={editCurve} />
					</LabeledControl>
					<LabeledControl label="Section:">
						<NumberInput bind:value={sectionIndex} min={0} max={5} step={1} hasButtons />
					</LabeledControl>
					<svg width="200" height="200" viewBox="-500 -500 1000 1000">
						<path
							d={generateCrossSectionPath(crossSection)}
							transform="scale(1 -1)"
							fill="rgba(0,0,50,0.2)"
							stroke="black"
							stroke-width={2}
						/>
					</svg>
					{#if editCurve}
						<PathEditor
							curveDef={crossSection.curves}
							config={{
								gutter: 3,
								padding: 1,
								contentBounds: { top: 0, left: 0, width: 1, height: 1 },
								size: { width: 200, height: 200 }
							}}
							onChangeCurveDef={(curveDef) => {
								crossSection.curves = curveDef;
								superConfigStore.set(get(superConfigStore));
							}}
							limits={[endPointsZeroX, endPointsInRange, neighborPointMatch]}
						>
							<rect x="0" y="0" width="1" height="1" fill="rgba(0,0,0,0.1)" />
						</PathEditor>
						<Button
							onclick={() => {
								crossSection.curves = insertPoint(0, crossSection.curves, {
									type: 'PointConfig2',
									x: 0.5,
									y: 0.5
								});
								superConfigStore.set(get(superConfigStore));
							}}>Insert Point</Button
						>
					{/if}
				</Container>
				<Container direction="column">
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
							onchange={(event) => handleChangeSampleMethod(event, crossSection)}
						>
							<option value="manualDivisions">Manual</option>
							<option value="divideCurvePath">Divide Curve</option>
						</select>
					</LabeledControl>
					<LabeledControl
						label="Divide at:"
						show={crossSection.sampleMethod.method === 'manualDivisions'}
					>
						{#if crossSection.sampleMethod.method === 'manualDivisions'}
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
						{/if}
					</LabeledControl>
					<LabeledControl label={`Width: ${crossSection.scaling.width}`}>
						<input
							type="range"
							min={0}
							step={1}
							max={$superConfigStore.projectionConfigs[0].surfaceConfig.radius || 100 * 2}
							bind:value={crossSection.scaling.width}
						/>
					</LabeledControl>
					<LabeledControl label={`Height: ${crossSection.scaling.height}`}>
						<input
							type="range"
							min={0}
							step={1}
							max={$superConfigStore.projectionConfigs[0].surfaceConfig.radius || 100 * 2}
							bind:value={crossSection.scaling.height}
						/>
					</LabeledControl>
					<LabeledControl label="Should Skew Curve:">
						<input type="checkbox" bind:checked={crossSection.shouldSkewCurve} />
					</LabeledControl>
				</Container>
			</Container>
		</section>
	{/each}
</Editor>

<style>
</style>
