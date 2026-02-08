<script lang="ts">
	import {
		getPathSize,
		rotatePS,
		scalePS,
		svgPathStringFromSegments,
		translatePS
	} from '$lib/patterns/utils';
	import type { PathSegment } from '$lib/types';
	import type { Point } from 'bezier-js';
	import { get } from 'svelte/store';
	import { numberPathSegments } from './number-path-segments';
	import SvgText from './SvgText/SvgText.svelte';
	import { onMount } from 'svelte';
	import { LABEL_TAG_PORTAL_ID, LABEL_TEXT_PORTAL_ID } from './constants';
	import LabelText from './LabelText.svelte';

	let {
		id = undefined,
		color = 'black',
		value,
		addressStrings = undefined,
		radius = 10,
		scale = 1,
		angle = 0,
		anchor = { x: 0, y: 0 },
		portal = undefined
	}: {
		id?: string | undefined;
		color?: string;
		value: number;
		addressStrings?: string[] | undefined;
		radius?: number;
		scale?: number;
		angle?: number;
		anchor?: Point;
		portal?: { transform: string } | undefined;
	} = $props();

	const getLabelPathSegments = ({
		value,
		r,
		addressStrings
	}: {
		value: number;
		r: number;
		addressStrings: string[] | undefined;
	}) => {
		const labelTextPathSegments = `${value}`
			.split('')
			.map((digit, i) => {
				return translatePS(numberPathSegments[Number.parseInt(digit, 10)], 60 * i, 0);
			})
			.flat(1);

		const { width, height } = addressStrings
			? { width: 350, height: 280 }
			: getPathSize(labelTextPathSegments);
		const padding = 20;

		const stemWidth = 20;
		const stemLength = 50;

		const halfWidth = (width + padding * 2) / 2;
		const labelOutlinePathSegments: PathSegment[] = [
			['M', 0, 0],
			['L', stemWidth / 2, 0],
			['L', stemWidth / 2, stemLength],
			['L', halfWidth - r, stemLength],
			['Q', halfWidth, stemLength, halfWidth, r + stemLength],
			['L', halfWidth, stemLength + height - r],
			['Q', halfWidth, height + stemLength, halfWidth - r, height + stemLength],
			['L', r - halfWidth, height + stemLength],
			['Q', -halfWidth, height + stemLength, -halfWidth, height - r + stemLength],
			['L', -halfWidth, r + stemLength],
			['Q', -halfWidth, stemLength, r - halfWidth, stemLength],
			['L', -stemWidth / 2, stemLength],
			['L', -stemWidth / 2, stemLength],
			['L', -stemWidth / 2, 0],
			['Z']
		];

		return [
			...labelOutlinePathSegments,
			...(addressStrings ? [] : translatePS(labelTextPathSegments, 20 - halfWidth, 15 + stemLength))
		];
	};

	const adjust = (segments: PathSegment[], anchor: Point, angle: number, scale: number) => {
		let adjusted = segments;
		adjusted = translatePS(adjusted, anchor.x, anchor.y);
		adjusted = rotatePS(adjusted, angle, anchor);
		adjusted = scalePS(adjusted, -scale, anchor);
		return adjusted;
	};

	let tagElement: SVGGElement;
	let textElement: SVGGElement;

	onMount(() => {
		if (portal) {
			const lableTagContainer = document.getElementById(LABEL_TAG_PORTAL_ID);
			const labelTextContainer = document.getElementById(LABEL_TEXT_PORTAL_ID);
			if (labelTextContainer && textElement) {
				labelTextContainer.appendChild(textElement);
			}
			if (lableTagContainer && tagElement) {
				lableTagContainer.appendChild(tagElement);
			}
		}
	});

	let path = $derived(svgPathStringFromSegments(
		adjust(getLabelPathSegments({ value, r: radius, addressStrings }), anchor, angle, scale)
	));
</script>

{#if portal}
	<path
		d={path}
		fill-rule="evenodd"
		stroke="none"
		fill={color}
		bind:this={tagElement}
		transform={portal.transform}
	/>
	<LabelText
		lines={addressStrings}
		{anchor}
		size={5}
		bind:element={textElement}
		transform={portal.transform}
	/>
{:else}
	<g id={`band-label${id ? `-${id}` : ''}`}>
		<path d={path} fill-rule="evenodd" fill={color} stroke="none" />
		<LabelText lines={addressStrings} {anchor} size={5} color="black" />
	</g>
{/if}
