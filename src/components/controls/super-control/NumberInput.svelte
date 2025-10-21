<script lang="ts">
	import { round } from '$lib/util';
	import { Icon } from 'svelte-icons-pack';
	import { FiChevronUp, FiChevronDown } from 'svelte-icons-pack/fi';

	export let value: number;
	export let step = 1;
	export let min = 0;
	export let max = 100;
	export let hasButtons = false;
	export let label = ''

	const handleFocus = (event: FocusEvent) => {
		(event.target as HTMLInputElement).select();
	};

	const click = (direction: 'up' | 'down') => {
		if (direction === 'up' && value < max - step) {
			value = round(value + step, 2);
		} else if (value > min + step) {
			value = round(value - step, 2);
		}
	};
</script>

<div class="container">
	{#if label}
		<div>{label}</div>
	{/if}
	<input type="number" bind:value {min} {step} {max} on:focus={handleFocus} />
	{#if hasButtons}
		<div>
			<button on:click={() => click('up')}><Icon size="16" src={FiChevronUp} /></button>
			<button on:click={() => click('down')}><Icon size="16" src={FiChevronDown} /></button>
		</div>
	{/if}
</div>

<style>
	.container {
		display: flex;
		flex-direction: row;
	}
	div {
		display: flex;
		flex-direction: column;
	}
	button {
		height: 10px;
		margin: 0;
		border: none;
		background-color: transparent;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	input[type='number'] {
		-webkit-appearance: textfield;
		-moz-appearance: textfield;
		appearance: textfield;
		background-color: transparent;
		/* background-color: var(--color-highlight); */
		border: 0;
		display: flex;
		align-items: flex-end;
		text-align: center;
		/* padding: 4px 8px; */
		/* min-width: 30px;  */
		/* border-radius: 4px; */
	}

	input[type='number']:focus-visible {
		background-color: var(--color-active);
	}

	input[type='number']::-webkit-inner-spin-button,
	input[type='number']::-webkit-outer-spin-button {
		-webkit-appearance: none;
	}
</style>
