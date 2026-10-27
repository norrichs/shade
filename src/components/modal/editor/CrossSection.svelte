<script lang="ts">
	import { getCrossSectionPath } from '#lib/projection-geometry/generate-projection.js';
	import type {
		CrossSectionConfig,
		ProjectionCurveSampleMethod
	} from '#lib/projection-geometry/types.js';
	import { superConfigStore } from '#lib/stores/index.js';
	import { get } from 'svelte/store';
	import { generateCrossSectionPath } from '#lib/projection-geometry/preview-utils.js';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import Button from '../../design-system/Button.svelte';
	import LabeledControl from './LabeledControl.svelte';
	import { endPointsInRange, endPointsZeroX, insertPoint, neighborPointMatch } from './path-editor';
	import PathEditor from './PathEditor.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';

	let { editCurve = true, sectionIndex = 0 }: { editCurve?: boolean; sectionIndex?: number } =
		$props();

	const commit = () => superConfigStore.set(get(superConfigStore));

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
		commit();
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
				crossSection.sampleMethod.divisionsArray = newDivisionsArray as typeof oldDivisionsArray;
			} else {
				newDivisionsArray.splice(newDivisions, oldDivisions - newDivisions);
				crossSection.sampleMethod.divisionsArray = newDivisionsArray as typeof oldDivisionsArray;
			}
		} else {
			console.log('newDivisions', newDivisions);
			crossSection.sampleMethod.divisions = newDivisions;
		}
		commit();
	};

	// The Voronoi model sweeps its own cross section (voronoiConfig.crossSectionConfig);
	// projections sweep the polyhedron's crossSectionCurves. List both so the one
	// driving the visible model is always editable.
	let crossSections = $derived.by(() => {
		const config = $superConfigStore;
		const projectionSections =
			config.projectionConfigs[0].projectorConfig.polyhedron.crossSectionCurves.map(
				(crossSection, index) => ({ label: `Projection ${index}`, crossSection })
			);
		return config.voronoiConfig
			? [
					{ label: 'Voronoi', crossSection: config.voronoiConfig.crossSectionConfig },
					...projectionSections
				]
			: projectionSections;
	});

	// Sphere and capsule surfaces carry a numeric radius; globule and imported
	// surfaces have none, so it is undefined there and the slider max falls
	// back to 200.
	let surfaceRadius = $derived.by(() => {
		const surface = $superConfigStore.projectionConfigs[0].surfaceConfig;
		const radius = 'radius' in surface ? surface.radius : undefined;
		return typeof radius === 'number' ? radius : undefined;
	});
</script>

<Editor>
	{#each crossSections as { label, crossSection } (label)}
		<section class="cross-section-container">
			<header>{label}</header>
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
								commit();
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
								commit();
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
								{#each crossSection.sampleMethod.divisionsArray as division, index (index)}
									<div>{Math.round(division * 100) / 100}</div>
									<input
										type="range"
										min={0}
										max={1}
										step={0.001}
										value={division}
										oninput={(event) => {
											const { sampleMethod } = crossSection;
											if (sampleMethod.method !== 'manualDivisions') return;
											sampleMethod.divisionsArray[index] = Number(event.currentTarget.value);
											commit();
										}}
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
							max={surfaceRadius || 100 * 2}
							value={crossSection.scaling.width}
							oninput={(event) => {
								crossSection.scaling.width = Number(event.currentTarget.value);
								commit();
							}}
						/>
					</LabeledControl>
					<LabeledControl label={`Height: ${crossSection.scaling.height}`}>
						<input
							type="range"
							min={0}
							step={1}
							max={surfaceRadius || 100 * 2}
							value={crossSection.scaling.height}
							oninput={(event) => {
								crossSection.scaling.height = Number(event.currentTarget.value);
								commit();
							}}
						/>
					</LabeledControl>
					<LabeledControl label="Should Skew Curve:">
						<input
							type="checkbox"
							checked={crossSection.shouldSkewCurve}
							onchange={(event) => {
								crossSection.shouldSkewCurve = event.currentTarget.checked;
								commit();
							}}
						/>
					</LabeledControl>
				</Container>
			</Container>
		</section>
	{/each}
</Editor>

<style>
</style>
