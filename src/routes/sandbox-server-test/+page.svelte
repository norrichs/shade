<script lang="ts">
	import { config } from '$lib/stores/stores';
	import type { GlobuleConfig } from '$lib/types';

	let globuleConfigData: GlobuleConfig[];

	const handleCreate = async () => {
		const response = await fetch('/api/globuleConfig', {
			method: 'POST',
			body: JSON.stringify({ ...$configStore, name }),
			headers: { 'content-type': 'application/json' }
		});
		const result = await response.json();
	};

	const handleRead = async () => {
		const response: Response = await fetch('/api/globuleConfig', {
			method: 'GET',
			headers: { 'content-type': 'application/json' }
		});

		let result = await response.json();
		// result = result.map(cfg=>{
		// 	return {...cfg, silhouetteConfig: deserializeSilhouetteConfig()}
		// })

		console.dir(result, { depth: 4 });
		globuleConfigData = result;
	};

	const handleDelete = async (id?: number) => {
		if (id === undefined) {
			return;
		}
		const response: Response = await fetch(`/api/globuleConfig/${id}`, {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' }
		});
		return response;
	};
	const handleDeleteAll = async () => {
		const response: Response = await fetch(`/api/globuleConfig/deleteAll`, {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' }
		});
		return response;
	};
</script>

<div>
	<button
		on:click={async () => {
			await handleCreate();
			await handleRead();
		}}>Create</button
	>
	<button on:click={handleRead}>Read</button>
	<button>Update</button>
</div>

<div>
	{#if globuleConfigData}
		{#each globuleConfigData as globule}
			{#if globule.id}
				<div>
					<span>
						{globule.id}
					</span>
					<span>
						{globule.name || 'unnamed'}
					</span>
					<button>read</button>
					<button
						on:click={async () => {
							await handleDelete(Number.parseInt(globule.id || ''));
							await handleRead();
						}}>Delete</button
					>
				</div>
			{/if}
		{/each}
	{:else}
		<div>No data</div>
	{/if}
	<button
		on:click={async () => {
			await handleDeleteAll();
			await handleRead();
		}}>Delete All</button
	>
</div>
