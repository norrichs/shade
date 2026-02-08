<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { interactionMode, type InteractionMode } from '../../three-renderer/interaction-mode';
	import { BiSolidEyedropper } from 'svelte-icons-pack/bi';

	let {
		mode,
		label = '',
		onClick = undefined
	}: {
		mode: InteractionMode;
		label?: string;
		onClick?: (() => void) | undefined;
	} = $props();

	const pickPointsMode = () => {
		$interactionMode = mode;
		if (onClick) {
			onClick();
		}
	};
</script>

<button onclick={pickPointsMode}><Icon size={20} src={BiSolidEyedropper} />{label}</button>

<style>
	button {
		border: 0;
		background-color: transparent;
	}
</style>
