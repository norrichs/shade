<script lang="ts">
	import { T } from '@threlte/core';
	import { activeControl } from '../controls/super-control/active-control';
	import { superConfigStore } from '$lib/stores';
	import { materials } from '../../components/three-renderer-v2/materials';
	import { BufferGeometry, Vector3 } from 'three';
	import type { GlobuleTransformRotate, SuperGlobuleConfig } from '$lib/types';
	import { isGlobuleTransformRotate } from '$lib/transform-globule';

	let baseGeometry: BufferGeometry | null;
	let rotatedGeometry: BufferGeometry | null;

	const rotateDisplayPoints = (
		{ rotate: { anchor, axis, angle } }: GlobuleTransformRotate,
		size = 50
	): { base: Vector3[]; rotated: Vector3[] } => {
		const extensionAxis = new Vector3(0, 0, 1);

		const axisVec = new Vector3(axis.x, axis.y, axis.z);

		const base0 = new Vector3(anchor.x, anchor.y, anchor.z);
		const base1 = base0.clone().addScaledVector(axisVec, size);
		const extensionVector = axisVec
			.clone()
			.setLength(size)
			.applyAxisAngle(extensionAxis, Math.PI / 2);
		const rotatedExtensionVector = extensionVector.clone().applyAxisAngle(axisVec, angle);
		const extension0 = base0.clone().addScaledVector(extensionVector, 1);
		const extension1 = base0.clone().addScaledVector(rotatedExtensionVector, 1);

		return {
			base: [base0, base1, extensionVector],
			rotated: [base0, base1, rotatedExtensionVector]
		};
	};

	const updateGeometry = (
		control?: { sgIndex: number; tIndex: number },
		config?: SuperGlobuleConfig
	) => {
		if (!control) {
			baseGeometry = null;
			rotatedGeometry = null;
		} else {
			const { sgIndex, tIndex } = control;
			const transform = $superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex];
			if (isGlobuleTransformRotate(transform)) {
				const points = rotateDisplayPoints(transform);
				baseGeometry = new BufferGeometry().setFromPoints(points.base);
				baseGeometry.computeVertexNormals();
				rotatedGeometry = new BufferGeometry().setFromPoints(points.rotated);
				rotatedGeometry.computeVertexNormals();
			}
		}
	};

	$: updateGeometry($activeControl, $superConfigStore);
</script>

{#if baseGeometry && rotatedGeometry}
	<T.Group position={[0, 0, 0]}>
		<T.Mesh geometry={baseGeometry} material={materials.default} />
		<T.Mesh geometry={rotatedGeometry} material={materials.selected} />
	</T.Group>
{/if}
