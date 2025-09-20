import { writable } from "svelte/store";
import type { SVGFontDictionary } from "./svg-text";



export const svgTextDictionary = writable<undefined | SVGFontDictionary>(undefined)