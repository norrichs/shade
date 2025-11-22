<script lang="ts">
	import type { SelectBarOption } from '$lib/types';
	import SelectBar from '../select-bar/SelectBar.svelte';
	import SelectBarUnbound from '../select-bar/SelectBarUnbound.svelte';
	import PolygonEditor from './PolygonEditor.svelte';
	import PolyhedronEditor from './PolyhedronEditor.svelte';

	let showing: SelectBarOption = { name: 'Polygon' };
	const options: SelectBarOption[] = [
		{ name: 'Surface' },
		{ name: 'Polyhedron' },
		{ name: 'Polygon' },
		{ name: 'Height' }
	];

</script>

<section>
	<header>
		<SelectBarUnbound
			onChange={(newValue) => {
				showing = newValue;
			}}
			value={showing}
			{options}
		/>
	</header>
	<div>
		{#if showing.name === 'Surface'}
			<div>Surface editor</div>
		{:else if showing.name === 'Polyhedron'}
			<PolyhedronEditor projectionIndex={0} />
		{:else if showing.name === 'Polygon'}
			<PolygonEditor projectionIndex={0} />
		{:else if showing.name === 'Height'}
			<div>height editor</div>
		{/if}
	</div>
</section>

<style>
	section {
		width: 100%;
		display: flex;
		flex-direction: column;
	}
	section > div {
		background-color: white;
	}
	header {
		display: flex;
		flex-direction: row;
		justify-content: center;
	}
</style>
