<script lang="ts">
	import { T } from '@threlte/core';
	import { interactivity, MeshLineGeometry, MeshLineMaterial } from '@threlte/extras';
	import {
		superGlobuleBandGeometryStore as geometryStore,
		selectedGlobule,
		selectedBand,
		superConfigStore,
		type BandSelection
	} from '$lib/stores';
	import GlobuleMesh from '../globuleMesh/GlobuleMesh.svelte';
	import type { BandGeometry, GlobuleGeometry, Id } from '$lib/types';
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
	import { isBand } from '$lib/generate-shape';
	import type { Material } from './materials';
	import { mod } from 'three/webgpu';
	import {
		includesGlobuleCoordinates,
		isSameBand,
		isSameGlobule,
		matchBandConfigCoordinates,
		matchGlobuleConfigCoordinates
	} from '$lib/matchers';

	interactivity();

	const CLICK_DELTA_THRESHOLD = 10;

	const selectGlobule = ({
		globuleConfigId,
		subGlobuleConfigId,
		subGlobuleRecurrence
	}: GlobuleGeometry) => {
		if ($geometryStore.variant === 'Globule') {
			const subGlobuleConfigIndex =
				$superConfigStore.subGlobuleConfigs.findIndex(
					(subGlobuleConfig) => subGlobuleConfig.id === subGlobuleConfigId
				) || 0;
			const subGlobuleGeometryIndex = $geometryStore.subGlobules.findIndex(
				(glob) =>
					glob.subGlobuleConfigId === subGlobuleConfigId &&
					glob.subGlobuleRecurrence === subGlobuleRecurrence
			);

			$selectedGlobule = {
				subGlobuleConfigIndex,
				subGlobuleConfigId,
				subGlobuleGeometryIndex,
				globuleId: globuleConfigId
			};
		}
	};

	const BAND_SELECTION_LENGTH = 2;

	const isBandSelectOrigin = (mode: InteractionMode) => {
		return (
			isBandSelectInteractionMode(mode) &&
			mode.type === 'band-select-partners' &&
			mode.data.originSelected === undefined
		);
	};

	const selectBand = ({
		coord,
		coordStack,
		address,
		globuleConfigId,
		subGlobuleConfigId,
		globuleIndex,
		bandIndex
	}: BandGeometry) => {
		if ($geometryStore.variant === 'Band') {
			console.debug('selectBand', coord, coordStack);
			const subGlobuleConfigIndex =
				$superConfigStore.subGlobuleConfigs.findIndex(
					(subGlobuleConfig) => subGlobuleConfig.id === subGlobuleConfigId
				) || 0;
			const subGlobuleGeometryIndex = $geometryStore.subGlobules.findIndex(
				(glob) => glob[0].subGlobuleConfigId === subGlobuleConfigId && glob[0].coord.r === coord.r
			);
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
				console.debug('doing band-select-partners');
				const { pick, originHighlight, originSelected, partnerHighlight, partnerSelected } =
					$interactionMode.data;
				if (!originSelected) {
					console.debug('isBandSelectOrigin', { newSelection, originHighlight });

					if (isInOrigin(originHighlight, newSelection)) {
						console.debug('isInOrigin', newSelection);
						$interactionMode.data.originSelected = newSelection;
					}
				} else if (!partnerSelected && !isInOrigin(originHighlight, newSelection)) {
					console.debug('select partner band');
					$interactionMode.data.partnerSelected = newSelection;
				} else {
					console.debug('neither origin nor partner?', { $interactionMode, newSelection });
				}
			} else {
				console.debug(
					'not isBandSelectOrigin, or not band-select-partners',
					$interactionMode,
					isBandSelectOrigin($interactionMode)
				);
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

	const handleClick = (event: any, geometry: GlobuleGeometry | BandGeometry) => {
		event.stopPropagation();

		if (event.delta > CLICK_DELTA_THRESHOLD) return;
		if ($interactionMode.type === 'standard' || isBandSelectInteractionMode($interactionMode)) {
			if (geometry.type === 'GlobuleGeometry') {
				selectGlobule(geometry);
			} else {
				selectBand(geometry);
			}
		} else if ($interactionMode.type.startsWith('point-select')) {
			const { pick, points } = $interactionMode.data;
			const point = getNearestPoint(event.point, geometry);

			points.unshift(point);
			const newPoints = points.slice(0, pick);
			$interactionMode.data.points = [...newPoints];
		}
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

	const getInteractionMaterial = (band: BandGeometry, mode: InteractionMode): Material => {
		// console.debug('getInteractionMaterial', { band, mode });
		if (mode.type === 'band-select-partners') {
			const { originSelected, partnerSelected, originHighlight } = mode.data;
			if (originSelected && isSameBand(originSelected.address, band.address)) {
				return 'selected';
			} else if (partnerSelected && isSameBand(partnerSelected.address, band.address)) {
				return 'selected';
			} else if (
				originHighlight.some((bs) => {
					// return matchBandConfigCoordinates(band.coord, bs.coord, false);
					return includesGlobuleCoordinates(band.coordStack, bs.coord);
				})
			) {
				return 'highlightedPrimary';
			} else {
				return 'default';
			}
		}
		return isSelectedBand(band, mode);
	};
</script>

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
{#if $geometryStore.variant === 'Globule'}
	{#each $geometryStore.subGlobules as globuleGeometry, index}
		<T.Group position={[0, 0, 0]} on:click={(ev) => handleClick(ev, globuleGeometry)}>
			<GlobuleMesh
				geometry={globuleGeometry}
				material={globuleGeometry.globuleConfigId === $selectedGlobule.globuleId
					? 'selected'
					: 'default'}
			/>
		</T.Group>
	{/each}
{:else if $geometryStore.variant === 'Band'}
	{#each $geometryStore.subGlobules as glob}
		{#each glob as bandGeometry}
			{#if typeof bandGeometry !== 'undefined'}
				<T.Group position={[0, 0, 0]} on:click={(ev) => handleClick(ev, bandGeometry)}>
					<GlobuleMesh
						geometry={bandGeometry}
						material={getInteractionMaterial(bandGeometry, $interactionMode)}
					/>
				</T.Group>
			{/if}
		{/each}
	{/each}
{/if}
