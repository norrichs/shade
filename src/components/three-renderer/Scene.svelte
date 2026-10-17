<script lang="ts">
	import { T } from '@threlte/core';
	import { interactivity } from '@threlte/extras';
	import {
		superGlobuleStore,
		model3dExtremesStore,
		showMeasureIndicators
	} from '#lib/stores/index.js';
	import type { AxisExtremes, GlobuleGeometry } from '#lib/types.js';
	import DesignerCamera from './DesignerCamera.svelte';
	import DesignerLighting from './DesignerLighting.svelte';
	import { clearMeasurements, measurements } from '#lib/stores/measurementStore.js';
	import { BufferGeometry, Vector3 } from 'three';
	import { materials } from './materials';
	import { generateTempId } from '#lib/id-handler.js';
	import ProjectionGeometryComponent from '../projection/ProjectionGeometryComponent.svelte';
	import Highlight from '../projection/Highlight.svelte';
	import type { GlobuleAddress_Facet } from '#lib/projection-geometry/types.js';
	import { selectedProjection } from '#lib/stores/index.js';
	import { cameraDirection } from '#lib/stores/selectionStores.js';
	import type { Material } from './materials';

	// Raise the click-distance tolerance: OrbitControls shares the canvas, and a
	// touchpad tap drifts a few pixels between press and release. With the default
	// 8px gate, that drift makes Threlte classify the tap as a drag (camera orbit)
	// rather than a click, so facet selection never fires. 25px keeps real clicks
	// working while still rejecting genuine drags.
	interactivity({ clickDistanceThreshold: 25 });

	// Measurement points are snapped to model vertices, and vertex identity is
	// not stable across a geometry regeneration, so stale points must be
	// cleared whenever the geometry changes. This can't live in
	// measurementStore.ts itself: wiring a subscription to the geometry store
	// there closes an import cycle (measurementStore -> superGlobuleStores ->
	// meta-info -> stores/index -> selectionStores -> back to
	// superGlobuleStores' exports) — see the note at the bottom of
	// measurementStore.ts. Scene.svelte sits downstream of both stores and can
	// safely bridge them here instead. Keyed on superGlobuleStore specifically
	// (not the pattern/pattern-layout stores) so measurements survive pattern
	// changes and clear only on an actual geometry regeneration. Skips its first
	// run so mounting the scene does not wipe measurements made before a remount.
	let isFirstGeometryEffectRun = true;
	$effect(() => {
		void $superGlobuleStore;
		if (isFirstGeometryEffectRun) {
			isFirstGeometryEffectRun = false;
			return;
		}
		clearMeasurements();
	});

	const handleProjectionClick = (
		event: { stopPropagation: () => void },
		address: GlobuleAddress_Facet
	) => {
		event.stopPropagation();
		selectedProjection.set(address);
	};

	const indicator: GlobuleGeometry = {
		type: 'GlobuleGeometry',
		globuleConfigId: generateTempId('cfg'),
		points: [
			new Vector3(0, 0, 0),
			new Vector3(0, 0, 100),
			new Vector3(0, 10, 100),
			new Vector3(0, 0, 0),
			new Vector3(0, 0, 100),
			new Vector3(10, 10, 100),
			new Vector3(0, 0, 0),
			new Vector3(10, 10, 100),
			new Vector3(10, 0, 100)
		]
	};

	// Static, non-reactive geometry for the measurement indicators. Building it
	// once (rather than holding a BufferGeometry in $state) avoids Svelte proxying a Three.js object whose per-frame mutations
	// would feed back as reactive invalidations and trip effect_update_depth.
	const indicatorGeometry = new BufferGeometry().setFromPoints(indicator.points);
	indicatorGeometry.computeVertexNormals();

	// Matched extent pairs as placeable, colour-coded indicators
	// (x = red, y = green, z = blue). The indicator apex sits at the measured
	// point so it marks the exact mesh vertex feeding `model3dBoundsStore`.
	const measureIndicators = (ex: AxisExtremes): { point: Vector3; material: Material }[] => [
		{ point: ex.x[0], material: 'axisX' },
		{ point: ex.x[1], material: 'axisX' },
		{ point: ex.y[0], material: 'axisY' },
		{ point: ex.y[1], material: 'axisY' },
		{ point: ex.z[0], material: 'axisZ' },
		{ point: ex.z[1], material: 'axisZ' }
	];
</script>

<DesignerCamera direction={$cameraDirection ?? undefined} />
<DesignerLighting />

{#if $showMeasureIndicators && $model3dExtremesStore}
	{#each measureIndicators($model3dExtremesStore) as { point, material }, i (i)}
		<T.Group position={[point.x, point.y, point.z]}>
			<T.Mesh geometry={indicatorGeometry} material={materials[material]} />
		</T.Group>
	{/each}
{/if}

{#each $measurements as measurement (measurement.id)}
	<T.Group position={[measurement.a.x, measurement.a.y, measurement.a.z]}>
		<T.Mesh
			geometry={indicatorGeometry}
			material={measurement.b ? materials.measureMatched : materials.measurePending}
		/>
	</T.Group>
	{#if measurement.b}
		<T.Group position={[measurement.b.x, measurement.b.y, measurement.b.z]}>
			<T.Mesh geometry={indicatorGeometry} material={materials.measureMatched} />
		</T.Group>
	{/if}
{/each}

<ProjectionGeometryComponent onClick={handleProjectionClick} />
<Highlight />
