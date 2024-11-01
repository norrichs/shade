<script lang="ts">
	import Button from '../design-system/Button.svelte';
	import { superConfigStore } from '$lib/stores';
	import type { SuperGlobuleConfig } from '$lib/types';
	import { generateDefaultSuperGlobuleConfig } from '$lib/shades-config';
	import { isModified } from './save-config';

	const confirmSave = () => {
		const message = 'This may discard your currently loaded config'
		return window.confirm(message)
	}

	const handleClick = () => {
		if (!isModified($superConfigStore) || confirmSave()) {
			$superConfigStore = generateDefaultSuperGlobuleConfig()	
		}
	};
</script>

<Button on:click={handleClick}>New</Button>
