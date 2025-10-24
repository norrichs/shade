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

	export let recurs: RecombinatoryRecurrence[];
	export let sgIndex, tIndex;
	let parentGlobuleAddress: GlobuleAddress = new Array(tIndex);
	let showRecombinationDialog = false;

	const setupPickBands = (recurrenceIndex: number, geometryAddress: GeometryAddress<undefined>) => {
		const coord: GlobuleConfigCoordinates = { s: sgIndex, t: tIndex, r: recurrenceIndex };
		if ($interactionMode.type === 'band-select-partners') {
			console.debug('setupPickBands', {
				subGlobule: $superGlobuleStore.subGlobules[sgIndex],
				sgIndex
			});
			const originGlobules = $superGlobuleStore.subGlobules[sgIndex].data.filter((globule) => {
				const selectorIndex = geometryAddress.g.length - 1;
				const { g } = globule.address;
				return g[selectorIndex] === geometryAddress.g[selectorIndex];
			});

			// Early return
			if (originGlobules.length === 0) {
				return;
			}

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
						subGlobuleConfigId: $superConfigStore.subGlobuleConfigs[sgIndex].id,
						subGlobuleRecurrence: coord.r,
						transformIndex: coord.t,
						bandIndex: i
					});
				}
			}
			$interactionMode.data.originHighlight = originHighlight;
		}
	};

	const onSelectBands = (recurrenceIndex: number) => {
		const recurrences = $superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs;
	};

	const handleSelectPartners = (rIndex: number) => {
		const thisRecurrences = $superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs;
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
		$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs = recurs;
		recurs = recurs;
		console.debug('deleteRecombination recurs', window.structuredClone(recurs));
	};

	const toggleGhost = (recurrenceIndex: number) => {
		recurs[recurrenceIndex].ghost =
			recurs[recurrenceIndex].ghost === false ||
			typeof recurs[recurrenceIndex].ghost === 'undefined'
				? true
				: false;
	};

	$: recombinationOptions = $superGlobuleStore.subGlobules
		.map((subGlobule) => subGlobule.data.map((globule) => globule.name))
		.flat();
</script>

<div class="container row">
	<div class="container">
		<div class="container row">
			<span>Recurs:</span>
			<button on:click={decrement}>
				<Icon size="20" src={FiMinusSquare} />
			</button>
			<button
				on:click={() =>
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
				<button on:click={() => toggleGhost(i)}
					><Icon size="20" src={r.ghost === true ? FiEyeOff : FiEye} /></button
				>
				{#if r.recombines}
					<button on:click={() => deleteRecombination(i)}
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
				<button on:click={() => (showRecombinationDialog = !showRecombinationDialog)}
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
										<Button
											on:click={() => {
												const newEnd = mapping.partnerJoin === 'end' ? 'start' : 'end';
												if (
													$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs[i]
														.recombines !== undefined
												) {
													$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs[
														i
													].recombines.bandMap[mappingIndex].partnerJoin = newEnd;
												}
											}}
										>
											{mapping.partnerJoin}
										</Button>
									</div>
									<div>
										<Button
											on:click={() => {
												const newEnd = mapping.originJoin === 'end' ? 'start' : 'end';
												if (
													$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs[i]
														.recombines !== undefined
												) {
													$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs[
														i
													].recombines.bandMap[mappingIndex].originJoin = newEnd;
												}
											}}
										>
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
