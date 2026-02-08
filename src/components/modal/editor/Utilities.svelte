<script lang="ts">
	import {
		patternConfigStore,
		superConfigStore,
		superGlobulePatternStore,
		superGlobuleStore
	} from '$lib/stores';
	import Button from '../../design-system/Button.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
</script>

<Editor>
	<section>
		<header>Utilities</header>
		<Container direction="column">
			<Button on:click={() => console.log($superGlobuleStore)}>Print all data</Button>
			<Button on:click={() => console.log($superConfigStore)}>Print config</Button>
			<Button on:click={() => console.log($superGlobulePatternStore)}>Print patterns</Button>
			<Button on:click={() => console.log($patternConfigStore)}>Print pattern config</Button>
		</Container>
	</section>
</Editor>
