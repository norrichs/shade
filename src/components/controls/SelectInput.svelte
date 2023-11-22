<script lang="ts">
	export let show = true;
	export let value: string;
	export let label: string;
	export let options: (string | OptionObject)[];

	type OptionObject = { [key: string]: any };
</script>

{#if show}
	<div class="row">
		<span>{label}</span>
		<select bind:value>
			{#each options as option}
				{#if typeof option === 'string'}
					<option>{option}</option>
				{:else}
					<option value={Object.values(option)[0]}>{Object.keys(option)[0]}</option>
				{/if}
			{/each}
		</select>
	</div>
{/if}

<style>
	.row {
		width: 300px;
		display: flex;
		flex-direction: row;
		gap: 10px;
		padding: 5px;
		border: 1px solid black;
		border-radius: 3px;
		margin: 5px;
	}
</style>
