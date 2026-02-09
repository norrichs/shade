<script lang="ts">
	let {
		point,
		canv,
		offsetDirection,
		onUpdate,
		showPointInputsInline = false
	}: {
		point: any;
		canv: { minX: number; minY: number; maxX: number; maxY: number };
		offsetDirection: { type: 'radial' | 'lateral' | 'absolute'; value: number };
		onUpdate: (x: number, y: number, dx: number, dy: number) => void | undefined;
		showPointInputsInline?: boolean;
	} = $props();

	let offsetX = $derived.by(() => {
		if (!showPointInputsInline) return 0;
		if (offsetDirection.type === 'lateral') return point.x >= 0 ? offsetDirection.value : -offsetDirection.value;
		return 0;
	});
	let offsetY = $derived.by(() => {
		if (!showPointInputsInline) return 0;
		return 0;
	});

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
	<input type="number" value={point.x} onchange={(event) => updatePoint(event, 'x')} />
	<input type="number" value={point.y} onchange={(event) => updatePoint(event, 'y')} />
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
