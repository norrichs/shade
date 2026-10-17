import { svgPathStringFromSegments } from '#lib/patterns/utils.js';
import { CHAR_GAP } from '#lib/svg-text-metrics.js';
import {
	isCubicBezierPathSegment,
	isLinePathSegment,
	isMovePathSegment,
	isQuadraticBezierPathSegment,
	type PathSegment
} from '#lib/types.js';

export type SVGFontDictionary = {
	[key: string]: {
		path: PathSegment[];
		svgPath: string;
		width: number;
	};
};

const getWidth = (path: PathSegment[]) => {
	const xValues = path
		.map((segment) => (segment[0] === 'Z' ? 0 : segment[segment.length - 2]))
		.flat() as number[];
	const width = Math.max(...xValues) - Math.min(...xValues);
	return width;
};

export const processSvg = (rawText: string, rawSvg: string): SVGFontDictionary => {
	const pathArray = parseSvg(rawSvg);
	const widthArray = pathArray.map((path) => getWidth(path));
	const textArray = rawText.split('');
	const dict = Object.fromEntries(
		textArray.map((key, i) => {
			let svgPath = '';
			try {
				svgPath = svgPathStringFromSegments(pathArray[i]);
			} catch {
				console.error(key);
			}
			return [
				key,
				{
					path: pathArray[i],
					svgPath,
					width: widthArray[i]
				}
			];
		})
	);

	return dict;
};
export const getChars = (str: string, dictionary: SVGFontDictionary | undefined) => {
	if (!dictionary) throw Error('no svg text dictionary defined');
	let runningOffset = 0;
	const chars = str.split('').map((char) => {
		// const char = c === ' ' ? '-' : c;
		const { svgPath, width } = dictionary[char];
		runningOffset += width + CHAR_GAP;
		return { charId: char, char: svgPath, offset: runningOffset - width / 2 };
	});

	return { chars, totalWidth: runningOffset };
};

const parseSvg = (svgStr: string): PathSegment[][] => {
	const arr = svgStr.split('<').filter((str) => str.startsWith('path'));
	const characters = arr.map((str) => {
		const trimmed = str.split('"')[1];
		const character = parsePathStrings(trimmed);
		return character;
	});
	const normalizedCharacters = characters.map((char: PathSegment[]) =>
		normalizePathSegments(char, 0.01)
	);
	return normalizedCharacters;
};

const normalizePathSegments = (char: PathSegment[], scale: number): PathSegment[] => {
	let minX = 0;
	char.forEach((ps, i) => {
		if (i === 0) minX = ps[1] || 0;
		if (typeof ps[1] === 'number' && ps[1] < minX) minX = ps[1];
		if (typeof ps[3] === 'number' && ps[3] < minX) minX = ps[3];
		if (typeof ps[5] === 'number' && ps[5] < minX) minX = ps[5];
	});
	const xNormalized = char.map((ps) => {
		const result = [...ps];
		if (ps[1]) result[1] = ps[1] - minX;
		if (ps[3]) result[3] = ps[3] - minX;
		if (ps[5]) result[5] = ps[5] - minX;
		return result;
	});
	return (xNormalized as PathSegment[]).map((ps) => {
		if (isMovePathSegment(ps) || isLinePathSegment(ps))
			return [ps[0], ps[1] * scale, ps[2] * scale];
		if (isQuadraticBezierPathSegment(ps))
			return [ps[0], ps[1] * scale, ps[2] * scale, ps[3] * scale, ps[4] * scale];
		if (isCubicBezierPathSegment(ps))
			return [
				ps[0],
				ps[1] * scale,
				ps[2] * scale,
				ps[3] * scale,
				ps[4] * scale,
				ps[5] * scale,
				ps[6] * scale
			];
		return ps;
	});
};

const parsePathStrings = (str: string): PathSegment[] => {
	const commands = str.match(/[MLQCZ][^MLQCZ]*/g) || [];
	return commands.map((cmd) => {
		const type = cmd[0];
		const params = cmd
			.slice(1)
			.trim()
			.split(/\s+/)
			.map(Number)
			.filter((n) => !isNaN(n));
		switch (type) {
			case 'M':
			case 'L':
				return [type, params[0], params[1]] as PathSegment;
			case 'C':
				return [type, params[0], params[1], params[2], params[3], params[4], params[5]];
			case 'Q':
				return [type, params[0], params[1], params[2], params[3]] as PathSegment;
			case 'Z':
				return [type] as PathSegment;
			default:
				throw Error();
		}
	});
};
