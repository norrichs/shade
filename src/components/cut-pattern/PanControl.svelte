<script lang="ts">
	import { patternConfigStore } from '$lib/stores';
	import NumberInput from '../controls/super-control/NumberInput.svelte';
	import { FiChevronUp, FiChevronDown, FiChevronRight, FiChevronLeft } from 'svelte-icons-pack/fi';
	import { Icon } from 'svelte-icons-pack';

	let panInterval: number;
	let panDelay: number;

	const clear = () => {
		window.clearTimeout(panDelay);
		window.clearInterval(panInterval);
	};

	const handlePan = (direction: 'up' | 'down' | 'left' | 'right') => {
		const step = 10;
		const delay = 400;
		const repeat = 50;

		let callBack;

		switch (direction) {
			case 'up':
				$patternConfigStore.patternViewConfig.centerOffset.y += step;
				callBack = () => ($patternConfigStore.patternViewConfig.centerOffset.y += step);
				break;
			case 'down':
				$patternConfigStore.patternViewConfig.centerOffset.y -= step;
				callBack = () => ($patternConfigStore.patternViewConfig.centerOffset.y -= step);
				break;
			case 'left':
				$patternConfigStore.patternViewConfig.centerOffset.x += step;
				callBack = () => ($patternConfigStore.patternViewConfig.centerOffset.x += step);
				break;
			case 'right':
				$patternConfigStore.patternViewConfig.centerOffset.x -= step;
				callBack = () => ($patternConfigStore.patternViewConfig.centerOffset.x -= step);
				break;
		}
		clear();
		panDelay = window.setTimeout(() => {
			panInterval = window.setInterval(callBack, repeat);
		}, delay);
	};
</script>

<div class="pan-control-container">
	<button class="pan-control u" on:mousedown={() => handlePan('up')} on:mouseup={() => clear()}>
		<Icon size={30} src={FiChevronUp} />
	</button>
	<button class="pan-control l" on:mousedown={() => handlePan('left')} on:mouseup={() => clear()}>
		<Icon size={30} src={FiChevronLeft} />
	</button>
	<button class="pan-control r" on:mousedown={() => handlePan('right')} on:mouseup={() => clear()}>
		<Icon size={30} src={FiChevronRight} />
	</button>
	<button class="pan-control d" on:mousedown={() => handlePan('down')} on:mouseup={() => clear()}>
		<Icon size={30} src={FiChevronDown} />
	</button>
	<div class="inputs-center">
		<NumberInput bind:value={$patternConfigStore.patternViewConfig.centerOffset.x} />
		<NumberInput bind:value={$patternConfigStore.patternViewConfig.centerOffset.y} />
	</div>
</div>

<style>
	.pan-control {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		background-color: transparent;
	}
	.pan-control.u {
		grid-area: u;
	}
	.pan-control.l {
		grid-area: l;
	}
	.pan-control.r {
		grid-area: r;
	}
	.pan-control.d {
		grid-area: d;
	}
	.pan-control-container {
		--size: 75px;
		display: grid;
		grid-template-rows: repeat(3, calc(var(--size) / 3));
		grid-template-columns: repeat(4, calc(var(--size) / 3));
		grid-template-areas:
			' . u u  .'
			' l i i r'
			' . d d .';
	}
	.inputs-center {
		grid-area: i;
		display: flex;
		flex-direction: row;
		justify-content: space-around;
	}
</style>
