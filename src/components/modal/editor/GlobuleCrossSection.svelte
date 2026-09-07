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
	import { isReflectedSymmetry, radialUnitAngle } from '$lib/geometry/radial-shape';

	// Derived from the store so an externally loaded config shows up here; the old
	// version read into a plain `let` and never updated.
	let sgIndex = $derived($selectedBand?.s ?? 0);
	let globuleConfig = $derived($superConfigStore.subGlobuleConfigs[sgIndex]?.globuleConfig);
	let shapeConfig = $derived(globuleConfig?.shapeConfig);

	let isRadial = $derived(
		shapeConfig?.symmetry === 'radial' || shapeConfig?.symmetry === 'radial-lateral'
	);
	/**
	 * The angle the authored run spans — half a wedge when the shape is
	 * reflected, a whole wedge otherwise. This is what the terminal anchors are
	 * locked to, so it must match what the generator expects.
	 */
	let unitAngle = $derived(
		// shapeConfig is typed as always-present (TS can't see the out-of-range
		// index case), so referencing `shapeConfig?.symmetryNumber` in the
		// fallback branch narrows to `never`. When shapeConfig is actually
		// missing at runtime that access would be undefined anyway, so the
		// fallback here (equivalent to dividing by 1) is simplified to a constant.
		shapeConfig ? radialUnitAngle(shapeConfig) : Math.PI * 2
	);

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
			return generateDefaultRadialShapeConfig(symmetryNumber, shape.sampleMethod, shape.symmetry);
		});

	const setSymmetry = (event: Event) => {
		const value = (event.target as HTMLSelectElement).value as ShapeConfig['symmetry'];
		updateShape((shape) => {
			if (value === shape.symmetry) return shape;
			// Radial and asymmetric shapes have incompatible curve layouts, so switching
			// between those families rebuilds from the matching default.
			const wasRadial = shape.symmetry === 'radial' || shape.symmetry === 'radial-lateral';
			const isNowRadial = value === 'radial' || value === 'radial-lateral';
			// Reflected and unreflected runs span different angles (half wedge vs
			// whole), so crossing that boundary needs a rebuild too, not just a
			// relabel.
			const reflectionChanged = isReflectedSymmetry(shape.symmetry) !== isReflectedSymmetry(value);
			if (wasRadial === isNowRadial && !reflectionChanged) return { ...shape, symmetry: value };
			return isNowRadial
				? generateDefaultRadialShapeConfig(
						Math.max(3, shape.symmetryNumber),
						shape.sampleMethod,
						value
					)
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

	/**
	 * Set the chord between the two terminal anchors.
	 *
	 * Unreflected, the ends share a radius, so the chord determines it outright.
	 * Reflected, the ends are radius-independent — forcing them equal here would
	 * quietly undo the asymmetry the editor now allows — so both radii scale by
	 * the same factor instead. The chord is linear in that factor (law of
	 * cosines with the angle between the ends held fixed), so scaling by
	 * `value / currentChord` lands exactly on the requested length while
	 * preserving the authored ratio between the two ends.
	 */
	const setSideLength = (value: number) => {
		if (!value || !shapeConfig) return;
		updateShape((shape) => {
			const curves = shape.curves.map((curve) => ({
				...curve,
				points: [...curve.points] as BezierConfig['points']
			}));
			if (curves.length === 0) return shape;
			const last = curves.length - 1;
			const start = curves[0].points[0];
			const end = curves[last].points[3];

			let startRadius: number;
			let endRadius: number;
			if (isReflected) {
				const chord = getLength(start, end);
				if (!chord) return shape;
				const scale = value / chord;
				startRadius = Math.hypot(start.x, start.y) * scale;
				endRadius = Math.hypot(end.x, end.y) * scale;
			} else {
				// `unitAngle` is the chord's subtended angle; half of it gives the
				// right-triangle angle relating chord to radius.
				startRadius = value / (2 * Math.sin(unitAngle / 2));
				endRadius = startRadius;
			}

			curves[0].points[0] = { ...start, ...pointOnRay(startRadius, 0) } as PointConfig2;
			curves[last].points[3] = {
				...end,
				...pointOnRay(endRadius, unitAngle)
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

	// A reflected run is paired with its mirror about the ray through its end
	// anchor, and that mirror preserves radius — so closure constrains only the
	// two end ANGLES, leaving their radii independent. An unreflected run must
	// satisfy p3 === rot(p0, wedge), which forces a shared radius.
	let isReflected = $derived(!!shapeConfig && isReflectedSymmetry(shapeConfig.symmetry));

	let limits = $derived(
		isRadial
			? [radialEndLock(unitAngle, { coupleRadius: !isReflected }), neighborPointMatch]
			: [neighborPointMatch]
	);
</script>

<Editor>
	<section>
		<header>Globule Cross Section</header>
		<Container direction="row">
			<Container direction="column">
				{#if shapeConfig}
					{#snippet shapeOverlay({ modelCurveDef, toDisplay, canv }: PathEditorOverlayContext)}
						<path
							d={pathFromCurves(
								toDisplay(
									radializeCurves(modelCurveDef, {
										symmetryNumber: shapeConfig.symmetryNumber,
										symmetry: shapeConfig.symmetry
									})
								)
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
							<option value="divideSide">By Side</option>
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
