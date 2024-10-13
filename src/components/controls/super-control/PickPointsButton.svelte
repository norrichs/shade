<script lang="ts">
	import { interactionMode, type InteractionMode } from '../../three-renderer-v2/interaction-mode';

	export let mode: InteractionMode;

	const pickPointsMode = () => {
		$interactionMode = mode;
	};
</script>

<button on:click={pickPointsMode}>Pick Points</button>
