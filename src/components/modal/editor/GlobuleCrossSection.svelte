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
	import { effectiveGcsLevels, gcsLabel } from '$lib/gcs/gcs-placement';
	import { generateLevelPrototype, validateGlobuleShapeConfigs } from '$lib/generate-shape';
	import { selectedGcsIndex } from './gcs-editor-store';
	import { addGcs, deleteGcs, moveGcs, setGcsLevel, setPrimary } from './gcs-editor';

	// Derived from the store so an externally loaded config shows up here; the old
	// version read into a plain `let` and never updated.
	let sgIndex = $derived($selectedBand?.s ?? 0);
	let globuleConfig = $derived($superConfigStore.subGlobuleConfigs[sgIndex]?.globuleConfig);
	let shapeConfigs = $derived(globuleConfig?.shapeConfigs ?? []);
	// Clamp so a shrunken list (or an externally loaded config) never leaves the
	// selection out of range.
	let selected = $derived(
		Math.min(Math.max($selectedGcsIndex, 0), Math.max(shapeConfigs.length - 1, 0))
	);
	let shapeConfig = $derived(shapeConfigs[selected]);

	// Plain numbers/strings only: no Three.js objects in derived proxies.
	let divisions = $derived(globuleConfig?.levelConfig.silhouetteSampleMethod.divisions ?? 0);
	let validation = $derived(globuleConfig ? validateGlobuleShapeConfigs(globuleConfig) : undefined);
	let levels = $derived(effectiveGcsLevels(shapeConfigs, divisions));
	let vertexCounts = $derived(
		globuleConfig
			? shapeConfigs.map(
					(shape) => generateLevelPrototype(shape, globuleConfig.levelConfig).vertices.length
				)
			: []
	);
	let invalidIndices = $derived(
		new Set((validation?.errors ?? []).filter((e) => e.index !== null).map((e) => e.index))
	);
	let listErrors = $derived((validation?.errors ?? []).filter((e) => e.index === null));
	let selectedErrors = $derived((validation?.errors ?? []).filter((e) => e.index === selected));
	let bandCount = $derived(validation?.bandCount ?? 0);

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
							shapeConfigs: sub.globuleConfig.shapeConfigs.map((shape, i) =>
								i === selected ? mutate(shape) : shape
							)
						}
					}
				: sub
		);
		superConfigStore.set(config);
	};

	/** Replace the whole list (add/delete/move/primary/level), rebuilding references. */
	const updateList = (transform: (list: ShapeConfig[]) => ShapeConfig[]) => {
		const config: SuperGlobuleConfig = get(superConfigStore);
		if (!config.subGlobuleConfigs[sgIndex]) return;
		config.subGlobuleConfigs = config.subGlobuleConfigs.map((sub, index) =>
			index === sgIndex
				? {
						...sub,
						globuleConfig: {
							...sub.globuleConfig,
							shapeConfigs: transform(sub.globuleConfig.shapeConfigs)
						}
					}
				: sub
		);
		superConfigStore.set(config);
	};

	const onAdd = () => {
		updateList((list) => addGcs(list, selected));
		selectedGcsIndex.set(selected + 1);
	};
	const onDelete = () => {
		updateList((list) => deleteGcs(list, selected));
		selectedGcsIndex.set(Math.min(selected, shapeConfigs.length - 2));
	};
	const onMove = (dir: -1 | 1) => {
		const target = selected + dir;
		if (target < 0 || target >= shapeConfigs.length) return;
		updateList((list) => moveGcs(list, selected, dir));
		selectedGcsIndex.set(target);
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
		{#each listErrors as error}
			<div class="gcs-error">{error.message}</div>
		{/each}
		<div class="gcs-strip">
			{#each shapeConfigs as shape, i (shape.id ?? i)}
				<button
					type="button"
					class="gcs-chip"
					class:selected={i === selected}
					class:invalid={invalidIndices.has(i)}
					onclick={() => selectedGcsIndex.set(i)}
				>
					{gcsLabel(i)}{shape.isPrimary ? ' ★' : ''}
				</button>
			{/each}
			<button type="button" title="Duplicate after selected" onclick={onAdd}>+</button>
			<button
				type="button"
				title="Delete selected"
				disabled={shapeConfigs.length <= 1}
				onclick={onDelete}>−</button
			>
			<button
				type="button"
				title="Move earlier"
				disabled={selected === 0}
				onclick={() => onMove(-1)}>←</button
			>
			<button
				type="button"
				title="Move later"
				disabled={selected >= shapeConfigs.length - 1}
				onclick={() => onMove(1)}>→</button
			>
		</div>
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
					<LabeledControl label="Primary">
						<input
							type="checkbox"
							checked={!!shapeConfig.isPrimary}
							disabled={!!shapeConfig.isPrimary}
							onchange={() => updateList((list) => setPrimary(list, selected))}
						/>
					</LabeledControl>
					<LabeledControl label="Level" show={shapeConfigs.length > 1}>
						<NumberInput
							value={levels[selected] ?? 0}
							onChange={(v) => updateList((list) => setGcsLevel(list, selected, Math.round(v)))}
							min={0}
							max={divisions}
							step={1}
							hasButtons
						/>
						{#if shapeConfig.level === undefined}
							<span class="gcs-note">auto</span>
						{:else}
							<button
								type="button"
								title="Back to auto"
								onclick={() => updateList((list) => setGcsLevel(list, selected, undefined))}
								>auto</button
							>
						{/if}
					</LabeledControl>
					<div class="gcs-readout">
						{vertexCounts[selected] ?? 0} points / {bandCount} bands
					</div>
					{#each selectedErrors as error}
						<div class="gcs-error">{error.message}</div>
					{/each}
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

<style>
	.gcs-strip {
		display: flex;
		gap: 4px;
		margin-bottom: 8px;
		flex-wrap: wrap;
	}
	.gcs-chip.selected {
		font-weight: bold;
		outline: 2px solid currentColor;
	}
	.gcs-chip.invalid {
		color: #c00;
		border-color: #c00;
	}
	.gcs-error {
		color: #c00;
		font-size: 0.85em;
	}
	.gcs-readout,
	.gcs-note {
		font-size: 0.85em;
		opacity: 0.75;
	}
</style>
