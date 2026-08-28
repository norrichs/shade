<script lang="ts">
	import { get } from 'svelte/store';
	import { selectedBand, superConfigStore } from '$lib/stores';
	import { getLength } from '$lib/patterns/utils';
	import type {
		BezierConfig,
		CurveSampleMethod,
		PointConfig2,
		ShapeConfig,
		SuperGlobuleConfig
	} from '$lib/types';
	import { isCurveSampleMethodMethod } from '$lib/types';
	import {
		generateDefaultAsymmetricShapeConfig,
		generateDefaultRadialShapeConfig
	} from '$lib/shades-config';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import LabeledControl from './LabeledControl.svelte';
	import PathEditor, { type PathEditorOverlayContext } from './PathEditor.svelte';
	import { neighborPointMatch, pointOnRay, radialEndLock } from './path-editor';
	import { pathFromCurves, radializeCurves } from './curve-preview';

	// Derived from the store so an externally loaded config shows up here; the old
	// version read into a plain `let` and never updated.
	let sgIndex = $derived($selectedBand?.s ?? 0);
	let globuleConfig = $derived($superConfigStore.subGlobuleConfigs[sgIndex]?.globuleConfig);
	let shapeConfig = $derived(globuleConfig?.shapeConfig);

	let isRadial = $derived(
		shapeConfig?.symmetry === 'radial' || shapeConfig?.symmetry === 'radial-lateral'
	);
	let isReflected = $derived(
		shapeConfig?.symmetry === 'lateral' || shapeConfig?.symmetry === 'radial-lateral'
	);
	/** The angle one symmetry wedge spans. */
	let wedgeAngle = $derived((Math.PI * 2) / (shapeConfig?.symmetryNumber || 1));

	/**
	 * Replace the shape config, rebuilding the references down to it. See the note
	 * in Silhouette.svelte: `$derived` stops propagating when a step returns the
	 * reference it returned last time, so in-place edits leave this panel stale.
	 */
	const updateShape = (mutate: (shape: ShapeConfig) => ShapeConfig) => {
		const config: SuperGlobuleConfig = get(superConfigStore);
		if (!config.subGlobuleConfigs[sgIndex]) return;
		config.subGlobuleConfigs = config.subGlobuleConfigs.map((sub, index) =>
			index === sgIndex
				? {
						...sub,
						globuleConfig: {
							...sub.globuleConfig,
							shapeConfig: mutate(sub.globuleConfig.shapeConfig)
						}
					}
				: sub
		);
		superConfigStore.set(config);
	};

	const setCurves = (curves: BezierConfig[]) => updateShape((shape) => ({ ...shape, curves }));

	/**
	 * Changing the side count regenerates the shape from the radial default, as the
	 * legacy panel did: the existing curve spans one wedge, and keeping it across a
	 * change of wedge angle leaves an unclosable figure.
	 *
	 * Unlike the legacy version this preserves the current sampling instead of
	 * silently resetting it to divideCurve/4.
	 */
	const setSymmetryNumber = (value: number) =>
		updateShape((shape) => {
			const symmetryNumber = Math.max(1, Math.round(value));
			if (symmetryNumber === shape.symmetryNumber) return shape;
			if (shape.symmetry !== 'radial' && shape.symmetry !== 'radial-lateral') {
				return { ...shape, symmetryNumber };
			}
			return {
				...generateDefaultRadialShapeConfig(symmetryNumber, shape.sampleMethod),
				symmetry: shape.symmetry
			};
		});

	const setSymmetry = (event: Event) => {
		const value = (event.target as HTMLSelectElement).value as ShapeConfig['symmetry'];
		updateShape((shape) => {
			if (value === shape.symmetry) return shape;
			// Radial and asymmetric shapes have incompatible curve layouts, so switching
			// between those families rebuilds from the matching default.
			const wasRadial = shape.symmetry === 'radial' || shape.symmetry === 'radial-lateral';
			const isNowRadial = value === 'radial' || value === 'radial-lateral';
			if (wasRadial === isNowRadial) return { ...shape, symmetry: value };
			return isNowRadial
				? {
						...generateDefaultRadialShapeConfig(
							Math.max(3, shape.symmetryNumber),
							shape.sampleMethod
						),
						symmetry: value
					}
				: { ...generateDefaultAsymmetricShapeConfig(shape.sampleMethod), symmetry: value };
		});
	};

	const setSampleMethod = (event: Event) => {
		const value = (event.target as HTMLSelectElement).value;
		if (!isCurveSampleMethodMethod(value)) return;
		updateShape((shape) => ({
			...shape,
			sampleMethod: { ...shape.sampleMethod, method: value } as CurveSampleMethod
		}));
	};

	const setDivisions = (value: number) =>
		updateShape((shape) => ({
			...shape,
			sampleMethod: { ...shape.sampleMethod, divisions: value } as CurveSampleMethod
		}));

	/**
	 * The chord between the wedge's two terminal anchors. Only meaningful for a
	 * radial shape of at least three sides.
	 */
	let sideLength = $derived.by(() => {
		if (!shapeConfig || !isRadial || shapeConfig.symmetryNumber < 3) return undefined;
		const { curves } = shapeConfig;
		if (curves.length === 0) return undefined;
		return getLength(curves[0].points[0], curves[curves.length - 1].points[3]);
	});

	/** Move both terminal anchors onto the wedge rays at the radius this chord implies. */
	const setSideLength = (value: number) => {
		if (!value || !shapeConfig) return;
		const alpha = Math.PI / shapeConfig.symmetryNumber;
		const radius = value / (2 * Math.sin(alpha));
		updateShape((shape) => {
			const curves = shape.curves.map((curve) => ({
				...curve,
				points: [...curve.points] as BezierConfig['points']
			}));
			if (curves.length === 0) return shape;
			const last = curves.length - 1;
			curves[0].points[0] = { ...curves[0].points[0], ...pointOnRay(radius, 0) } as PointConfig2;
			curves[last].points[3] = {
				...curves[last].points[3],
				...pointOnRay(radius, 2 * alpha)
			} as PointConfig2;
			return { ...shape, curves };
		});
	};

	const editorConfig = {
		gutter: 300,
		padding: 100,
		contentBounds: { top: -100, left: -100, width: 200, height: 200 },
		size: { width: 300, height: 300 }
	};

	let limits = $derived(
		isRadial ? [radialEndLock(wedgeAngle), neighborPointMatch] : [neighborPointMatch]
	);
