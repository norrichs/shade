<script lang="ts">
	import { superConfigStore } from '$lib/stores';
	import { getDefaultTransform } from '$lib/transform-globule';
	import { Icon } from 'svelte-icons-pack';
	import { FiMinusSquare, FiPlusSquare } from 'svelte-icons-pack/fi';
	import { activeControl } from './active-control';
	export let sgIndex: number;
	export let tIndex: number;
	let canAddTransform = false;

	const removeTransform = () => {
    $activeControl = undefined
		$superConfigStore.subGlobuleConfigs[sgIndex].transforms.splice(tIndex, 1);
		$superConfigStore.subGlobuleConfigs[sgIndex].transforms =
			$superConfigStore.subGlobuleConfigs[sgIndex].transforms;
	};
	const addTransform = () => {
		canAddTransform = true;
	};
	const createTransform = (event: any) => {
		console.debug('onChange', { event }, event.target.value);
		canAddTransform = false;
		const newTransform = getDefaultTransform(event.target.value);
		if (newTransform) {
			$superConfigStore.subGlobuleConfigs[sgIndex].transforms.splice(tIndex + 1, 0, newTransform);
			$superConfigStore.subGlobuleConfigs[sgIndex].transforms =
				$superConfigStore.subGlobuleConfigs[sgIndex].transforms;

			$activeControl = { sgIndex, tIndex: tIndex + 1 };
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
		<option>Choose transform...</option>
		<option value={'translate'}>Translate</option>
		<option value={'rotate'}>Rotate</option>
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
