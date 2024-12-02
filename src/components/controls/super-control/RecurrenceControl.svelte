<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { FiPlusSquare, FiMinusSquare, FiEye, FiEyeOff, FiSlash } from 'svelte-icons-pack/fi';
	import { BiSolidEyedropper } from 'svelte-icons-pack/bi';
	import NumberInput from './NumberInput.svelte';
	import type {
		GeometryAddress,
		GlobuleAddress,
		GlobuleConfigCoordinates,
		RecombinatoryRecurrence,
		Recurrence,
		SuperGlobuleConfig
	} from '$lib/types';
	import Button from '../../design-system/Button.svelte';
	import { superGlobuleStore, superConfigStore, type BandSelection } from '$lib/stores';
	import { getRecurrences } from '$lib/transform-globule';
	import PickPointsButton from './PickPointsButton.svelte';
	import {
		interactionMode,
		type BandSelectInteractionMode,
		type InteractionMode
	} from '../../three-renderer-v2/interaction-mode';
	import { includesGlobuleCoordinates } from '$lib/matchers';

	export let recurs: RecombinatoryRecurrence[];
	export let sgIndex, tIndex;
	let parentGlobuleAddress: GlobuleAddress = new Array(tIndex);

	// const getGlobuleIndex = (sgc: SuperGlobuleConfig, coord: GlobuleConfigCoordinates) => {
	// 	const subGlobuleConfig = sgc.subGlobuleConfigs[coord.s]
	// 	const transforms = subGlobuleConfig.transforms.filter((tx, i) => i < coord.t).map(tx=> getRecurrences()
	// }

	const setupPickBands = (recurrenceIndex: number, geometryAddress: GeometryAddress<undefined>) => {
		const coord: GlobuleConfigCoordinates = { s: sgIndex, t: tIndex, r: recurrenceIndex };
		console.debug('setup pick bands', { coord, geometryAddress });
		if ($interactionMode.type === 'band-select-partners') {
			const originGlobules = $superGlobuleStore.subGlobules[coord.s].data.filter((globule) => {
				const selectorIndex = geometryAddress.g.length - 1;
				const { g } = globule.address;
				console.debug('g', g, selectorIndex);
				return g[selectorIndex] === geometryAddress.g[selectorIndex];
			});
			console.debug('originGlobules', originGlobules);

			// Early return
			if (originGlobules.length === 0) {
				const coords = $superGlobuleStore.subGlobules.map((sg) => sg.data.map((g) => g.coord));
				console.debug('setupPickBands - no originGlobules', {
					'recurrence coord': coord,
					'coord map': coords
				});
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
						subGlobuleConfigIndex: coord.s,
						subGlobuleConfigId: $superConfigStore.subGlobuleConfigs[coord.s].id,
						subGlobuleRecurrence: coord.r,
						transformIndex: coord.t,
						bandIndex: i
					});
				}
			}
			console.debug('new interaction mode', originHighlight);
			$interactionMode.data.originHighlight = originHighlight;
			console.debug({ $interactionMode });
		}
	};

	const onSelectBands = (recurrenceIndex: number) => {
		const recurrences = getRecurrences(
			$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs
		);

		// recurrences[recurrenceIndex].recombines = {
		// 	coordinates: { s: sgIndex, t: tIndex, r: recurrenceIndex },
		// 	bandMap: [
		// 		{
		// 			origin: [
		// 				($interactionMode as BandSelectInteractionMode).data.bands[0].subGlobuleGeometryIndex!,
		// 				'end'
		// 			],
		// 			partner: [
		// 				($interactionMode as BandSelectInteractionMode).data.bands[1].subGlobuleGeometryIndex!,
		// 				'end'
		// 			]
		// 		}
		// 	]
		// };
		// $superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs = [...recurrences];

		// console.debug(
		// 	'Recurrence Control Interaction Mode',
		// 	sgIndex,
		// 	tIndex,
		// 	recurrenceIndex,
		// 	$interactionMode
		// );
	};

	const handleSelectPartners = (rIndex: number) => {
		console.debug('handleSelectPartenrs, context:', sgIndex, tIndex, rIndex);

		const thisRecurrences = getRecurrences(
			$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs
		);
		console.debug(thisRecurrences[rIndex]);
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
		recurs = recurs;
		console.debug('stub');
	};

	const toggleGhost = (recurrenceIndex: number) => {
		console.debug('toggleGhost', recurs[recurrenceIndex].ghost);
		recurs[recurrenceIndex].ghost =
			recurs[recurrenceIndex].ghost === false ||
			typeof recurs[recurrenceIndex].ghost === 'undefined'
				? true
				: false;
		console.debug(recurs[recurrenceIndex].ghost);
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
			<NumberInput bind:value={r.multiplier} min={0} step={1} />
			<div class="container row">
				<button on:click={() => toggleGhost(i)}
					><Icon size="20" src={r.ghost === true ? FiEyeOff : FiEye} /></button
				>
				{#if r.recombines}
					<button on:click={() => deleteRecombination(i)}><Icon size="20" src={FiSlash} /></button>
					<div>
						{`Origin: ${r.recombines.bandMap[0].originIndex} -> ${r.recombines.bandMap[0].partnerAddress}`}
					</div>
				{/if}
				<!-- {#if tIndex === 0} -->
				<PickPointsButton
					onClick={() => setupPickBands(i, { s: sgIndex, g: [...parentGlobuleAddress, i], b: undefined })}
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
				<!-- {/if} -->
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
	button {
		padding: 0;
		border: none;
		background-color: transparent;
	}
</style>
