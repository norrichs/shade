import { derived, writable } from 'svelte/store';
import {
	superConfigStore as cfg,
	selectedGlobule as selected,
	superGlobuleStore
} from '$lib/stores';
import { getCubicBezier } from '$lib/util';
import type { BezierConfig, Point } from '$lib/types';
import { Vector2 } from 'three';

const WIDTH = 40;

export const curveStore = writable<BezierConfig[]>([]);

export const spineCurveRibStore = derived(
	[cfg, selected, curveStore, superGlobuleStore],
	([$cfg, $selected, $curveStore, $superGlobuleStore]) => {
		const origin = new Vector2(0, 0);
		const divisions =
			$cfg.subGlobuleConfigs[$selected.subGlobuleConfigIndex].globuleConfig.levelConfig
				.silhouetteSampleMethod.divisions;
		const spineCurveConfigs = $curveStore;
		const levels =
			$superGlobuleStore.subGlobules[$selected.subGlobuleConfigIndex].data[0].data.levels;

		const elevations = levels.map((level) => level.center.z).sort();

		const spineCurves = spineCurveConfigs.map((curveConfig) => getCubicBezier(curveConfig));

		const ribs: { point: Point; anchor: Point; tangent: Point; rib1: Point; rib2: Point }[] = [];

		spineCurveConfigs.forEach((curveConfig) => {
			const curve = getCubicBezier(curveConfig);
			const ribPoints = curve.getSpacedPoints(divisions).map((p, i) => {
				const width = WIDTH;
				const u = i / divisions;
				const a = curve.getPointAt(u);
				const tangent = curve.getTangentAt(u);
				const normal = tangent.clone().rotateAround(origin, Math.PI / 2);
				const normal2 = tangent.clone().rotateAround(origin, (Math.PI / 2) * 3);

				const tan = a.clone().addScaledVector(tangent, width);
				const rib1 = a.clone().addScaledVector(normal, width);
				const rib2 = a.clone().addScaledVector(normal2, width);

				const rib = {
					point: { x: p.x, y: -p.y },
					anchor: { x: a.x, y: -a.y },
					tangent: { x: tan.x, y: -tan.y },
					rib1: { x: rib1.x, y: -rib1.y },
					rib2: { x: rib2.x, y: -rib2.y }
				};
				return rib;
			});
			ribs.push(...ribPoints);
		});
		return ribs;
	}
);

// export const spineCurveRibStore = derived([cfg, selected], ([$cfg, $selected]) => {
// 	const origin = new Vector2(0, 0);
// 	const divisions =
// 		$cfg.subGlobuleConfigs[$selected.subGlobuleConfigIndex].globuleConfig.levelConfig
// 			.silhouetteSampleMethod.divisions;
// 	const spine =
// 		$cfg.subGlobuleConfigs[$selected.subGlobuleConfigIndex].globuleConfig.spineCurveConfig;
// 	const ribs: { point: Point; anchor: Point; tangent: Point; rib1: Point; rib2: Point }[] = [];
// 	spine.curves.forEach((curveConfig) => {
// 		const curve = getCubicBezier(curveConfig);
// 		const ribPoints = curve.getSpacedPoints(divisions).map((p, i) => {
// 			const width = WIDTH;
// 			const u = i / divisions;
// 			const a = curve.getPointAt(u);
// 			const tangent = curve.getTangentAt(u);
//       const normal = tangent.clone().rotateAround(origin, Math.PI / 2);
//       const normal2 = tangent.clone().rotateAround(origin, Math.PI / 2 * 3)

// 			const tan = a.clone().addScaledVector(tangent, width);
// 			const rib1 = a.clone().addScaledVector(normal, width);
// 			const rib2 = a.clone().addScaledVector(normal2, width);

// 			const rib = {
// 				point: { x: p.x, y: -p.y },
// 				anchor: { x: a.x, y: -a.y },
// 				tangent: { x: tan.x, y: -tan.y },
// 				rib1: { x: rib1.x, y: -rib1.y },
// 				rib2: { x: rib2.x, y: -rib2.y }
// 			};
// 			return rib;
// 		});
// 		ribs.push(...ribPoints);
// 	});
// 	return ribs;
// });
