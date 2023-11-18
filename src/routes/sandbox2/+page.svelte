<script lang="ts">
	import {
		svgArcTriangle,
		svgEllipse,
		svgTriangle,
		generateMatchedFlowerOfLifeTesselation
	} from '$lib/patterns/flower-of-life';
	import CombinedNumberInput from '../../components/controls/CheckboxInput.svelte';
	import type {
		BandTesselationConfig,
		FlowerOfLifeTriangle
	} from '$lib/patterns/flower-of-life.types';

	const theme = {
		lightGreen: 'rgba(100, 255, 100, 0.2)',
		lightRed: 'rgba(255, 100, 100, 0.2'
	};

	const onChangeSkewAngle = (event: any) => {
		if (flowerConfig.type === 'specified') {
			flowerConfig.skewX =
				(Math.PI / 180) *
				(event.target.value && event.target.value !== 0 ? event.target.value : 0.000001);
		}
	};

	const onChangeRotationAngle = (event: any) => {
		if (flowerConfig.type === 'specified') {
			flowerConfig.rotation =
				(Math.PI / 180) *
				(event.target.value && event.target.value !== 0 ? event.target.value : 0.000001);
		}
	};

	// const generateReferencePattern = (n = 1) => {
	// 	const unit0 = {
	// 		triangle: unitTriangle,
	// 		ab: { x: unitTriangle.c.x, y: -unitTriangle.c.y, r: unitTriangle.b.x - unitTriangle.a.x },
	// 		bc: { x: -unitTriangle.c.x, y: unitTriangle.c.y, r: unitTriangle.b.x - unitTriangle.a.x },
	// 		ac: {
	// 			x: unitTriangle.c.x + unitTriangle.b.x,
	// 			y: unitTriangle.c.y,
	// 			r: unitTriangle.b.x - unitTriangle.a.x
	// 		}
	// 	};
	// 	return [unit0];
	// };

	// let flowerConfig: FlowerOfLifeConfig = {
	// 	type: 'specified',
	// 	width: 5,
	// 	skewX: (0 * Math.PI) / 180,
	// 	scaleY: 3,
	// 	scaleX: 3,
	// 	rotation: 0,
	// 	mode: 'contained'
	// };
	const offset1 =  -50
	const offset2 = 50
	const offset3 = 200
	let flowerConfig: BandTesselationConfig = {
		type: 'matched',
		mode: 'layout',
		tiles: [
			[
				{
					type: 'matched',
					width: 5,
					triangle: {
						a: { x: 0, y: 0 },
						b: { x: 300, y: 0 + offset1 },
						c: { x: 0 + offset2, y:200 }
					}
				},
				{
					type: 'matched',
					width: 5,
					triangle: {
						a: { x: 450, y: 200 + offset1 },
						b: { x: 0 + offset2, y: 200 },
						c: { x: 300, y: 0 + offset1 }
					}
				}
			],
			// [
			// 	{
			// 		type: 'matched',
			// 		width: 5,
			// 		triangle: {
			// 			a: { x: 0 + offset2, y: 200 },
			// 			b: { x: 450, y: 200 + offset1 },
			// 			c: { x: 0 + offset2 + offset3, y: 400 }
			// 		}
			// 	},
			// 	{
			// 		type: 'matched',
			// 		width: 5,
			// 		triangle: {
			// 			a: { x: 500, y: 400 },
			// 			b: { x: 0 + offset2 + offset3, y: 400 },
			// 			c: { x: 450, y: 200 + offset1 }
			// 		}
			// 	}
			// ]
		]
	};

	let tesselationConfig;

	let adjustmentRotation = 0;
	let tesselationWidth = 1;
	let tesselationHeight = 1;
	let skewAngleDeg = flowerConfig.skewX ? (flowerConfig.skewX * 180) / Math.PI : 0;
	let rotationAngleDeg = flowerConfig.rotation ? (flowerConfig.rotation * 180) / Math.PI : 0;
	let arcSegmentStyle: 'major' | 'minor' | 'whole' = 'minor';
	// let refPattern = generateReferencePattern();
	let showAnchorPoints = false;
	let showRefPattern = false;
	// let flower = generateFlowerOfLifeTriangle(flowerConfig);
	let flowerTesselation: (FlowerOfLifeTriangle | undefined)[] = [];
	$: {
		flowerTesselation = generateMatchedFlowerOfLifeTesselation(flowerConfig);
	}
	// $: {
	// 	flowerTesselation = generateFlowerOfLifeTesselation(
	// 		flowerConfig,
	// 		tesselationWidth,
	// 		tesselationHeight
	// 	);
	// }
