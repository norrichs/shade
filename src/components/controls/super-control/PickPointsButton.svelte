<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { interactionMode, type InteractionMode } from '../../three-renderer/interaction-mode';
	import { BiSolidEyedropper } from 'svelte-icons-pack/bi';

	export let mode: InteractionMode;
	export let label = '';
	export let onClick: (() => void) | undefined = undefined;

	const pickPointsMode = () => {
		$interactionMode = mode;
		if (onClick) {
			onClick();
		}
	};
</script>

<button on:click={pickPointsMode}><Icon size={20} src={BiSolidEyedropper} />{label}</button>

<style>
	button {
		border: 0;
		background-color: transparent;
	}
</style>
