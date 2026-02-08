<script lang="ts">
	export let direction: 'row' | 'column' = 'row';
</script>

<div class={direction === 'row' ? 'rows' : 'columns'}>
	<slot />
</div>

<style>
	div {
		display: flex;
	}

	.rows {
		flex-direction: row;
		gap: 20px;
	}

	.columns {
		flex-direction: column;
	}
</style>