</script>

<div>
	<!-- <div>
		<div class="row">
			<select bind:value={arcSegmentStyle}>
				<option>whole</option>
				<option>test</option>
				<option>minor</option>
				<option>major</option>
			</select>
			<select bind:value={flowerConfig.type}>
				<option>specified</option>
				<option>matched</option>
			</select>
			<select bind:value={flowerConfig.mode}>
				<option>layout</option>
				<option>contained</option>
				<option>contributing</option>
			</select>
		</div>
		<div class="row">
			<span>tesselate - width</span>
			<input type="number" min={1} step={1} bind:value={tesselationWidth} />
			<span>height</span>
			<input type="number" min={1} step={1} bind:value={tesselationHeight} />
		</div>
		<CombinedNumberInput
			show={flowerConfig?.type === 'specified' && !!flowerConfig?.width}
			bind:value={flowerConfig.width}
			label="Width"
			min={0.01}
			max={40}
			step={0.01}
		/>
		{#if flowerConfig?.type === 'specified' && flowerConfig?.scaleX}
			<div class="row">
				<span>scaleX</span>
				<input type="number" min={0.01} max={10} step={0.01} bind:value={flowerConfig.scaleX} />
				<input type="range" min={0.01} max={10} step={0.01} bind:value={flowerConfig.scaleX} />
			</div>
		{/if}
		{#if flowerConfig?.type === 'specified' && flowerConfig?.scaleY}
			<div class="row">
				<span>scaleY</span>
				<input type="number" min={0.01} max={10} step={0.01} bind:value={flowerConfig.scaleY} />
				<input type="range" min={0.01} max={10} step={0.01} bind:value={flowerConfig.scaleY} />
			</div>
		{/if}
		{#if flowerConfig?.type === 'specified' && flowerConfig?.skewX !== undefined}
			<div class="row">
				<span>skewX</span>
				<input
					type="number"
					min={-90}
					max={90}
					step={0.1}
					bind:value={skewAngleDeg}
					on:input={onChangeSkewAngle}
				/>
				<input
					type="range"
					min={-90}
					max={90}
					step={0.1}
					bind:value={skewAngleDeg}
					on:input={onChangeSkewAngle}
				/>
			</div>
		{/if}
		{#if flowerConfig?.type === 'specified'}
			<div class="row">
				<span>rotation</span>
				<input
					type="number"
					min={-360}
					max={360}
					step={1}
					bind:value={rotationAngleDeg}
					on:input={onChangeRotationAngle}
				/>
				<input
					type="range"
					min={-360}
					max={360}
					step={1}
					bind:value={rotationAngleDeg}
					on:input={onChangeRotationAngle}
				/>
			</div>
		{/if}
		{#if flowerConfig?.type === 'specified'}
			<div class="row">
				<span>adjustment rotation</span>
				<input type="number" min={-360} max={360} step={0.01} bind:value={adjustmentRotation} />
				<input type="range" min={-360} max={360} step={0.01} bind:value={adjustmentRotation} />
			</div>
		{/if}
	</div> -->

	<svg id="sandbox-svg" height={1000} width={1000} viewBox="-200 -300 1200 1200">
		{#if flowerConfig.type === 'matched'}
			<g fill="rgba(100,100,200,0.2)" stroke="rgba(255,0,0,0.5" stroke-width="0.5">
				{#each flowerConfig.tiles as row}
					<path d={svgTriangle(row[0].triangle)} />
					<path d={svgTriangle(row[1].triangle)} />
				{/each}
			</g>
		{/if}

		{#each flowerTesselation as flower, flowerIndex}
			{#if flower}
				<g fill="none" stroke="none">
					{#if flowerConfig.mode === 'layout'}
						<path
							d={svgTriangle(flower?.triangle)}
							fill={flowerIndex % 2 === 0 ? theme.lightGreen : theme.lightRed}
						/>
						<!-- <path
							d={svgEllipse(
								flower.ab.layout.ellipse,
								{
									p1: flower.ab.layout.p1,
									p2: flower.ab.layout.p2
								},
								arcSegmentStyle,
								adjustmentRotation
							)}
						/>
						<path
							d={svgEllipse(
								flower.bc.layout.ellipse,
								{
									p1: flower.bc.layout.p1,
									p2: flower.bc.layout.p2
								},
								arcSegmentStyle,
								adjustmentRotation
							)}
						/>
						<path
							d={svgEllipse(
								flower.ac.layout.ellipse,
								{
									p1: flower.ac.layout.p1,
									p2: flower.ac.layout.p2
								},
								arcSegmentStyle,
								adjustmentRotation
							)}
						/> -->
					{/if}
					{#if flowerConfig.mode === 'contained'}
						<!-- <path
							d={svgEllipse(
								flower.ab.edge.ellipse,
								{
									p1: flower.ab.edge.p1,
									p2: flower.ab.edge.p2
								},
								arcSegmentStyle,
								adjustmentRotation
							)}
						/>
						<path
							d={svgEllipse(
								flower.bc.edge.ellipse,
								{
									p1: flower.bc.edge.p1,
									p2: flower.bc.edge.p2
								},
								arcSegmentStyle,
								adjustmentRotation
							)}
						/>
						<path
							d={svgEllipse(
								flower.ac.edge.ellipse,
								{
									p1: flower.ac.edge.p1,
									p2: flower.ac.edge.p2
								},
								arcSegmentStyle,
								adjustmentRotation
							)}
						/> -->
						{#if arcSegmentStyle === 'minor'}
							<path
								d={`
              ${svgTriangle(flower?.triangle)} 
              ${svgEllipse(
								flower.ab.edge.ellipse,
								{
									p1: flower.ab.edge.p1,
									p2: flower.ab.edge.p2
								},
								arcSegmentStyle,
								adjustmentRotation,
								flower.reflected
							)}
							${svgEllipse(
								flower.bc.edge.ellipse,
								{
									p1: flower.bc.edge.p1,
									p2: flower.bc.edge.p2
								},
								arcSegmentStyle,
								adjustmentRotation,
								flower.reflected
							)}
							${svgEllipse(
								flower.ac.edge.ellipse,
								{
									p1: flower.ac.edge.p1,
									p2: flower.ac.edge.p2
								},
								arcSegmentStyle,
								adjustmentRotation,
								flower.reflected
							)}
							${svgArcTriangle(
								flower.ab.inner.ellipse,
								{ a: flower.ab.inner.p2, b: flower.ab.inner.p1, c: flower.bc.inner.p1 },
								arcSegmentStyle,
								!!flower.reflected
							)}`}
								fill="rgba(10,20,100,0.2"
								fill-rule="evenodd"
							/>
						{:else if arcSegmentStyle === 'whole'}
							<path
								d={`${svgEllipse(
									flower.ab.inner.ellipse,
									{
										p1: flower.ab.inner.p1,
										p2: flower.ab.inner.p2
									},
									arcSegmentStyle,
									adjustmentRotation
								)} ${svgEllipse(
									flower.bc.inner.ellipse,
									{
										p1: flower.bc.inner.p1,
										p2: flower.bc.inner.p2
									},
									arcSegmentStyle,
									adjustmentRotation
								)} ${svgEllipse(
									flower.ac.inner.ellipse,
									{
										p1: flower.ac.inner.p1,
										p2: flower.ac.inner.p2
									},
									arcSegmentStyle,
									adjustmentRotation
								)}`}
							/>
						{/if}
					{/if}
				</g>
			{/if}
			{#if showAnchorPoints}
				<g>
					<circle cx="0" cy="0" r="6" fill="none" stroke="deeppink" stroke-width="1" />
					<circle
						cx={flower?.triangle.a.x}
						cy={flower?.triangle.a.y}
						r="4"
						fill="red"
						stroke="none"
					/>
					<circle
						cx={flower?.triangle.b.x}
						cy={flower?.triangle.b.y}
						r="4"
						fill="red"
						stroke="none"
					/>
					<circle
						cx={flower?.triangle.c.x}
						cy={flower?.triangle.c.y}
						r="4"
						fill="red"
						stroke="none"
					/>

					<!-- <circle
            cx={flower?.triangle.a.x - flower?.triangle.c.x}
            cy={flower?.triangle.c.y}
            r="4"
            fill="red"
            stroke="none"
          />
          <circle
            cx={flower?.triangle.c.x + flower?.triangle.b.x}
            cy={flower?.triangle.c.y}
            r="4"
            fill="red"
            stroke="none"
          />
          <circle cx={flower?.triangle.c.x} cy={-flower?.triangle.c.y} r="4" fill="red" stroke="none" /> -->

					<circle
						cx={flower?.ab.edge.p1.x}
						cy={flower?.ab.edge.p1.y}
						r="4"
						fill="yellow"
						stroke="none"
					/>
					<circle
						cx={flower?.ab.edge.p2.x}
						cy={flower?.ab.edge.p2.y}
						r="4"
						fill="green"
						stroke="none"
					/>
					<circle
						cx={flower?.bc.edge.p1.x}
						cy={flower?.bc.edge.p1.y}
						r="4"
						fill="green"
						stroke="none"
					/>
					<circle
						cx={flower?.bc.edge.p2.x}
						cy={flower?.bc.edge.p2.y}
						r="4"
						fill="green"
						stroke="none"
					/>
					<circle
						cx={flower?.ac.edge.p1.x}
						cy={flower?.ac.edge.p1.y}
						r="4"
						fill="green"
						stroke="none"
					/>
					<circle
						cx={flower?.ac.edge.p2.x}
						cy={flower?.ac.edge.p2.y}
						r="4"
						fill="green"
						stroke="none"
					/>

					<circle
						cx={flower?.ab.inner.p1.x}
						cy={flower?.ab.inner.p1.y}
						r="4"
						fill="blue"
						stroke="none"
					/>
					<circle
						cx={flower?.ab.inner.p2.x}
						cy={flower?.ab.inner.p2.y}
						r="4"
						fill="blue"
						stroke="none"
					/>
					<circle
						cx={flower?.bc.inner.p1.x}
						cy={flower?.bc.inner.p1.y}
						r="4"
						fill="blue"
						stroke="none"
					/>
				</g>
			{/if}
		{/each}
		<g
			stroke="black" 
			stroke-width=0.5 
			fill="none" 
			transform={`
				scale(3.04138126514911 2.3728949893812477)
			`}>
		>
			<g
			transform={`
				skewX(${-0.8001113820617539 * 180 / Math.PI + Math.PI})
			`}
			>
				<g 
				transform={`
					rotate(${-0.16514867741462683 * 180 / Math.PI})
				`}
				>
					<path d={`M 0 0 L 100 0 L 50 ${Math.sqrt(100**2 - 50**2)} z `} />
				</g>
			</g>
		</g>

		<!-- {#if flowerConfig.type === 'specified' && showRefPattern}
			<g
				transform={`scale(${flowerConfig.scaleX} ${flowerConfig.scaleY}), skewX(${
					flowerConfig.skewX ? (180 / Math.PI) * flowerConfig.skewX : 0
				}), rotate(${flowerConfig.rotation ? (180 / Math.PI) * flowerConfig.rotation : 0})`}
			>
				{#each refPattern as rp}
					<path d={svgTriangle(rp.triangle)} fill="rgba(200, 0, 0, 0.1)" />
					<g stroke="red" stroke-width={0.005} fill="rgba(0, 100, 200, 0.1)">
						<circle cx={rp.ab.x} cy={rp.ab.y} r={rp.ab.r} />
						<circle cx={rp.bc.x} cy={rp.bc.y} r={rp.bc.r} />
						<circle cx={rp.ac.x} cy={rp.ac.y} r={rp.ac.r} />
					</g>
				{/each}
			</g>
		{/if} -->
	</svg>
</div>

<style>
	.row {
		display: flex;
		flex-direction: row;
		gap: 10px;
		padding: 5px;
		border: 1px solid black;
		border-radius: 3px;
		margin: 5px;
	}
</style>
