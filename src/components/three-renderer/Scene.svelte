<script lang="ts">
	import { T } from '@threlte/core';
	import { interactivity, MeshLineGeometry, MeshLineMaterial } from '@threlte/extras';
	import {
		superGlobuleBandGeometryStore as geometryStore,
		selectedBand,
		superConfigStore,
		type BandSelection
	} from '$lib/stores';
	import GlobuleMesh from '../globuleMesh/GlobuleMesh.svelte';
	import type { BandAddressed, BandGeometry, GeometryAddress, GlobuleGeometry } from '$lib/types';
	import DesignerCamera from './DesignerCamera.svelte';
	import DesignerLighting from './DesignerLighting.svelte';
	import {
		interactionMode,
		isBandSelectInteractionMode,
		isPointSelectInteractionMode,
		type InteractionMode
	} from './interaction-mode';
	import { getNearestPoint } from '$lib/generate-globulegeometry';
	import { Vector3 } from 'three';
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
	import type { ProjectionAddress_Facet } from '$lib/projection-geometry/types';
	import { selectedProjection } from '$lib/stores';
	import type { Material } from './materials';

	interactivity();

	const CLICK_DELTA_THRESHOLD = 10;

	const selectBand = ({
		coord,
		coordStack,
		address,
		globuleConfigId,
		subGlobuleConfigId,
		globuleIndex,
		bandIndex
	}: BandGeometry) => {
		console.debug('selectBand', address, subGlobuleConfigId);
		if ($geometryStore.variant === 'Band') {
			const subGlobuleConfigIndex =
				$superConfigStore.subGlobuleConfigs.findIndex(
					(subGlobuleConfig) => subGlobuleConfig.id === subGlobuleConfigId
				) || 0;
			// const subGlobuleGeometryIndex = $geometryStore.subGlobules.findIndex(
			// 	(glob) => glob[0].subGlobuleConfigId === subGlobuleConfigId && glob[0].coord.r === coord.r
			// );
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

			if (
				isBandSelectInteractionMode($interactionMode) &&
				$interactionMode.type === 'band-select'
			) {
				const { pick, bands } = $interactionMode.data;
				if (bands.length < pick) {
					$interactionMode.data.bands = [...bands, newSelection];
				} else {
					$interactionMode.data.bands = [bands[bands.length - 1], newSelection];
				}
			} else if ($interactionMode.type === 'band-select-partners') {
				const { pick, originHighlight, originSelected, partnerHighlight, partnerSelected } =
					$interactionMode.data;
				if (!originSelected) {
					if (isInOrigin(originHighlight, newSelection)) {
						$interactionMode.data.originSelected = newSelection;
					}
				} else if (!partnerSelected && !isInOrigin(originHighlight, newSelection)) {
					$interactionMode.data.partnerSelected = newSelection;
				}
			} else if ($interactionMode.type === 'band-select-multiple') {
				const newSelectedBand: BandSelection = {
					selection: ['highlighted'],
					address,
					subGlobuleConfigIndex,
					coord
				};
				const alreadySelectedIndex = $interactionMode.data.bands.findIndex((bandSelection) =>
					isSameBand(bandSelection.address, newSelectedBand.address)
				);
				if (alreadySelectedIndex === -1) {
					$interactionMode.data.bands = [newSelectedBand, ...$interactionMode.data.bands];
					return;
				}
				$interactionMode.data.bands.splice(alreadySelectedIndex, 1);
				$interactionMode.data.bands = [...$interactionMode.data.bands];
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
		$selectedBand = geometry.address;
	};

	const selectPoint = (event: any, geometry: BandGeometry) => {
		if (!isPointSelectInteractionMode($interactionMode)) return;

		const { pick, points } = $interactionMode.data;
		const point = getNearestPoint(event.point, geometry);

		points.unshift(point);
		const newPoints = points.slice(0, pick);
		$interactionMode.data.points = [...newPoints];
	};

	const handleClick = (event: any, geometry: BandGeometry) => {
		console.debug('handleClick', { event, geometry });
		event.stopPropagation();

		if (event.delta > CLICK_DELTA_THRESHOLD) return;

		if ($interactionMode.type === 'standard') {
			standardSelect(geometry);
		} else if (isBandSelectInteractionMode($interactionMode)) {
			selectBand(geometry);
		} else if (isPointSelectInteractionMode($interactionMode)) {
			selectPoint(event, geometry);
		}
	};
	const handleProjectionClick = (event: any, address: ProjectionAddress_Facet) => {
		console.debug('handleProjectionClick', { event, address });
		event.stopPropagation();
		$selectedProjection = address;
		console.debug({ event, address });
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

	const getInteractionMaterial = (
		band: BandGeometry,
		mode: InteractionMode,
		selectedBand: GeometryAddress<BandAddressed>
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
			if ($selectedBand && isSameBand($selectedBand, band.address)) return 'selected';
			if ($selectedBand && isSameGlobule($selectedBand, band.address)) return 'selectedLight';
			if ($selectedBand && $selectedBand.s === band.address.s) return 'selectedVeryLight';
		} else if (mode.type === 'band-select-multiple') {
			if (includesBandAddress(mode.data.bands, band.address)) {
				return 'highlightedPrimary';
			}
		}
		return isSelectedBand(band, mode);
	};
</script>

<div>{formatAddress($selectedBand)}</div>
<DesignerCamera />
<DesignerLighting />

<TransformDisplay />
{#if isPointSelectInteractionMode($interactionMode)}
	{#each $interactionMode.data.points as point}
		<T.Group position={[point.x, point.y, point.z]}>
			<GlobuleMesh geometry={indicator} material="default" />
		</T.Group>
	{/each}
{/if}
<ProjectionGeometryComponent onClick={handleProjectionClick} />
<GlobuleGeometryComponent {getInteractionMaterial} {handleClick} />
