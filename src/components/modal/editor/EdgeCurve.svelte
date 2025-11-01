<script lang="ts">
	import type {
		EdgeCurveConfig,
		ProjectionCurveSampleMethod
	} from '$lib/projection-geometry/types';
	import { superConfigStore, superGlobuleStore } from '$lib/stores';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import Button from '../../design-system/Button.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import LabeledControl from './LabeledControl.svelte';
	import {
		endPointsLockedY,
		endPointsMatchedX,
		flattenPolygon,
		getPolygonPaths,
		insertPoint,
		neighborPointMatch
	} from './path-editor';
	import PathEditor from './PathEditor.svelte';

	const handleChangeSampleMethod = (event: Event, config: EdgeCurveConfig) => {
		const newMethod = (event.target as HTMLSelectElement)
			.value as ProjectionCurveSampleMethod['method'];
		const divisions = config.sampleMethod.divisions;
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
		config.sampleMethod = newSampleMethod as EdgeCurveConfig['sampleMethod'];
		$superConfigStore = $superConfigStore;
	};

	const handleChangeDivisions = (newDivisions: number, config: EdgeCurveConfig) => {
		// const newDivisions = parseInt((event.target as HTMLInputElement).value);
		const oldDivisions = config.sampleMethod.divisions;
		if (config.sampleMethod.method === 'manualDivisions') {
			const oldDivisionsArray = config.sampleMethod.divisionsArray;
			const newDivisionsArray = [...oldDivisionsArray];
			if (oldDivisions < newDivisions) {
				const space = 1 - oldDivisionsArray[oldDivisionsArray.length - 1];
				newDivisionsArray.push(
					...Array.from(
						{ length: newDivisions - oldDivisions },
						(_, i) => (space / (newDivisions - oldDivisions)) * (i + 1)
					)
				);
				config.sampleMethod.divisionsArray = newDivisionsArray as any;
			} else {
				newDivisionsArray.splice(newDivisions, oldDivisions - newDivisions);
				config.sampleMethod.divisionsArray = newDivisionsArray as any;
			}
		} else {
			console.log('newDivisions', newDivisions);
			config.sampleMethod.divisions = newDivisions;
		}
		$superConfigStore = $superConfigStore;
	};

	let polygonIndex = 0;

	$: flattenedPolygon = flattenPolygon(
		$superGlobuleStore.projections[0].polyhedron.polygons[polygonIndex]
	);
	$: polygonPaths = getPolygonPaths(flattenedPolygon);
</script>

<Editor>
	{#each $superConfigStore.projectionConfigs[0].projectorConfig.polyhedron.edgeCurves as edgeCurve, edgeCurveIndex}
		<section class="cross-section-container">
			<header>{edgeCurveIndex}</header>
			<Container direction="row">
				<Container direction="column">
					<LabeledControl label="Polygon Index:">
						<NumberInput
							bind:value={polygonIndex}
							min={0}
							max={$superGlobuleStore.projections[0].polyhedron.polygons.length}
							step={1}
							hasButtons
						/>
					</LabeledControl>
					<svg width="200" height="200" viewBox="-100 -100 200 200">
						{#each polygonPaths as polygonPath}
							<path d={polygonPath} class="polygon-path" />
						{/each}
						{#each flattenedPolygon.edges as edge}
							{#each edge.edgePoints as edgePoint, edgePointIndex}
								<circle
									cx={edgePoint.x}
									cy={edgePoint.y}
									r="3"
									fill={`rgba(255, 0, 0, ${edgePointIndex / edge.edgePoints.length})`}
								/>
							{/each}
							{#each edge.curvePoints as curvePoint, curvePointIndex}
								<circle
									cx={curvePoint.x}
									cy={curvePoint.y}
									r="3"
									fill={`rgba(0, 0, 255, ${curvePointIndex / edge.curvePoints.length})`}
								/>
							{/each}
						{/each}
					</svg>
					<PathEditor
						curveDef={edgeCurve.curves}
						config={{
							gutter: 3,
							padding: 0.2,
							contentBounds: { top: 0, left: 0, width: 1, height: 1 },
							size: { width: 200, height: 200 }
						}}
						onChangeCurveDef={(curveDef) => {
							console.debug('EdgeCurve, onChangeCurveDef', curveDef);
							edgeCurve.curves = curveDef;
						}}
						limits={[endPointsLockedY, endPointsMatchedX, neighborPointMatch]}
					>
						<rect x="0" y="0" width="1" height="1" fill="rgba(0,0,0,0.1)" />
					</PathEditor>
					<Button
						on:click={() => {
							edgeCurve.curves = insertPoint(0, edgeCurve.curves, {
								type: 'PointConfig2',
								x: 0.5,
								y: 0.5
							});
						}}>Insert Point</Button
					>
				</Container>
				<Container direction="column">
					<LabeledControl label="Divisions:">
						<NumberInput
							value={edgeCurve.sampleMethod.divisions}
							onChange={(newValue) => {
								handleChangeDivisions(newValue, edgeCurve);
							}}
							min={2}
							step={1}
							hasButtons
						/>
					</LabeledControl>

					<LabeledControl label="Method:">
						<select
							value={edgeCurve.sampleMethod.method}
							on:change={(event) => handleChangeSampleMethod(event, edgeCurve)}
						>
							<option value="manualDivisions">Manual</option>
							<option value="divideCurvePath">Divide Curve</option>
						</select>
					</LabeledControl>
					<LabeledControl
						label="Divide at:"
						show={edgeCurve.sampleMethod.method === 'manualDivisions'}
					>
						{#if edgeCurve.sampleMethod.method === 'manualDivisions'}
							<LabeledControl label="Divide at:">
								{#each edgeCurve.sampleMethod.divisionsArray as division, index}
									<div>{Math.round(division * 100) / 100}</div>
									<input
										type="range"
										min={0}
										max={1}
										step={0.001}
										bind:value={edgeCurve.sampleMethod.divisionsArray[index]}
									/>
								{/each}
							</LabeledControl>
						{/if}
					</LabeledControl>
				</Container>
			</Container>
		</section>
	{/each}
	</Editor>

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
	.polygon-path {
		fill: rgba(108, 65, 177, 0.221);
		stroke: rgba(108, 65, 177, 0.6);
		stroke-width: 2;
	}
</style>
