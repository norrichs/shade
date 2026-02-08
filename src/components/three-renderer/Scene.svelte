<script lang="ts">
	import { T } from '@threlte/core';
	import { interactivity, MeshLineGeometry, MeshLineMaterial } from '@threlte/extras';
	import {
		superGlobuleBandGeometryStore as geometryStore,
		selectedBand,
		superConfigStore,
		type BandSelection
	} from '$lib/stores';
	import { get } from 'svelte/store';
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
	import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';
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
			if (
				isBandSelectInteractionMode(mode) &&
				mode.type === 'band-select'
			) {
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
			if (selectedBandValue && isSameGlobule(selectedBandValue, band.address)) return 'selectedLight';
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
