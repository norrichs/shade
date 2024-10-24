<script lang="ts">
	import { T } from '@threlte/core';
	import { interactivity, MeshLineGeometry, MeshLineMaterial } from '@threlte/extras';
	import { superGlobuleGeometryStore, selectedGlobule, superConfigStore } from '$lib/stores';
	import GlobuleMesh from '../globuleMesh/GlobuleMesh.svelte';
	import type { GlobuleGeometry, Id } from '$lib/types';
	import DesignerCamera from './DesignerCamera.svelte';
	import DesignerLighting from './DesignerLighting.svelte';
	import { interactionMode, isPointSelectInteractionMode } from './interaction-mode';
	import { getNearestPoint } from '$lib/generate-globulegeometry';
	import { Vector3 } from 'three';
	import { generateTempId } from '$lib/id-handler';
	import TransformDisplay from './TransformDisplay.svelte';

	interactivity();

	const CLICK_DELTA_THRESHOLD = 10;

	const selectGlobule = ({
		globuleConfigId,
		subGlobuleConfigId,
		subGlobuleRecurrence
	}: GlobuleGeometry) => {
		const subGlobuleConfigIndex =
			$superConfigStore.subGlobuleConfigs.findIndex(
				(subGlobuleConfig) => subGlobuleConfig.id === subGlobuleConfigId
			) || 0;
		const subGlobuleGeometryIndex = $superGlobuleGeometryStore.subGlobules.findIndex(
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
	};

	const handleClick = (event: any, globuleGeometry: GlobuleGeometry) => {
		console.debug('handleClick event', event);
		event.stopPropagation();

		if (event.delta > CLICK_DELTA_THRESHOLD) return;
		if ($interactionMode.type === 'standard') {
			selectGlobule(globuleGeometry);
		} else if ($interactionMode.type.startsWith('point-select')) {
			const { pick, points } = $interactionMode.data;
			const point = getNearestPoint(event.point, globuleGeometry);

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
</script>

<DesignerCamera />
<DesignerLighting />

<TransformDisplay />
{#if isPointSelectInteractionMode($interactionMode)}
	{#each $interactionMode.data.points as point}
		<T.Group position={[point.x, point.y, point.z]}>
			<GlobuleMesh globuleGeometry={indicator} selected={false} />
		</T.Group>
	{/each}
{/if}
{#each $superGlobuleGeometryStore.subGlobules as globuleGeometry, index}
	<T.Group position={[0, 0, 0]} on:click={(ev) => handleClick(ev, globuleGeometry)}>
		<GlobuleMesh {globuleGeometry} selected={globuleGeometry.globuleConfigId === $selectedGlobule.globuleId} />
	</T.Group>
{/each}
