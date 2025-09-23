<script lang="ts">
	import { printProjectionAddress } from '$lib/projection-geometry/generate-projection';
	import type { HingePattern, PanelPattern } from '$lib/types';
	import { Vector3 } from 'three';
	import SvgText from './SvgText/SvgText.svelte';

	export let hingePattern: HingePattern;
	export let panel: PanelPattern;
	export let showTriangles = false;
	export let patternStyle: 'view' | 'cut';

	const getOutlinePath = (outline: HingePattern['pattern']['outline']) => {
		const path = outline.reduce((path, point, index) => {
			if (index === 0) {
				return `M ${point.x} ${point.y}`;
			}
			return `${path} L ${point.x} ${point.y}`;
		}, '');
		return path;
	};

	const getHexPath = (x: number, y: number, radius: number) => {
		let path = '';
		for (let i = 0; i < 6; i++) {
			const angle = (i * Math.PI) / 3;
			const nextX = x + radius * Math.cos(angle);
			const nextY = y + radius * Math.sin(angle);
			path += ` ${i === 0 ? 'M' : 'L'} ${nextX} ${nextY}`;
		}
		path += ` Z`;
		return path;
	};

	const getHingeMarks = ([v1, v2]: [Vector3, Vector3]) => {
		const v1_2 = new Vector3().lerpVectors(v1, v2, 0.1);
		const v2_1 = new Vector3().lerpVectors(v2, v1, 0.1);
		return `M ${v1.x} ${v1.y} L ${v1_2.x} ${v1_2.y} M ${v2_1.x} ${v2_1.y} L ${v2.x} ${v2.y}`;
	};
	const getRegistrationMarks = (v: Vector3, [v0, v1]: [Vector3, Vector3]) => {
		const reg0 = new Vector3().lerpVectors(v, v0, 0.1);
		const reg1 = new Vector3().lerpVectors(v, v1, 0.1);
		const perpVector = reg0
			.clone()
			.addScaledVector(v, -1)
			.applyAxisAngle(new Vector3(0, 0, 1), Math.PI / 2)
			.setLength(4);
		const reg2 = v.clone().addScaledVector(perpVector, 1);
		const reg3 = v.clone().addScaledVector(perpVector, -1);
		return `M ${reg0.x} ${reg0.y} L ${reg1.x} ${reg1.y} M ${reg2.x} ${reg2.y} L ${reg3.x} ${reg3.y}`;
	};
	const colors = {
		ab: 'rgba(255, 69, 0, .1)',
		bc: 'rgba(0, 69, 200, .1)',
		ac: 'rgba(0, 200, 69, .1)'
	};

	$: outlinePath = getOutlinePath(hingePattern.pattern.outline);
</script>

{#if patternStyle === 'cut'}
	<g stroke="black" stroke-width="0.2" fill="none">
		<path d={outlinePath}/>
		<path d={getHingeMarks(hingePattern.pattern.hinge)} />
		<path
			d={getRegistrationMarks(hingePattern.pattern.registrationPoint, hingePattern.pattern.hinge)}
		/>
		<SvgText
			size={3}
			offset={{ x: 'center', y: -3.5 }}
			string={printProjectionAddress(hingePattern.address, {
				hideProjection: true,
				hideTube: true
			})}
			anchor={{
				x: hingePattern.pattern.registrationPoint.x,
				y: hingePattern.pattern.registrationPoint.y
			}}
		/>
		<SvgText
			size={3}
			offset={{ x: 'center', y: 2.5 }}
			string={printProjectionAddress(hingePattern.partnerAddress, {
				hideProjection: true,
				hideTube: true
			})}
			anchor={{
				x: hingePattern.pattern.registrationPoint.x,
				y: hingePattern.pattern.registrationPoint.y
			}}
		/>
		{#each hingePattern.pattern.holes as hole}
			<circle cx={hole.location.x} cy={hole.location.y} r={hole.holeDiameter / 2} />
			<path d={`M ${hole.location.x} ${hole.location.y -hole.nutDiameter / 2} v ${hole.nutDiameter} m ${-hole.nutDiameter / 2} ${-hole.nutDiameter / 2} h ${hole.nutDiameter}`} />
		{/each}
	</g>
{:else}
	<path d={outlinePath} stroke="none" stroke-width="0.2" fill={colors[hingePattern.edge]} />
	{#if showTriangles}
		{#if hingePattern.pattern.partnerBackFaceTriangle}
			<path
				d={`M ${hingePattern.pattern.partnerBackFaceTriangle.a.x} ${hingePattern.pattern.partnerBackFaceTriangle.a.y} L ${hingePattern.pattern.partnerBackFaceTriangle.b.x} ${hingePattern.pattern.partnerBackFaceTriangle.b.y} L ${hingePattern.pattern.partnerBackFaceTriangle.c.x} ${hingePattern.pattern.partnerBackFaceTriangle.c.y} Z`}
				stroke="red"
				fill="none"
				stroke-width="1"
			/>
		{/if}
		{#if hingePattern.pattern.backfFaceTriangle}
			<path
				d={`M ${hingePattern.pattern.backfFaceTriangle.a.x} ${hingePattern.pattern.backfFaceTriangle.a.y} L ${hingePattern.pattern.backfFaceTriangle.b.x} ${hingePattern.pattern.backfFaceTriangle.b.y} L ${hingePattern.pattern.backfFaceTriangle.c.x} ${hingePattern.pattern.backfFaceTriangle.c.y} Z`}
				stroke="blue"
				fill="none"
				stroke-width="1"
			/>
		{/if}
		<!-- {#if panel.meta.backFaceTriangle}
		<path
			d={`M ${panel.meta.backFaceTriangle.a.x} ${panel.meta.backFaceTriangle.a.y} L ${panel.meta.backFaceTriangle.b.x} ${panel.meta.backFaceTriangle.b.y} L ${panel.meta.backFaceTriangle.c.x} ${panel.meta.backFaceTriangle.c.y} Z`}
			stroke="black"
			fill="none"
			stroke-width="2"
		/>
	{/if} -->
	{/if}

	{#if hingePattern.pattern.hinge}
		<path
			d={`M ${hingePattern.pattern.hinge[0].x} ${hingePattern.pattern.hinge[0].y} L ${hingePattern.pattern.hinge[1].x} ${hingePattern.pattern.hinge[1].y}`}
			stroke="rgba(0, 69, 200, .3)"
			stroke-width="2"
			fill="none"
		/>
	{/if}
	<SvgText
		string={printProjectionAddress(hingePattern.address, { hideProjection: true, hideTube: true })}
		anchor={{
			x:
				hingePattern.pattern.hinge[1].x -
				(hingePattern.pattern.hinge[1].x - hingePattern.pattern.hinge[0].x) / 2,
			y:
				hingePattern.pattern.hinge[1].y -
				(hingePattern.pattern.hinge[1].y - hingePattern.pattern.hinge[0].y) / 2
		}}
		offset={{ x: 'center', y: 'center' }}
		size={3}
		color="black"
	/>
	{#each hingePattern.pattern.holes as hole}
		<circle
			cx={hole.location.x}
			cy={hole.location.y}
			r={hole.holeDiameter / 2}
			fill="none"
			stroke="black"
			stroke-width="0.2"
		/>
		<path
			d={getHexPath(hole.location.x, hole.location.y, hole.nutDiameter / 2)}
			fill="none"
			stroke="black"
			stroke-width="0.2"
		/>
	{/each}
{/if}
