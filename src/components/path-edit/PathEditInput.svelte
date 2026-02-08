<script lang="ts">
	export let point: any;
	// export let curveIndex: number;
	// export let pointIndex: number;
	export let canv: { minX: number; minY: number; maxX: number; maxY: number };
	export let offsetDirection: { type: 'radial' | 'lateral' | 'absolute'; value: number };
	export let onUpdate: (x: number, y: number, dx: number, dy: number) => void | undefined;
	export let showPointInputsInline = false;

	let offsetX = 0;
	let offsetY = 0;

	const updateOffset = (
		x: number,
		y: number,
		type: 'radial' | 'lateral' | 'absolute',
		value: number
	) => {
		if (!showPointInputsInline) {
			return;
		}
		if (type === 'lateral') {
			offsetX = x >= 0 ? value : -value;
			offsetY = 0;
		}
	};

	const updatePoint = (event: Event, pointName: 'x' | 'y') => {
		const currentTarget = event.currentTarget as HTMLInputElement;
		let dx = 0;
		let dy = 0;
		if (pointName === 'x') {
			dx = currentTarget.valueAsNumber - point.x;
			point.x = currentTarget.valueAsNumber;
		} else {
			dy = currentTarget.valueAsNumber - point.y;
			point.y = currentTarget.valueAsNumber;
		}

		onUpdate(point.x, -point.y, dx, -dy);
	};

	$: {
		updateOffset(point.x, point.y, offsetDirection.type, offsetDirection.value);
	}
</script>

<div
	class={`point-input`}
	style={!showPointInputsInline
		? `left:${point.x - canv.minX}px; top:${
				-point.y - canv.minY
			}px; transform: translate(calc(-50% + (${
				Math.sign(offsetX) === 0 ? 1 : Math.sign(offsetX)
			} * 50%) + ${offsetX}px), calc(-50% + ${offsetY}px)`
		: ''}
>
	<input type="number" value={point.x} on:change={(event) => updatePoint(event, 'x')} />
	<input type="number" value={point.y} on:change={(event) => updatePoint(event, 'y')} />
</div>

<style>
	.point-input {
		display: flex;
		flex-direction: row;
		background-color: white;
		box-shadow: 3px 6px 10px 4px rgba(0, 0, 0, 0.2);
		border-radius: 3px;
		padding: 3px;
		max-width: 200px;
	}
	.point-input-container.overlay .point-input {
		position: absolute;
	}
	.point-input-container.outrigger .point-input {
		position: relative;
		background-color: blue;
	}
	.point-input input {
		font-size: 10px;
		max-width: 90px;
		border: none;
	}
</style>
