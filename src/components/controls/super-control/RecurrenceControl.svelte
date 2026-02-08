<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import {
		FiPlusSquare,
		FiMinusSquare,
		FiEye,
		FiEyeOff,
		FiSlash,
		FiCode
	} from 'svelte-icons-pack/fi';
	import NumberInput from './NumberInput.svelte';
	import type {
		GeometryAddress,
		GlobuleAddress,
		GlobuleConfigCoordinates,
		RecombinatoryRecurrence
	} from '$lib/types';
	import { superGlobuleStore, superConfigStore, type BandSelection } from '$lib/stores';
	import PickPointsButton from './PickPointsButton.svelte';
	import { interactionMode } from '../../three-renderer/interaction-mode';
	import { formatAddress } from '$lib/recombination';
	import Button from '../../design-system/Button.svelte';
	import { get } from 'svelte/store';

	let { recurs = $bindable(), sgIndex, tIndex }: {
		recurs: RecombinatoryRecurrence[];
		sgIndex: number;
		tIndex: number;
	} = $props();

	let parentGlobuleAddress: GlobuleAddress = $state(new Array(tIndex));
	let showRecombinationDialog = $state(false);

	const setupPickBands = (recurrenceIndex: number, geometryAddress: GeometryAddress<undefined>) => {
		const coord: GlobuleConfigCoordinates = { s: sgIndex, t: tIndex, r: recurrenceIndex };
		const mode = get(interactionMode);
		if (mode.type === 'band-select-partners') {
			const superGlobule = get(superGlobuleStore);
			const originGlobules = superGlobule.subGlobules[sgIndex].data.filter((globule) => {
				const selectorIndex = geometryAddress.g.length - 1;
				const { g } = globule.address;
				return g[selectorIndex] === geometryAddress.g[selectorIndex];
			});

			// Early return
			if (originGlobules.length === 0) {
				return;
			}

			const config = get(superConfigStore);
			const originHighlight: BandSelection[] = [];
			const bandCount = originGlobules[0].data.bands.length;
			for (let j = 0; j < originGlobules.length; j++) {
				for (let i = 0; i < bandCount; i++) {
					originHighlight.push({
						selection: ['highlighted'],
						coord: { ...coord, b: i },
						coordStack: originGlobules[j].coordStack,
						address: { ...originGlobules[j].address, b: i },
						subGlobuleConfigIndex: sgIndex,
						subGlobuleConfigId: config.subGlobuleConfigs[sgIndex].id,
						subGlobuleRecurrence: coord.r,
						transformIndex: coord.t,
						bandIndex: i
					});
				}
			}
			mode.data.originHighlight = originHighlight;
			interactionMode.set(mode);
		}
	};

	const onSelectBands = (recurrenceIndex: number) => {
		const config = get(superConfigStore);
		const recurrences = config.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs;
	};

	const handleSelectPartners = (rIndex: number) => {
		const config = get(superConfigStore);
		const thisRecurrences = config.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs;
	};

	const decrement = () => {
		if (recurs.length === 1) {
			recurs = [{ ...recurs[0], multiplier: 0 }];
			return;
		}
		recurs = recurs.slice(0, recurs.length - 1);
	};

	const deleteRecombination = (recurrenceIndex: number) => {
		recurs[recurrenceIndex].recombines = undefined;
		const config = get(superConfigStore);
		config.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs = recurs;
		superConfigStore.set(config);
		recurs = recurs;
	};

	const toggleGhost = (recurrenceIndex: number) => {
		recurs[recurrenceIndex].ghost =
			recurs[recurrenceIndex].ghost === false ||
			typeof recurs[recurrenceIndex].ghost === 'undefined'
				? true
				: false;
	};

	let recombinationOptions = $derived(
		$superGlobuleStore.subGlobules
			.map((subGlobule) => subGlobule.data.map((globule) => globule.name))
			.flat()
	);

	const togglePartnerJoin = (i: number, mappingIndex: number) => {
		const config = get(superConfigStore);
		const recombines = config.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs[i].recombines;
		if (recombines !== undefined) {
			const newEnd = recombines.bandMap[mappingIndex].partnerJoin === 'end' ? 'start' : 'end';
			recombines.bandMap[mappingIndex].partnerJoin = newEnd;
			superConfigStore.set(config);
		}
	};

	const toggleOriginJoin = (i: number, mappingIndex: number) => {
		const config = get(superConfigStore);
		const recombines = config.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs[i].recombines;
		if (recombines !== undefined) {
			const newEnd = recombines.bandMap[mappingIndex].originJoin === 'end' ? 'start' : 'end';
			recombines.bandMap[mappingIndex].originJoin = newEnd;
			superConfigStore.set(config);
		}
	};
</script>

<div class="container row">
	<div class="container">
		<div class="container row">
			<span>Recurs:</span>
			<button onclick={decrement}>
				<Icon size="20" src={FiMinusSquare} />
			</button>
			<button
				onclick={() =>
					(recurs = [...recurs, { multiplier: recurs[recurs.length - 1].multiplier + 1 }])}
			>
				<Icon size="20" src={FiPlusSquare} />
			</button>
		</div>
		<span>Recombination</span>
	</div>
	{#each recurs as r, i}
		<div class="container">
			<NumberInput label="" bind:value={r.multiplier} min={0} step={1} />
			<div class="container row">
				<button onclick={() => toggleGhost(i)}
					><Icon size="20" src={r.ghost === true ? FiEyeOff : FiEye} /></button
				>
				{#if r.recombines}
					<button onclick={() => deleteRecombination(i)}
						><Icon color="red" size="20" src={FiSlash} /></button
					>
				{/if}
				<PickPointsButton
					onClick={() =>
						setupPickBands(i, { s: sgIndex, g: [...parentGlobuleAddress, i], b: undefined })}
					mode={{
						type: 'band-select-partners',
						data: {
							pick: 1,
							originHighlight: [],
							partnerHighlight: [],
							originSelected: undefined,
							partnerSelected: undefined
						},
						onSelectBands: () => onSelectBands(i)
					}}
				/>
				<button onclick={() => (showRecombinationDialog = !showRecombinationDialog)}
					><Icon src={FiCode} /></button
				>
				<div class="dialog-anchor">
					{#if showRecombinationDialog}
						<div class="recombination-dialog-container">
							<header>Recombination details</header>
							{#each r.recombines?.bandMap || [] as mapping, mappingIndex}
								<div class="row">
									<div>
										{mapping.originIndex}
									</div>
									<div>
										<Button onclick={() => togglePartnerJoin(i, mappingIndex)}>
											{mapping.partnerJoin}
										</Button>
									</div>
									<div>
										<Button onclick={() => toggleOriginJoin(i, mappingIndex)}>
											{mapping.originJoin}
										</Button>
									</div>
									<div>
										{formatAddress(mapping.partnerAddress)}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/each}
</div>

<style>
	.container {
		display: flex;
		flex-direction: column;
	}
	.container.row {
		flex-direction: row;
		align-items: center;
		gap: 4px;
	}
	.dialog-anchor {
		position: relative;
	}
	.recombination-dialog-container {
		width: 400px;
		background-color: red;
		border: 1px solid gray;
		position: absolute;
	}
	.recombination-dialog-container .row {
		display: flex;
		flex-direction: row;
	}
	button {
		padding: 0;
		border: none;
		background-color: transparent;
	}
</style>
