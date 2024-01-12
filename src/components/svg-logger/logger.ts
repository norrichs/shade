import type { Point } from '$lib/patterns/flower-of-life.types';
import { LineSegment } from '$lib/patterns/shapes';
import { Bezier } from 'bezier-js';
import { writable } from 'svelte/store';
// eslint-disable-next-line @typescript-eslint/no-explicit-any

export type SVGLoggerDirectionalLine = {
	directionalLine: {
		points: Point[];
		label?: string;
		labels?: string[];
		for?: string;
	};
};
export type SVGLoggerDirectionalBezier = {
	directionalBezier: {
		points: Point[];
		label?: string;
		labels?: string[];
		for?: string;
	};
};

export type SVGLoggerCircle = { circle: Point; label?: string };

export type SVGDebug =
	| SVGLoggerDirectionalLine
	| SVGLoggerDirectionalBezier
	| string
	| SVGLoggerCircle;

export const isSVGLoggerCircle = (db: SVGDebug): db is SVGLoggerCircle => {
	return typeof db === 'object' && Object.hasOwn(db, 'circle');
};
export const isSVGLoggerDirectionalLine = (db: SVGDebug): db is SVGLoggerDirectionalLine => {
	const res =
		typeof db === 'object' &&
		Object.hasOwn(db, 'directionalLine') &&
		Object.hasOwn((db as SVGLoggerDirectionalLine).directionalLine, 'points');
	return res;
};
export const isSVGLoggerDirectionalBezier = (db: SVGDebug): db is SVGLoggerDirectionalBezier => {
	const res =
		typeof db === 'object' &&
		Object.hasOwn(db, 'directionalBezier') &&
		Object.hasOwn((db as unknown as SVGLoggerDirectionalBezier).directionalBezier, 'points');
	return res;
};

export type Logger = {
	config: {
		show: boolean;
		opacity: number;
		strokeWidth: number;
		colors: string[];
	};
	debug: SVGDebug[];
};

const defaultInit: Logger = {
	config: {
		show: true,
		opacity: 1,
		strokeWidth: 1,
		colors: [
			'orangered',
			'aqua',
			'blue',
			'tomato',
			'green',
			'red',
			'limegreen',
			'magenta',
			'cornflowerblue'
		]
	},
	debug: []
};

// export const logger = writable<Logger>(defaultInit);

const loggerStore = (init: Logger) => {
	const { subscribe, set, update } = writable<Logger>(init);

	return {
		addLines: (lines: (LineSegment | [Point, Point])[]) => {
			update((log: Logger) => {
				log.debug.push(
					...lines.map((line) => {
						if (line instanceof LineSegment) {
							return { directionalLine: { points: [line.p0, line.p1] } };
						} else {
							return { directionalLine: { points: [line[0], line[1]] } };
						}
					})
				);
				return log
			});
		},
		addBeziers: (beziers: (Bezier | [Point, Point, Point, Point])[]) => {
			update((log: Logger) => {
				log.debug.push(
					...beziers.map((bez) => {
						if (bez instanceof Bezier) {
							return { directionalBezier: { points: [...bez.points] } };
						}
						return { directionalBezier: { points: [...bez] } };
					})
				);
				return log;
			});
		},
		addCircles: (coords: [number, number][] | Point[]) => {
			update((log: Logger) => {
				log.debug.push(
					...coords.map((coord) => {
						return Array.isArray(coord)
							? { circle: { x: coord[0], y: coord[1] } }
							: { circle: { x: coord.x, y: coord.y } };
					})
				);
				return log;
			});
		},
		add: (dbg: SVGDebug | SVGDebug[]) => {
			update((log: Logger) => {
				if (Array.isArray(dbg)) {
					log.debug.push(...dbg);
				} else {
					log.debug.push(dbg);
				}
				return log;
			});
		},
		subscribe,
		set,
		update
	};
};

export const logger = loggerStore(defaultInit);
