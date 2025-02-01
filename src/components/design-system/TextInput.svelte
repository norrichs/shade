<script lang="ts">
	export let value: string | undefined;
	let localValue = value;

	const handleKeydown = (ev: KeyboardEvent) => {
		if (ev.key === 'Enter') {
			updateValue()
		}
	};

	const updateValue = () => {
		if (localValue !== value) value = localValue;
	};
</script>

<input type="text" bind:value={localValue} on:keydown={handleKeydown} on:blur={updateValue}/>

<style>
	input {
		width: 400px;
		border-radius: 4px;
		background-color: var(--color-dark);
		color: var(--color-link);
		padding: 5px;
		border: none;
    
	}
	input:focus-visible {
		background-color: var(--color-highlight);
		color: black;
	}
  input::selection {
    padding: 4px;
    background-color: rgba(200, 100, 100, 0.4);
  }
</style>
