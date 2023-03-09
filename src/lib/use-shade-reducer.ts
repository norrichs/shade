import { reducible } from './redicible-store.js';
import type { LevelConfig } from './shade.js';

const shadeReducer = (shade: LevelConfig[], action: ShadeAction) => {
	const { type, payload } = action
	const {level} = payload
	switch (type) {
		case "radius":
			return [...shade.slice(0, level), shade[level], ...shade.slice(level + 1)]
		default:
			throw new Error()
	}
}

export type ShadeAction =
	| { type: "radius", payload: { level: number, value: number } }
	| { type: "width", payload: { level: number, value: number}}
  
export const useShadeReducer = (initial: LevelConfig[]) => reducible<LevelConfig[], ShadeAction>(initial, shadeReducer)
