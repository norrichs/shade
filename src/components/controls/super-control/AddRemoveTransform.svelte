<script lang="ts">
	import { superConfigStore as store } from '$lib/stores';
	import { getDefaultTransform } from '$lib/transform-globule';
	import { Icon } from 'svelte-icons-pack';
	import { FiMinusSquare, FiPlusSquare } from 'svelte-icons-pack/fi';
	import { selectedBand } from '$lib/stores';
	import { get } from 'svelte/store';

	let { sgIndex, tIndex }: { sgIndex: number; tIndex: number } = $props();
	let canAddTransform = $state(false);

	const removeTransform = () => {
		selectedBand.set({ s: 0, g: [], b: 0 });
		const config = get(store);
		config.subGlobuleConfigs[sgIndex].transforms.splice(tIndex, 1);
		config.subGlobuleConfigs[sgIndex].transforms = config.subGlobuleConfigs[sgIndex].transforms;
		store.set(config);
	};
	const addTransform = () => {
		canAddTransform = true;
	};
	const createTransform = (event: any) => {
		canAddTransform = false;
		const newTransform = getDefaultTransform(event.target.value);
		if (newTransform) {
			const config = get(store);
			config.subGlobuleConfigs[sgIndex].transforms.splice(tIndex + 1, 0, newTransform);
			config.subGlobuleConfigs[sgIndex].transforms = config.subGlobuleConfigs[sgIndex].transforms;
			store.set(config);
			selectedBand.set({ s: sgIndex, g: new Array(tIndex + 2).fill(0), b: 0 });
		}
	};
</script>

<div>
	<button onclick={removeTransform}>
		<Icon size="20" src={FiMinusSquare} />
	</button>
	<button onclick={addTransform}>
		<Icon size="20" src={FiPlusSquare} />
	</button>
</div>
<div class={canAddTransform ? 'can-add-transform' : 'cannot-add-transform'}>
	<select onchange={createTransform}>
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
