<script lang="ts">
	import { svgLines } from '$lib/patterns/quadrilateral';
	import { isSVGLoggerCircle, isSVGLoggerDirectionalLine, logger, type SVGDebug } from './logger';

	const doTest = (index: number, content: any) => {
		return 10;
	};
	const loggerColor = (index: number) =>
		$logger.config.colors[index % $logger.config.colors.length];


	const getTransformFor = (db: SVGDebug) => {
		if (isSVGLoggerDirectionalLine(db) && db.directionalLine.for) {
			const elem = document.querySelector(`#${db.directionalLine.for}`)
			const transform = elem?.getAttribute("transform")
			return transform
		}
	}
</script>

{#each $logger.debug as db, i}
	<g
		id="svg-logger-overlay"
		opacity={$logger.config.opacity}
		fill="none"
		stroke-width={$logger.config.strokeWidth}
		transform={getTransformFor(db)}
	>
		<defs>
			<marker id={`circle-marker-${i}`} refX="4" refY="4" viewBox="0 0 8 8" fill={loggerColor(i)}>
				<circle cx="4" cy="4" r="4" />
			</marker>
			<marker
				id={`directional-marker-${i}`}
				viewBox="0 0 10 10"
				refX="10"
				refY="5"
				markerWidth="6"
				markerHeight="6"
				orient="auto-start-reverse"
				fill={loggerColor(i)}
			>
				<path d="M 0 0 L 10 5 L 0 10 L 5 5 z" />
			</marker>
		</defs>
		{#if typeof db === 'string'}
			<path d={db} stroke={loggerColor(i)} />
		{:else if isSVGLoggerCircle(db)}
			<circle cx={db.circle.x} cy={db.circle.y} r="5" fill={loggerColor(i)} />
		{:else if isSVGLoggerDirectionalLine(db)}
			<path
				d={svgLines(db.directionalLine.points)}
				stroke={loggerColor(i)}
				marker-mid={`url(#directional-marker-${i}`}
				marker-end={`url(#directional-marker-${i}`}
				marker-start={`url(#circle-marker-${i}`}
			/>
		{/if}
		{#if isSVGLoggerDirectionalLine(db) && db.directionalLine.points.length > 0}
			{#each db.directionalLine.labels as label, i}
				<text
					x={db.directionalLine.points[i].x}
					y={db.directionalLine.points[i].y}
					fill="black"
					font-size="3">{label}</text
				>
			{/each}
		{/if}
		{#if isSVGLoggerDirectionalLine(db)}
			<text
				x={db.directionalLine.points[0].x}
				y={db.directionalLine.points[0].y}
				fill="black"
				font-size="4">{`${db.directionalLine.label}`}</text
			>
		{/if}
	</g>
{/each}
