<script lang="ts">
	import { configStore0 } from '$lib/stores/stores';

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
				$configStore0.patternViewConfig.centerOffset.y += step;
				callBack = () => ($configStore0.patternViewConfig.centerOffset.y += step);
				break;
			case 'down':
				$configStore0.patternViewConfig.centerOffset.y -= step;
				callBack = () => ($configStore0.patternViewConfig.centerOffset.y -= step);
				break;
			case 'left':
				$configStore0.patternViewConfig.centerOffset.x += step;
				callBack = () => ($configStore0.patternViewConfig.centerOffset.x += step);
				break;
			case 'right':
				$configStore0.patternViewConfig.centerOffset.x -= step;
				callBack = () => ($configStore0.patternViewConfig.centerOffset.x -= step);
				break;
		}
		clear();
		panDelay = window.setTimeout(() => {
			panInterval = window.setInterval(callBack, repeat);
		}, delay);
	};
</script>

<div class="pan-control-container">
	<button style="grid-area: u" on:mousedown={() => handlePan('up')} on:mouseup={() => clear()}
		>+</button
	>
	<button style="grid-area: l" on:mousedown={() => handlePan('left')} on:mouseup={() => clear()}
		>-</button
	>
	<button style="grid-area: r" on:mousedown={() => handlePan('right')} on:mouseup={() => clear()}
		>+</button
	>
	<button style="grid-area: d" on:mousedown={() => handlePan('down')} on:mouseup={() => clear()}
		>-</button
	>
</div>

<style>
	.pan-control-container {
		--size: 75px;
		display: grid;
		grid-template-rows: repeat(3, calc(var(--size) / 3));
		grid-template-columns: repeat(3, calc(var(--size) / 3));
		grid-template-areas:
			' . u . '
			' l . r '
			' . d . ';
	}
</style>
