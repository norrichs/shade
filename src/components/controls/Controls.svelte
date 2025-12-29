<script lang="ts">
	import CutControl from './CutControl.svelte';
	import LevelControl from './LevelControl.svelte';
	import StrutControl from './StrutControl.svelte';
	import TilingControl from './TilingControl.svelte';
	import ShowControl from './ShowControl.svelte';

	export let showControl: string;
</script>

{#if showControl === 'Struts'}
	<StrutControl />
{:else if showControl === 'Levels'}
	<LevelControl />
{:else if showControl === 'Cut'}
	<CutControl />
{:else if showControl === 'Pattern'}
	<TilingControl />
{/if}
