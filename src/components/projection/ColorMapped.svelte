<script lang="ts">
	import { T } from '@threlte/core';
	import type { BufferGeometry, MeshPhysicalMaterial } from 'three';

	let {
		geometry,
		groupSizeMap = undefined,
		materials,
		onClick
	}: {
		geometry: BufferGeometry[] | undefined;
		groupSizeMap?: number | number[] | undefined;
		materials: MeshPhysicalMaterial | MeshPhysicalMaterial[];
		onClick: ((ev: any) => void) | undefined;
	} = $props();

	const getEffectiveGroupSizeMap = (map: undefined | number | number[]) => {
		if (Array.isArray(map)) return map;
		if (!geometry || !map) return [];
		const effectiveMap = [];
		for (let i = 1; i < geometry.length / map; i++) {
			effectiveMap.push(map);
		}
		return effectiveMap;
	};

	const getRowMaterials = (
		lengths: number[],
		mats: MeshPhysicalMaterial[],
		shapes?: BufferGeometry[]
	) => {
		if (!shapes) {
			return [];
		}

		let accumulator = 0;
		const rowIndices = lengths.map((length, i) => {
			if (i === 0) {
				accumulator = length;
			} else {
				accumulator += length;
			}
			return accumulator;
		});

		const shapeMaterialIndices = shapes.map((shape, shapeIndex) => {
			for (let i = 0; i < rowIndices.length; i++) {
				if (shapeIndex < rowIndices[i]) return i;
			}
			return 0;
		});

		return shapeMaterialIndices.map((i) => mats[i % mats.length]);
	};
	let effectiveGroupSizeMap = $derived(getEffectiveGroupSizeMap(groupSizeMap));
	let effectiveMaterials = $derived(Array.isArray(materials) ? materials : [materials]);
	let groupMaterials = $derived(getRowMaterials(effectiveGroupSizeMap, effectiveMaterials, geometry));
</script>

{#each geometry || [] as g, i}
	<T.Mesh
		geometry={g}
		material={groupMaterials[i]}
		onclick={(ev) => {
			if (onClick) {
				onClick(ev);
			}
		}}
	/>
{/each}
