<script lang="ts">
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import { selectedProjectionGeometry } from '$lib/stores';
	import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';
	import { concatAddress } from '$lib/util';

	const getUniqueAddresses = (selected: (GlobuleAddress_Facet | undefined)[] | undefined) => {
		if (!selected) return [];
		return Array.from(new Set(selected.map((address) => concatAddress(address, 'tb'))));
	};

	let selectedBands = $derived(getUniqueAddresses($selectedProjectionGeometry?.selected));
	let selectedPartners = $derived(getUniqueAddresses($selectedProjectionGeometry?.selectedPartners));
	let selectedStartPartners = $derived(getUniqueAddresses($selectedProjectionGeometry?.selectedStartPartners));
	let selectedEndPartners = $derived(getUniqueAddresses($selectedProjectionGeometry?.selectedEndPartners));
</script>

<Editor>
	<section>
		<Container direction="column">
			<Container direction="row">
				<div>Selected:</div>
				{#each selectedBands as bandAddress}
					<div>{bandAddress}</div>
				{/each}
			</Container>

			<Container direction="row">
				<div>Start Partners:</div>
				{#each selectedStartPartners as bandAddress}
					<div>{bandAddress}</div>
				{/each}
			</Container>

			<Container direction="row">
				<div>End Partners:</div>
				{#each selectedEndPartners as bandAddress}
					<div>{bandAddress}</div>
				{/each}
			</Container>

			<Container direction="row">
				<div>Partners:</div>
				{#each selectedPartners as bandAddress}
					<div>{bandAddress}</div>
				{/each}
			</Container>
		</Container>
	</section>
</Editor>