</script>

<Editor>
	<section>
		<header>Globule Cross Section</header>
		<Container direction="row">
			<Container direction="column">
				{#if shapeConfig}
					{#snippet shapeOverlay({ curveDef, canv }: PathEditorOverlayContext)}
						<path
							d={pathFromCurves(
								radializeCurves(curveDef, {
									symmetryNumber: shapeConfig.symmetryNumber,
									reflect: isReflected
								})
							)}
							fill="rgba(255,90,0,0.35)"
							stroke="rgba(0,0,0,0.4)"
							stroke-width={0.5 * canv.scale}
						/>
					{/snippet}
					<PathEditor
						flipY
						curveDef={shapeConfig.curves}
						onChangeCurveDef={setCurves}
						config={editorConfig}
						{limits}
						coupling="full"
						enablePointTypeToggle
						showCurveTools
						showPointInputsToggle
						editorId="globule-cross-section"
						overlay={isRadial ? shapeOverlay : undefined}
					>
						<circle cx="0" cy="0" r="3" stroke="black" stroke-width="0.25" fill="none" />
					</PathEditor>
				{/if}
			</Container>

			<Container direction="column">
				{#if shapeConfig}
					<LabeledControl label="Symmetry">
						<select value={shapeConfig.symmetry} onchange={setSymmetry}>
							<option value="asymmetric">asymmetric</option>
							<option value="radial">radial</option>
							<option value="lateral">lateral</option>
							<option value="radial-lateral">radial-lateral</option>
						</select>
					</LabeledControl>
					<LabeledControl label="Sides">
						<NumberInput
							value={shapeConfig.symmetryNumber}
							onChange={setSymmetryNumber}
							min={1}
							max={99}
							step={1}
							hasButtons
						/>
					</LabeledControl>
					<LabeledControl label="Side length" show={sideLength !== undefined}>
						{#if sideLength !== undefined}
							<NumberInput
								value={Math.round(sideLength * 1000) / 1000}
								onChange={setSideLength}
								hasButtons
							/>
						{/if}
					</LabeledControl>
					<LabeledControl label="Sampling">
						<select value={shapeConfig.sampleMethod.method} onchange={setSampleMethod}>
							<option value="divideCurvePath">By Whole Curve</option>
							<option value="divideCurve">By Sub-curve</option>
						</select>
					</LabeledControl>
					<LabeledControl label="Divisions">
						<NumberInput
							value={shapeConfig.sampleMethod.divisions}
							onChange={setDivisions}
							min={0}
							max={99}
							hasButtons
						/>
					</LabeledControl>
				{/if}
			</Container>
		</Container>
	</section>
</Editor>
