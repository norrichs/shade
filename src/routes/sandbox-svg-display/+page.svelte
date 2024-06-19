<script lang="ts">
	let innerSVGHeight = 400;
	let innerSVGWidth = 400;
</script>

<section id="svg-section">
	<svg id="outer-svg" width="400" height="400" viewBox="-400 -400 800 800">
		<svg
			x="-400"
			id="inner-svg"
			width={innerSVGWidth}
			height={innerSVGHeight}
			viewBox={`${-innerSVGWidth / 2} ${-innerSVGHeight / 2} ${innerSVGWidth} ${innerSVGHeight}`}
		>
			<rect
				x={-innerSVGWidth / 2}
				y={-innerSVGHeight / 2}
				width={innerSVGWidth}
				height={innerSVGHeight}
				fill="blue"
				stroke="black"
				stroke-width="5"
			/>
			<circle cx="0" cy="0" r="10" />
		</svg>
		<circle cx="0" cy="0" r="10" fill="green" />
	</svg>
</section>

<style>
	#svg-section {
		background-color: pink;
	}
	#inner-svg {
		background-color: blue;
	}
	#outer-svg {
		background-color: blueviolet;
	}
</style>
