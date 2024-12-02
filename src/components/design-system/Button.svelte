<script lang="ts">
	export let variant: 'standard' | 'link' = 'standard'
	// export let klass = ""
</script>

<button on:click on:mousedown on:mouseup class={variant}><slot /></button>

<style>
	.standard {
		background-color: var(--color-active);
		outline: none;
		border: none;
		border-radius: 4px;
    padding: 6px 10px;
    box-shadow: 2px 2px 10px 0px var(--color-shaded-dark)
    

	}
</style>
