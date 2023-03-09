<script lang="ts">
	import type { LevelConfig } from '../../lib/shade';
	import { getShade } from '../../lib/shade';
	import ThreeRenderer from '../../components/three-renderer/ThreeRenderer.svelte';
	import CutPattern from '../../components/cut-pattern/CutPattern.svelte';
	import Controls from '../../components/controls/Controls.svelte';
	import { reducible } from '../../lib/stores.js';
  import {useShadeReducer} from "../../lib/use-shade-reducer"

	const sides = 20;
	const levelCount = 4;
	const baseAngle = (Math.PI * 2) / sides;
	const ringOffsetRatio = 0.1; // z-offset of each ring relative to the level above it, as a fraction of the strutlength

	const getShadeConfig = (levelCount: number): LevelConfig[] => {
		const emptyLevel: LevelConfig = {
			r: 20,
			w: 16,
			offset: { x: 0, y: 0, z: 1, rotx: 0, roty: 0, rotz: 0 }
		};
		let config = new Array(levelCount);
		config.fill(emptyLevel);
		config = config.map((level, l, config) => {
			return {
				r:  10 - 2 * l, //4 + 20 * Math.sin((Math.PI * l) / levelCount),
				w: 2,
					// 0.2 +
					// 2 *
					// 	Math.sin(1 + (2 * Math.PI * l) / levelCount) *
						// Math.sin(1 + (2 * Math.PI * l) / levelCount),
				offset: {
					x: 0, // 5 * Math.sin((Math.PI * l) / levelCount),
					y: 0, //5 * Math.sin((Math.PI * l) / levelCount),
					z: (10 * l) / levelCount,
					rotx: 0,
					roty: 0, // * Math.cos((2 * Math.PI * l) / levelCount),
					rotz: 0
				}
			};
		});

		return config;
	};

  const [ reactiveShadeConfig, dispatch ] = useShadeReducer(getShadeConfig(levelCount))

	// const countReducer = (count: number, action: CountAction) => {
	// 	switch (action.type) {
	// 		case 'increment':
	// 			return count + action.payload;
	// 		case 'decrement':
	// 			return count - 1;
	// 		default:
	// 			throw new Error();
	// 	}
	// };
	// type CountAction = { type: 'increment'; payload: number } | { type: 'decrement' };
	// const [ count, dispatch ] = reducible<number, CountAction>(0, countReducer);

	let shadeConfig: LevelConfig[] = getShadeConfig(levelCount);

	const { levels, rings, struts, ribbons } = getShade(shadeConfig, sides, ringOffsetRatio);
</script>

<main>
	<section class="container three">
		<ThreeRenderer {levels} {rings} {struts} {ribbons} />
	</section>
	<section class="container svg">
		<h2>Cut Pattern</h2>
		<CutPattern {rings} {levels} {struts} {ribbons}/>
	</section>
	<section class="container controls">
		<h2>Controls</h2>
		<!-- <Controls {shadeConfig} {reactiveShadeConfig} shadeDispatch={dispatch}/> -->
	</section>
</main>

<style>
	main {
		height: 100vh;
		width: 100%;

		display: grid;
		grid-template-rows: 1fr 1fr;
		grid-template-columns: 1fr 1fr;
	}
	section.container {
		height: 100%;
		width: 100%;
		border: 1px solid gray;
	}
	section.container.three {
		grid-column: 1 / 2;
		grid-row: 1 / 3;
	}
	section.container.controls {
		grid-column: 2 / 3;
		grid-row: 1 / 2;
	}
	section.container.svg {
		grid-column: 2/ 3;
		grid-row: 2 / 3;
	}
</style>
