<script lang="ts">
	import { superConfigStore as store } from '$lib/stores';
	import { getDefaultTransform } from '$lib/transform-globule';
	import { Icon } from 'svelte-icons-pack';
	import { FiMinusSquare, FiPlusSquare } from 'svelte-icons-pack/fi';
	import { selectedBand } from '$lib/stores';
	export let sgIndex: number;
	export let tIndex: number;
	let canAddTransform = false;

	const removeTransform = () => {
		$selectedBand = { s: 0, g: [], b: 0 };
		$store.subGlobuleConfigs[sgIndex].transforms.splice(tIndex, 1);
		$store.subGlobuleConfigs[sgIndex].transforms = $store.subGlobuleConfigs[sgIndex].transforms;
	};
	const addTransform = () => {
		canAddTransform = true;
	};
	const createTransform = (event: any) => {
		canAddTransform = false;
		const newTransform = getDefaultTransform(event.target.value);
		if (newTransform) {
			$store.subGlobuleConfigs[sgIndex].transforms.splice(tIndex + 1, 0, newTransform);
			$store.subGlobuleConfigs[sgIndex].transforms = $store.subGlobuleConfigs[sgIndex].transforms;
			$selectedBand = { s: sgIndex, g: new Array(tIndex + 2).fill(0), b: 0 };
		}
	};
</script>

<div>
	<button on:click={removeTransform}>
		<Icon size="20" src={FiMinusSquare} />
	</button>
	<button on:click={addTransform}>
		<Icon size="20" src={FiPlusSquare} />
	</button>
</div>
<div class={canAddTransform ? 'can-add-transform' : 'cannot-add-transform'}>
	<select on:change={createTransform}>
		<option value="" selected>Choose transform...</option>
		<option value={'translate'}>Translate</option>
		<option value={'rotate'}>Rotate</option>
		<option value={'reflect'}>Reflect</option>
		<option value={'scale'}>Scale</option>
	</select>
</div>

<style>
	button {
		border: none;
		background-color: transparent;
		padding: 0;
	}
	.cannot-add-transform {
		display: none;
	}
	.can-add-transform {
		display: block;
	}
</style>
