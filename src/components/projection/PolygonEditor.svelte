<script lang="ts">
	import { editCrossSection, editPolygon } from '$lib/projection-geometry/edit-projection';
	import PathEditor from './PathEditor.svelte';
	import { superConfigStore } from '$lib/stores';
	import { Vector2, type CubicBezierCurve, type CurvePath } from 'three';
	import {
		getCrossSectionScale,
		mapPointsFromTriangle
	} from '$lib/projection-geometry/generate-projection';
	import type { BezierConfig, PointConfig2 } from '$lib/types';
	import type {
		BaseProjectionConfig,
		CrossSectionConfig,
		EdgeCurveConfig
	} from '$lib/projection-geometry/types';
	import EdgeControls from './EdgeControls.svelte';
	import { getCrossSection } from '$lib/projection-geometry/functions';

	type PolygonEditorMode = 'widthCurve' | 'crossSectionCurve';

	export let projectionIndex;
	let polygonIndex: number = 0;
	let widthCurves: CurvePath<Vector2>[] = [];
	let crossSectionCurve: CurvePath<Vector2>;

	let edgeFills: string[] = [];
	let selectedEdgeIndex: number | undefined = undefined;
	let mode: PolygonEditorMode = 'widthCurve';

	const PADDING = 30;
	const canv = {
		minX: -200,
		minY: -200,
		maxX: 200,
		maxY: 200
	};

	let polyhedronConfig =
		$superConfigStore.projectionConfigs[projectionIndex].projectorConfig.polyhedron;
	let polygonConfig = polyhedronConfig.polygons[polygonIndex];
	let polygon = editPolygon.get({
		config: $superConfigStore.projectionConfigs[projectionIndex],
		polygonIndex,
		editContext: {
			canvas: canv,
			padding: PADDING
		}
	});

	const onChangeWidthCurves = ({
		changed,
		edge,
		indices,
		reversed,
		final
	}: {
		changed: CurvePath<Vector2>[];
		edge: { vertex0: Vector2; vertex1: Vector2 };
		indices: { edge: number; curve: number };
		reversed: boolean;
		final: boolean;
	}) => {
		const { polyhedron } = $superConfigStore.projectionConfigs[projectionIndex].projectorConfig;
		const edgeCurveIndex = polyhedron.polygons[polygonIndex].edges[indices.edge].widthCurve;
		const newCurveDef = buildNewEdgeCurveDef(changed, edge, indices, reversed);

		const updatedConfig = { ...$superConfigStore.projectionConfigs[projectionIndex] };
		updatedConfig.projectorConfig.polyhedron.edgeCurves[edgeCurveIndex].curves = newCurveDef;

		polygon = editPolygon.get({
			config: updatedConfig,
			polygonIndex,
			editContext: {
				canvas: canv,
				padding: PADDING
			}
		});

		widthCurves = polygon.edges.map((edge) => edge.widthCurve.curves);
		if (final) {
			$superConfigStore.projectionConfigs[projectionIndex].projectorConfig.polyhedron.edgeCurves[
				edgeCurveIndex
			].curves = newCurveDef;
		}
	};

	const onChangeCrossSectionCurves = ({
		changed,
		final
	}: {
		changed: CurvePath<Vector2>[];
		final: boolean;
	}) => {
		if (!final) return;
		if (!selectedEdgeIndex || changed.length > 1)
			throw Error('onChangeCrossSectionCurves - selectedEdgeIndex required');

		const { crossSectionIndex, crossSectionDef: oldCrossSectionDef } = getCrossSection(
			$superConfigStore.projectionConfigs,
			[projectionIndex, polygonIndex, selectedEdgeIndex]
		);
		const newCurveDef = buildNewCrossSectionDef(changed[0], oldCrossSectionDef);
		$superConfigStore.projectionConfigs[
			projectionIndex
		].projectorConfig.polyhedron.crossSectionCurves[crossSectionIndex] = newCurveDef;
	};

	const toggleEditorMode = () => {
		mode = mode === 'widthCurve' ? 'crossSectionCurve' : 'widthCurve';
		if (mode === 'crossSectionCurve' && selectedEdgeIndex !== undefined) {
			const address: [number, number, number] = [projectionIndex, polygonIndex, selectedEdgeIndex];
			const { crossSectionDef, crossSectionIndex } = getCrossSection(
				$superConfigStore.projectionConfigs,
				address
			);
			console.debug('toggleEditorMode', mode, crossSectionDef);
			const editableCrossSection = editCrossSection.get({
				config: $superConfigStore.projectionConfigs[projectionIndex],
				editContext: {
					canvas: canv,
					padding: PADDING
				},
				polygonIndex,
				edgeIndex: selectedEdgeIndex
			});
			crossSectionCurve = editableCrossSection.curves;
		}
	};

	const buildNewCrossSectionDef = (
		changed: CurvePath<Vector2>,
		oldCrossSectionDef: CrossSectionConfig
	) => {
		const { xScale, yScale } = getCrossSectionScale(oldCrossSectionDef.scaling);
		const newCurves: BezierConfig[] = (changed.curves as CubicBezierCurve[]).map(
			({ v0, v1, v2, v3 }) => {
				return {
					type: 'BezierConfig',
					points: [
						{ type: 'PointConfig2', x: v0.x / xScale, y: v0.y / yScale },
						{ type: 'PointConfig2', x: v1.x / xScale, y: v1.y / yScale },
						{ type: 'PointConfig2', x: v2.x / xScale, y: v2.y / yScale },
						{ type: 'PointConfig2', x: v3.x / xScale, y: v3.y / yScale }
					]
				};
			}
		);
		const newCrossSectionDef = {
			...oldCrossSectionDef,
			curves: newCurves
		};
		return newCrossSectionDef;
	};

	const buildNewEdgeCurveDef = (
		changed: CurvePath<Vector2>[],
		edge: { vertex0: Vector2; vertex1: Vector2 },
		indices: { edge: number; curve: number },
		reversed: boolean
	): BezierConfig[] => {
		const curves = reversed
			? (changed[indices.edge].curves as CubicBezierCurve[])
			: (changed[indices.edge].curves as CubicBezierCurve[]);
		const center = new Vector2(0, 0);
		return curves.map(({ v0, v1, v2, v3 }) => {
			return {
				type: 'BezierConfig',
				points: mapPointsFromTriangle(
					{ a: edge.vertex0, b: edge.vertex1, c: center },
					reversed ? [v3, v2, v1, v0] : [v0, v1, v2, v3],
					true
				) as [PointConfig2, PointConfig2, PointConfig2, PointConfig2]
			};
		});
	};

	const update = (config: BaseProjectionConfig, pIndex: number) => {
		polygonConfig =
			$superConfigStore.projectionConfigs[projectionIndex].projectorConfig.polyhedron.polygons[
				pIndex
			];

		polygon = editPolygon.get({
			config,
			polygonIndex: pIndex,
			editContext: {
				canvas: canv,
				padding: PADDING
			}
		});

		console.debug('EDITABLE POLYGON', polygon);

		edgeFills = polygon.edges.map((edge) => {
			const curves = edge.widthCurve.curves.curves.flat() as CubicBezierCurve[];
			const starter = `M ${edge.vertex1.x} ${edge.vertex1.y} L ${edge.vertex0.x} ${edge.vertex0.y} L ${curves[0].v0.x} ${curves[0].v0.y}`;

			return curves.reduce((path, { v1, v2, v3 }) => {
				return `${path} C ${v1.x} ${v1.y} ${v2.x} ${v2.y} ${v3.x} ${v3.y}`;
			}, starter);
		});
		widthCurves = polygon.edges.map((edge) => edge.widthCurve.curves);
		console.debug('update PolygonEditor', { widthCurves });
	};
	$: projectionConfig = $superConfigStore.projectionConfigs[projectionIndex];
	$: update(projectionConfig, polygonIndex);
