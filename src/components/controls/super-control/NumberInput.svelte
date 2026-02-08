<script lang="ts">
	import { round } from '$lib/util';
	import { Icon } from 'svelte-icons-pack';
	import { FiChevronUp, FiChevronDown } from 'svelte-icons-pack/fi';

	let {
		value = $bindable(),
		step = 1,
		min = 0,
		max = 100,
		hasButtons = false,
		label = '',
		onChange = undefined
	}: {
		value: number;
		step?: number;
		min?: number;
		max?: number;
		hasButtons?: boolean;
		label?: string;
		onChange?: ((newValue: number) => void) | undefined;
	} = $props();

	// Local state so the input is always editable, even when the parent
	// passes value={expr} without bind:  (Svelte 5 runes treat unbound
	// props as parent-owned, overwriting local mutations on re-render).
	let internalValue = $state(value);

	$effect(() => {
		internalValue = value;
	});

	const propagate = (v: number) => {
		value = v;
		onChange?.(v);
	};

	const handleFocus = (event: FocusEvent) => {
		(event.target as HTMLInputElement).select();
	};

	const handleChange = (event: Event) => {
		const v = parseFloat((event.target as HTMLInputElement).value);
		if (!isNaN(v)) {
			internalValue = v;
			propagate(v);
		}
	};

	const click = (direction: 'up' | 'down') => {
		if (direction === 'up' && internalValue < max - step) {
			internalValue = round(internalValue + step, 2);
		} else if (internalValue > min + step) {
			internalValue = round(internalValue - step, 2);
		}
		propagate(internalValue);
	};
</script>

<div class="container">
	{#if label}
		<div>{label}</div>
	{/if}
	<input
		type="number"
		bind:value={internalValue}
		{min}
		{step}
		{max}
		onfocus={handleFocus}
		onchange={handleChange}
	/>
	{#if hasButtons}
		<div>
			<button onclick={() => click('up')}><Icon size="16" src={FiChevronUp} /></button>
			<button onclick={() => click('down')}><Icon size="16" src={FiChevronDown} /></button>
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
