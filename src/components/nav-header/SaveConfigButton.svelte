<script lang="ts">
	import { superConfigStore } from '$lib/stores';
	import Button from '../design-system/Button.svelte';
	import { isModified, isSaved } from './save-config';

	let isPending = false;

	const handleSave = async () => {
		isPending = true;
		const response = await fetch('/api/superGlobuleConfig', {
			method: 'POST',
			body: JSON.stringify({ ...$superConfigStore }),
			headers: { 'content-type': 'application/json' }
		});
		const result = await response.json();
		isPending = false
		console.log('SAVE', { result });
	};
</script>

<Button on:click={handleSave}>{isPending ? 'Saving...' : 'Save New Version'}</Button>
