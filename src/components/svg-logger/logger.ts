import type { Point } from '$lib/patterns/flower-of-life.types';
import { writable } from 'svelte/store';
// eslint-disable-next-line @typescript-eslint/no-explicit-any

export type SVGLoggerDirectionalLine = {
	directionalLine: {
		points: Point[];
		label: string;
		labels: string[];
		for?: string;
	};
};

export type SVGLoggerCircle = { circle: Point };

export type SVGDebug = SVGLoggerDirectionalLine | string | SVGLoggerCircle;

export const isSVGLoggerCircle = (db: SVGDebug): db is SVGLoggerCircle => {
	return typeof db === 'object' && Object.hasOwn(db, 'circle');
};
export const isSVGLoggerDirectionalLine = (db: SVGDebug): db is SVGLoggerDirectionalLine => {
	const res =
		typeof db === 'object' &&
		Object.hasOwn(db, 'directionalLine') &&
		Object.hasOwn((db as SVGLoggerDirectionalLine).directionalLine, 'points') &&
		Object.hasOwn((db as SVGLoggerDirectionalLine).directionalLine, 'label') &&
		Object.hasOwn((db as SVGLoggerDirectionalLine).directionalLine, 'labels');
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
		opacity: 0.5,
		strokeWidth: 0.2,
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

export const logger = writable<Logger>(defaultInit);
