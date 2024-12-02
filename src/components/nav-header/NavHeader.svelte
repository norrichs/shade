<script lang="ts">
	import { goto } from '$app/navigation';

	import { shouldUsePersisted, superConfigStore } from '$lib/stores';
	import Button from '../design-system/Button.svelte';
	import NewConfigButton from './NewConfigButton.svelte';
	import SaveConfigButton from './SaveConfigButton.svelte';
	import { superGlobuleStore } from '$lib/stores';
	const sandBoxOptions = [
		{ value: '/sandbox-ellipse-intersections', label: 'Ellipse Intersections' },
		{ value: '/sandbox-line-intersections', label: 'Line Intersections' },
		{ value: '/sandbox-box-pattern', label: 'Box Pattern' },
		{ value: '/sandbox-bezier-intersections', label: 'Bezier Intersections' },
		{ value: '/sandbox-scaled-svg', label: 'Scaled SVG' },
		{ value: '/sandbox-patterns', label: 'Patterns' },
		{ value: '/sandbox-svg-display', label: 'SVG Display' },
		{ value: '/sandbox-server-test', label: 'Server Test' }
	];

	const printGlobuleCoords = () => {
		const coords = $superGlobuleStore.subGlobules.map((sg) => sg.data.map((g) => g.coord));
		const coordStacks = $superGlobuleStore.subGlobules.map((sg) =>
			sg.data.map((g) => g.coordStack)
		);
		console.debug({ coords });
		console.debug({ coordStacks });
	};
</script>

<header>
	<nav>
		<div>
			<a href="/gallery">Gallery</a>
			<!-- <a href="/designer">Designer</a> -->
			<a href="/designer2">Designer</a>
			<select
				on:change={(ev) => {
					if (ev?.currentTarget?.value) {
						goto(ev.currentTarget.value);
					}
				}}
			>
				<option value="">Experiments</option>
				{#each sandBoxOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
		<div class="button-group">
			<NewConfigButton />
			<SaveConfigButton />
			<Button on:click={() => console.debug({ $superConfigStore })}>Print super</Button>
			<Button on:click={printGlobuleCoords}>Print Coords</Button>
			<Button>Settings</Button>
			<label for="use-persisted-checkbox">persist settings?</label>
			<input type="checkbox" bind:checked={$shouldUsePersisted} />

			<button> User </button>
		</div>
	</nav>
</header>

<style>
	a {
		/* --link-color: green; */
		color: var(--color-link);
	}
	header > nav {
		font-family: 'Open Sans', sans-serif;
		font-optical-sizing: auto;
		font-weight: 300;
		font-style: normal;
		font-variation-settings: 100;
		font-size: 1.5rem;
		left: 0;
		top: 0;
		right: 0;
		padding: 8px;
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		background-color: rgba(100, 100, 100, 1);
	}
	.button-group {
		display: flex;
		flex-direction: row;
		gap: 12px;
	}
</style>