</script>

<section>
	<PathEditor
		{polygon}
		{canv}
		mode={mode === 'widthCurve' ? 'edit' : 'mini'}
		curves={widthCurves}
		onChangeCurves={onChangeWidthCurves}
	>
		<g slot="polygon-border">
			<g class="polygon-border" stroke-width={2}>
				{#each polygon.edges as e}
					<path
						d={`M ${e.vertex0.x} ${e.vertex0.y} L ${e.vertex1.x} ${e.vertex1.y}`}
						stroke={e.isDirectionMatched ? 'black' : 'red'}
						class="polygon-edge"
					/>
				{/each}
			</g>
		</g>

		<g slot="polygon-fill">
			{#each edgeFills as edgePath, edgeIndex}
				<path
					d={edgePath}
					stroke="none"
					class={`polygon-fill ${edgeIndex === selectedEdgeIndex ? 'selected' : ''}`}
					on:click={() => {
						if (selectedEdgeIndex === edgeIndex) {
							selectedEdgeIndex = undefined;
							mode = 'widthCurve';
							return;
						}
						selectedEdgeIndex = edgeIndex;
					}}
					role="button"
					tabindex="0"
					on:keydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							if (selectedEdgeIndex === edgeIndex) {
								selectedEdgeIndex = undefined;
								mode = 'widthCurve';
								return;
							}
							selectedEdgeIndex = edgeIndex;
						}
					}}
				/>
			{/each}
		</g>
	</PathEditor>
	{#if mode === 'crossSectionCurve'}
		<PathEditor
			{polygon}
			{canv}
			mode={'edit'}
			curves={[crossSectionCurve]}
			onChangeCurves={onChangeCrossSectionCurves}
		/>
	{/if}
	<EdgeControls address={[projectionIndex, polygonIndex, selectedEdgeIndex]} {toggleEditorMode} />
</section>
<div>
	<input
		type="number"
		bind:value={polygonIndex}
		min={0}
		max={projectionConfig.projectorConfig.polyhedron.polygons.length - 1}
		step={1}
	/>
	<div>
		<span>Edge divisions</span>
		<input
			type="number"
			bind:value={$superConfigStore.projectionConfigs[projectionIndex].projectorConfig.polyhedron
				.edgeCurves[polygonConfig.edges[0].widthCurve].sampleMethod.divisions}
			min={0}
			step={1}
		/>
	</div>
	<div>
		<span>Cross section divisions</span>
		<input
			type="number"
			bind:value={$superConfigStore.projectionConfigs[projectionIndex].projectorConfig.polyhedron
				.crossSectionCurves[polygonConfig.edges[0].crossSectionCurve].sampleMethod.divisions}
			min={0}
			step={1}
		/>
	</div>
</div>

<style>
	section {
		display: flex;
		flex-direction: row;
	}

	.polygon-fill {
		transition: 200ms;
		fill: rgba(100, 0, 200, 0.5);
	}
	.polygon-fill:focus {
		outline: none;
	}
	.polygon-fill.selected {
		fill: rgba(100, 0, 200, 1);
	}
	.polygon-fill:hover {
		transition: 200ms;
		fill: rgba(100, 0, 200, 1);
	}
</style>
