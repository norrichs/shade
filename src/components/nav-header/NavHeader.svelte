<script lang="ts">
	import { goto } from '$app/navigation';

	import {
		shouldUsePersisted,
		superConfigStore,
		uiStore,
		selectedProjectionGeometry
	} from '$lib/stores';
	import Button from '../design-system/Button.svelte';
	import NewConfigButton from './NewConfigButton.svelte';
	import SaveConfigButton from './SaveConfigButton.svelte';
	import { superGlobuleStore, selectedBand } from '$lib/stores';
	import { formatAddress } from '$lib/recombination';
	import { downloadSvg } from '$lib/util';
	import { interactionMode } from '../three-renderer/interaction-mode';
	import ViewMenu from './ViewMenu.svelte';
	import { printProjectionAddress } from '$lib/projection-geometry/generate-projection';
	import Floater from '../modal/Floater.svelte';

	let downloadUrl: string | undefined = undefined;
	let showModal = false;
	const toggleModal = () => {
		showModal = !showModal;
	};

	const sandBoxOptions = [
		{ value: '/sandbox-ellipse-intersections', label: 'Ellipse Intersections' },
		{ value: '/sandbox-line-intersections', label: 'Line Intersections' },
		{ value: '/sandbox-box-pattern', label: 'Box Pattern' },
		{ value: '/sandbox-bezier-intersections', label: 'Bezier Intersections' },
		{ value: '/sandbox-patterns', label: 'Patterns' },
		{ value: '/sandbox-svg-display', label: 'SVG Display' },
		{ value: '/sandbox-server-test', label: 'Server Test' },
		{ value: '/sandbox-pattern-test', label: 'Pattern test' }
	];

	const printGlobuleCoords = () => {
		const coords = $superGlobuleStore.subGlobules.map((sg) => sg.data.map((g) => g.coord));
		const coordStacks = $superGlobuleStore.subGlobules.map((sg) =>
			sg.data.map((g) => g.coordStack)
		);
	};

	const printRecombinations = () => {
		const recombinations = $superConfigStore.subGlobuleConfigs.forEach((sgc, sgcIndex) => {
			if (!sgc.transforms || sgc.transforms.length === 0) {
			} else {
				return sgc.transforms.forEach((tx, txIndex) => tx.recurs.forEach((r, rIndex) => {}));
			}
		});
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
			<ViewMenu />
		</div>

		<!-- <div>
			{formatAddress($selectedBand)}
		</div> -->

		{#if $selectedProjectionGeometry}
			<div>
				<span>
					{printProjectionAddress($selectedProjectionGeometry.selected[0])}
				</span>
				{#each $selectedProjectionGeometry.selectedPartners as partner}
					<span>{`[${printProjectionAddress(partner)}]`}</span>
				{/each}
			</div>
		{/if}

		<div class="button-group">
			<Button on:click={toggleModal}>Edit</Button>
			<Button
				on:click={() => {
					$interactionMode = { type: 'band-select-multiple', data: { bands: [] } };
				}}>Select Bands</Button
			>
			<Button
				on:click={() =>
					downloadSvg('pattern-svg', `globule-pattern ${$superGlobuleStore.name}.svg`)}
				>Download SVG</Button
			>
			<Button
				on:click={() =>
					($uiStore.designer.viewMode =
						$uiStore.designer.viewMode === 'pattern' ? 'three' : 'pattern')}
				>{`Main: ${$uiStore.designer.viewMode}`}</Button
			>
			<NewConfigButton />
			<SaveConfigButton />
			<!-- <Button on:click={() => console.log({ $superConfigStore })}>Print super</Button>
			<Button on:click={printRecombinations}>Print recombinations</Button>
			<Button>Settings</Button> -->
			<label for="use-persisted-checkbox">persist settings?</label>
			<input type="checkbox" bind:checked={$shouldUsePersisted} />

			<!-- <button> User </button> -->
		</div>
	</nav>
</header>

<style>
	a {
		/* --link-color: green; */
		color: var(--color-link);
	}
	header > nav {
		--padding: 8px;
		--height: calc(var(--nav-header-height) - 2 * var(--padding));
		max-height: var(--height);
		height: var(--height);
		padding: var(--padding);
		font-family: 'Open Sans', sans-serif;
		font-optical-sizing: auto;
		font-weight: 300;
		font-style: normal;
		font-variation-settings: 100;
		font-size: 1.5rem;
		left: 0;
		top: 0;
		right: 0;
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
