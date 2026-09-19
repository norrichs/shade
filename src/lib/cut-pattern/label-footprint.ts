import type {
	BandCutPattern,
	BoundingBox,
	PathSegment,
	PatternLabelsConfig,
	Point
} from '$lib/types';
import type { LabelTextDims } from '$lib/stores/mergedPathStore';
import { buildLabelOutlinePath } from './label-outline-path';
import { transformLabelOutlineToBandSpace } from './transform-label-outline';

/**
 * Average glyph advance and line height as a fraction of font size, used to
 * estimate a label's text dimensions when DOM-measured dims aren't available
 * (e.g. before getBBox() settles, or in headless SVG export). Tuned to slightly
 * overshoot the real rendered width so the bounding box always *encloses* the
 * label rather than clipping it.
 */
const GLYPH_ADVANCE = 0.65;
const LINE_HEIGHT = 1.3;

/**
 * Estimate the rendered text bbox for a multi-line label purely from the string
 * content and font size. Deterministic and DOM-free.
 */
export const estimateTextDims = (lines: string[], fontSize: number): LabelTextDims => {
	if (lines.length === 0) return { width: 0, height: 0 };
	const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
	return {
		width: longest * fontSize * GLYPH_ADVANCE,
		height: lines.length * fontSize * LINE_HEIGHT
	};
};

/** Axis-aligned union of two boxes. */
export const unionBox = (a: BoundingBox, b: BoundingBox): BoundingBox => {
	const left = Math.min(a.left, b.left);
	const top = Math.min(a.top, b.top);
	const right = Math.max(a.left + a.width, b.left + b.width);
	const bottom = Math.max(a.top + a.height, b.top + b.height);
	return { left, top, width: right - left, height: bottom - top };
};

/**
 * Axis-aligned bbox of every coordinate in a path. Control points (e.g. the Q
 * handles on the rounded label corners) are included, which can only ever
 * over-estimate — exactly what we want for an enclosing box.
 */
const boundsOfPathSegments = (path: PathSegment[]): BoundingBox => {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const seg of path) {
		const [cmd, ...rest] = seg;
		if (cmd === 'Z') continue;
		// Arc params are not coordinate pairs except the trailing endpoint.
		const coords = cmd === 'A' ? rest.slice(-2) : rest;
		for (let i = 0; i + 1 < coords.length; i += 2) {
			const x = coords[i] as number;
			const y = coords[i + 1] as number;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
	}
	return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
};

export type LabelFootprintInput = {
	anchor: Point;
	/** `band.tagAnchorAutoAngle` (radians). */
	autoAngle: number;
	/** `band.tagAngle ?? config angle` (radians) — offset added to autoAngle. */
	angle: number;
	textWidth: number;
	textHeight: number;
	radius: number;
	padding: number;
	stemLength: number;
	stemWidth: number;
};

/**
 * Footprint (axis-aligned bbox, in band-local coords) of the self-tag label.
 *
 * Mirrors the transform pipeline in `prepare-merge.ts` /
 * `PatternLabel.svelte`: build the outline in label-local space, shift the
 * render anchor by half the stem width along the effective angle, then rotate
 * + translate into band space.
 */
export const computeLabelFootprintBox = (input: LabelFootprintInput): BoundingBox => {
	const {
		anchor,
		autoAngle,
		angle,
		textWidth,
		textHeight,
		radius,
		padding,
		stemLength,
		stemWidth
	} = input;

	const localPath = buildLabelOutlinePath({
		measuredWidth: textWidth,
		measuredHeight: textHeight,
		radius,
		padding,
		stemLength,
		stemWidth
	});

	const effectiveAngle = angle + autoAngle;
	const renderAnchor: Point = {
		x: anchor.x - (stemWidth / 2) * Math.cos(effectiveAngle),
		y: anchor.y - (stemWidth / 2) * Math.sin(effectiveAngle)
	};

	const bandSpacePath = transformLabelOutlineToBandSpace(localPath, renderAnchor, effectiveAngle);
	return boundsOfPathSegments(bandSpacePath);
};

export type EffectiveBandBoundsInput = {
	band: BandCutPattern;
	labels: PatternLabelsConfig | undefined;
	/** Resolved self-tag text lines (from `buildSelfTagLines`). */
	selfTagLines: string[];
	/** Measured label text dims keyed by band id (`labelTextDimensions` store). */
	measuredDims: Map<string, LabelTextDims>;
};

/**
 * The band's bounds expanded to enclose its external self-tag label.
 *
 * Returns `band.bounds` unchanged when the label isn't eligible (self-tag
 * disabled, no anchor, no auto-angle, or no bounds to start from). Eligibility
 * mirrors `prepare-merge.ts`: an anchored self-tag with a defined auto-angle
 * (i.e. outlined bands). Text dims come from the measured store when present,
 * otherwise from `estimateTextDims`.
 */
export const effectiveBandBounds = (input: EffectiveBandBoundsInput): BoundingBox | undefined => {
	const { band, labels, selfTagLines, measuredDims } = input;
	const selfTag = labels?.selfTag;

	if (
		!band.bounds ||
		!selfTag?.enabled ||
		band.tagAnchorAutoAngle === undefined ||
		!band.tagAnchorPoint
	) {
		return band.bounds;
	}

	const height = selfTag.height ?? 14;
	const dims = measuredDims.get(band.id) ?? estimateTextDims(selfTagLines, height);

	const footprint = computeLabelFootprintBox({
		anchor: band.tagAnchorPoint,
		autoAngle: band.tagAnchorAutoAngle,
		angle: (band.tagAngle ?? selfTag.angle ?? 0) + 0,
		textWidth: dims.width,
		textHeight: dims.height,
		radius: height / 4,
		padding: selfTag.padding ?? 10,
		stemLength: selfTag.stemLength ?? 20,
		stemWidth: selfTag.stemWidth ?? 4
	});

	return unionBox(band.bounds, footprint);
};
