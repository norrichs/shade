<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { FiPlusSquare, FiMinusSquare } from 'svelte-icons-pack/fi';
	import NumberInput from './NumberInput.svelte';

	export let recurs: number[];
</script>

<div class="container">
  <button on:click={() => (recurs = recurs.slice(0, recurs.length - 1))}>
    <Icon size="20" src={FiMinusSquare} />
  </button>
  <button on:click={() => (recurs = [...recurs, recurs[recurs.length - 1] + 1])}>
    <Icon size="20" src={FiPlusSquare} />
  </button>
	<span>Recurs:</span>
	{#each recurs as r, i}
		<NumberInput bind:value={r} min={0} step={1} />
	{/each}
</div>

<style>
	.container {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 4px;
	}
	button {
		padding: 0;
		border: none;
		background-color: transparent;
	}
</style>
