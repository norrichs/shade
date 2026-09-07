<script lang="ts">
	import { T } from '@threlte/core';
	import { interactivity, MeshLineGeometry, MeshLineMaterial } from '@threlte/extras';
	import {
		superGlobuleBandGeometryStore as geometryStore,
		selectedBand,
		superConfigStore,
		model3dExtremesStore,
		showMeasureIndicators,
		type BandSelection
	} from '$lib/stores';
	import { get } from 'svelte/store';
	import GlobuleMesh from '../globuleMesh/GlobuleMesh.svelte';
	import type {
		AxisExtremes,
		BandAddressed,
		BandGeometry,
		GeometryAddress,
		GlobuleGeometry
	} from '$lib/types';
	import DesignerCamera from './DesignerCamera.svelte';
	import DesignerLighting from './DesignerLighting.svelte';
	import {
		interactionMode,
		isBandSelectInteractionMode,
		isMeasureInteractionMode,
		isPointSelectInteractionMode,
		type InteractionMode
	} from './interaction-mode';
	import { nearestVertexFromEvent } from './nearest-vertex';
	import {
		addMeasurementPoint,
		clearMeasurements,
		measurements
	} from '$lib/stores/measurementStore';
	import { getNearestPoint } from '$lib/generate-globulegeometry';
	import { BufferGeometry, Vector3 } from 'three';
	import { materials } from './materials';
	import { generateTempId } from '$lib/id-handler';
	import TransformDisplay from './TransformDisplay.svelte';
	import {
		includesBandAddress,
		includesGlobuleCoordinates,
		isSameBand,
		isSameGlobule
	} from '$lib/matchers';
	import { formatAddress } from '$lib/recombination';
	import { PROJECTION_GEOMETRY_OVERRIDE } from '$lib/projection-geometry/constants';
	import ProjectionGeometryComponent from '../projection/ProjectionGeometryComponent.svelte';
	import GlobuleGeometryComponent from './GlobuleGeometryComponent.svelte';
	import Highlight from '../projection/Highlight.svelte';
	import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';
	import { selectedProjection } from '$lib/stores';
	import { cameraDirection } from '$lib/stores/selectionStores';
	import type { Material } from './materials';

	// Raise the click-distance tolerance: OrbitControls shares the canvas, and a
	// touchpad tap drifts a few pixels between press and release. With the default
	// 8px gate, that drift makes Threlte classify the tap as a drag (camera orbit)
	// rather than a click, so facet selection never fires. 25px keeps real clicks
	// working while still rejecting genuine drags.
	interactivity({ clickDistanceThreshold: 25 });

	const CLICK_DELTA_THRESHOLD = 10;

	// Measurement points are snapped to model vertices, and vertex identity is
	// not stable across a geometry regeneration, so stale points must be
	// cleared whenever the geometry changes. This can't live in
	// measurementStore.ts itself: wiring a subscription to the geometry store
	// there closes an import cycle (measurementStore -> superGlobuleStores ->
	// meta-info -> stores/index -> selectionStores -> back to
	// superGlobuleStores' exports) — see the note at the bottom of
	// measurementStore.ts. Scene.svelte already imports geometryStore
	// (superGlobuleBandGeometryStore) to render the scene, so it sits
	// downstream of both stores and can safely bridge them here instead.
	// Keyed on geometryStore specifically (not the pattern/pattern-layout
	// stores) so measurements survive pattern changes and clear only on an
	// actual geometry regeneration. Skips its first run so mounting the scene
	// does not wipe measurements made before a remount.
	let isFirstGeometryEffectRun = true;
	$effect(() => {
		void $geometryStore;
		if (isFirstGeometryEffectRun) {
			isFirstGeometryEffectRun = false;
			return;
		}
		clearMeasurements();
	});

	const selectBand = ({
		coord,
		coordStack,
		address,
		globuleConfigId,
		subGlobuleConfigId,
		globuleIndex,
		bandIndex
	}: BandGeometry) => {
		const geometryStoreValue = get(geometryStore);
		if (geometryStoreValue.variant === 'Band') {
			const config = get(superConfigStore);
			const subGlobuleConfigIndex =
				config.subGlobuleConfigs.findIndex(
					(subGlobuleConfig) => subGlobuleConfig.id === subGlobuleConfigId
				) || 0;
			const newSelection: BandSelection = {
				subGlobuleConfigIndex,
				selection: ['active'],
				coord,
				coordStack,
				address,
				subGlobuleConfigId,
				globuleId: globuleConfigId,
				subGlobuleGeometryIndex: globuleIndex,
				bandIndex
			};

			const mode = get(interactionMode);
			if (isBandSelectInteractionMode(mode) && mode.type === 'band-select') {
				const { pick, bands } = mode.data;
				if (bands.length < pick) {
					mode.data.bands = [...bands, newSelection];
				} else {
					mode.data.bands = [bands[bands.length - 1], newSelection];
				}
				interactionMode.set(mode);
			} else if (mode.type === 'band-select-partners') {
				const { pick, originHighlight, originSelected, partnerHighlight, partnerSelected } =
					mode.data;
				if (!originSelected) {
					if (isInOrigin(originHighlight, newSelection)) {
						mode.data.originSelected = newSelection;
					}
				} else if (!partnerSelected && !isInOrigin(originHighlight, newSelection)) {
					mode.data.partnerSelected = newSelection;
				}
				interactionMode.set(mode);
			} else if (mode.type === 'band-select-multiple') {
				const newSelectedBand: BandSelection = {
					selection: ['highlighted'],
					address,
					subGlobuleConfigIndex,
					coord
				};
				const alreadySelectedIndex = mode.data.bands.findIndex((bandSelection) =>
					isSameBand(bandSelection.address, newSelectedBand.address)
				);
				if (alreadySelectedIndex === -1) {
					mode.data.bands = [newSelectedBand, ...mode.data.bands];
					interactionMode.set(mode);
					return;
				}
				mode.data.bands.splice(alreadySelectedIndex, 1);
				mode.data.bands = [...mode.data.bands];
				interactionMode.set(mode);
			}
		}
	};

	const isInOrigin = (origin: BandSelection[], newSelection: BandSelection) => {
		return origin.some((bandSelection) =>
			isSameGlobule(bandSelection.address, newSelection.address)
		);
	};

	const isSelectedBand = (bandGeometry: BandGeometry, mode: InteractionMode): Material => {
		if (isBandSelectInteractionMode(mode) && mode.type === 'band-select') {
			return !!mode.data.bands.some(
				({ subGlobuleGeometryIndex, bandIndex }) =>
					bandGeometry.globuleIndex === subGlobuleGeometryIndex &&
					bandGeometry.bandIndex === bandIndex
			)
				? 'selected'
				: 'default';
		}
		return 'default';
	};

	const standardSelect = (geometry: BandGeometry) => {
		selectedBand.set(geometry.address);
	};

	const selectPoint = (event: any, geometry: BandGeometry) => {
		const mode = get(interactionMode);
		if (!isPointSelectInteractionMode(mode)) return;

		const { pick, points } = mode.data;
		const point = getNearestPoint(event.point, geometry);

		points.unshift(point);
		const newPoints = points.slice(0, pick);
		mode.data.points = [...newPoints];
		interactionMode.set(mode);
	};

	const handleClick = (event: any, geometry: BandGeometry) => {
		event.stopPropagation();

		if (event.delta > CLICK_DELTA_THRESHOLD) return;

		const mode = get(interactionMode);
		if (mode.type === 'standard') {
			standardSelect(geometry);
		} else if (isBandSelectInteractionMode(mode)) {
			selectBand(geometry);
		} else if (isMeasureInteractionMode(mode)) {
			// Measurement collects an unbounded list of pairs, so it must not go
			// through selectPoint's fixed-size ring buffer. isPointSelectInteractionMode
			// also matches this mode (it checks a 'point-select' prefix), so this
			// branch must come first.
			const vertex = nearestVertexFromEvent(event);
			if (vertex) addMeasurementPoint(vertex);
		} else if (isPointSelectInteractionMode(mode)) {
			selectPoint(event, geometry);
		}
	};
	const handleProjectionClick = (event: any, address: GlobuleAddress_Facet) => {
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
	// once (rather than via GlobuleMesh, which holds its BufferGeometry in
	// $state) avoids Svelte proxying a Three.js object whose per-frame mutations
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

	const getInteractionMaterial = (
		band: BandGeometry,
		mode: InteractionMode,
		selectedBandValue: GeometryAddress<BandAddressed>
	): Material => {
		if (mode.type === 'band-select-partners') {
			const { originSelected, partnerSelected, originHighlight } = mode.data;
			if (originSelected && isSameBand(originSelected.address, band.address)) {
				return 'selected';
			} else if (partnerSelected && isSameBand(partnerSelected.address, band.address)) {
				return 'selected';
			} else if (
				originHighlight.some((bs) => {
					return includesGlobuleCoordinates(band.coordStack, bs.coord);
				})
			) {
				return 'highlightedPrimary';
			} else {
				return 'default';
			}
		} else if (mode.type === 'standard') {
			if (selectedBandValue && isSameBand(selectedBandValue, band.address)) return 'selected';
			if (selectedBandValue && isSameGlobule(selectedBandValue, band.address))
				return 'selectedLight';
			if (selectedBandValue && selectedBandValue.s === band.address.s) return 'selectedVeryLight';
		} else if (mode.type === 'band-select-multiple') {
			if (includesBandAddress(mode.data.bands, band.address)) {
				return 'highlightedPrimary';
			}
		}
		return isSelectedBand(band, mode);
	};
</script>

<div>{formatAddress($selectedBand)}</div>
<DesignerCamera direction={$cameraDirection ?? undefined} />
<DesignerLighting />

<TransformDisplay />
{#if isPointSelectInteractionMode($interactionMode) && !isMeasureInteractionMode($interactionMode)}
	{#each $interactionMode.data.points as point, i (i)}
		<T.Group position={[point.x, point.y, point.z]}>
			<GlobuleMesh geometry={indicator} material="default" />
		</T.Group>
	{/each}
{/if}

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
<GlobuleGeometryComponent {getInteractionMaterial} {handleClick} />
<Highlight />
