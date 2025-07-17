<script lang="ts">
	import NumberInput from '../controls/super-control/NumberInput.svelte';

	let sideLength = 0;
</script>

<div>
	<NumberInput label="Side" bind:value={sideLength} hasButtons />
</div>
