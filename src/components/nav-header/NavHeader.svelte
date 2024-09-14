<script lang="ts">
	import { goto } from '$app/navigation';

	import { shouldUsePersisted } from '$lib/stores/stores';
	import SaveConfigButton from './SaveConfigButton.svelte';
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
		<div>
			<SaveConfigButton />
			<button> Settings </button>
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
		font-variation-settings: 'wdth' 100;
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
</style>
