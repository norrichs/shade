import { describe, it, expect, beforeEach } from '@jest/globals';
import { get } from 'svelte/store';
import { Vector3 } from 'three';

import {
	addMeasurementPoint,
	clearMeasurements,
	measurements,
	removeMeasurement
} from '../measurementStore';

const v = (x: number, y = 0, z = 0) => new Vector3(x, y, z);

describe('measurementStore', () => {
	beforeEach(() => clearMeasurements());

	it('starts empty', () => {
		expect(get(measurements)).toEqual([]);
	});

	it('holds the first point as unmatched', () => {
		addMeasurementPoint(v(1));
		const [first] = get(measurements);
		expect(first.a.x).toBe(1);
		expect(first.b).toBeNull();
	});

	it('completes the pair on the second point', () => {
		addMeasurementPoint(v(1));
		addMeasurementPoint(v(2));
		const list = get(measurements);
		expect(list).toHaveLength(1);
		expect(list[0].b?.x).toBe(2);
	});

	it('starts a new unmatched point after a pair completes', () => {
		addMeasurementPoint(v(1));
		addMeasurementPoint(v(2));
		addMeasurementPoint(v(3));
		const list = get(measurements);
		expect(list).toHaveLength(2);
		expect(list[0].b).not.toBeNull();
		expect(list[1].b).toBeNull();
	});

	it('keeps at most one unmatched point, and it is last', () => {
		for (const x of [1, 2, 3, 4, 5]) addMeasurementPoint(v(x));
		const list = get(measurements);
		const unmatched = list.filter((m) => m.b === null);
		expect(unmatched).toHaveLength(1);
		expect(list[list.length - 1].b).toBeNull();
	});

	it('gives each measurement a distinct id', () => {
		for (const x of [1, 2, 3, 4]) addMeasurementPoint(v(x));
		const ids = get(measurements).map((m) => m.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('removes the named measurement and leaves the rest', () => {
		addMeasurementPoint(v(1));
		addMeasurementPoint(v(2));
		addMeasurementPoint(v(3));
		addMeasurementPoint(v(4));
		const [first, second] = get(measurements);
		removeMeasurement(first.id);
		const list = get(measurements);
		expect(list).toHaveLength(1);
		expect(list[0].id).toBe(second.id);
	});

	it('clears everything', () => {
		addMeasurementPoint(v(1));
		addMeasurementPoint(v(2));
		clearMeasurements();
		expect(get(measurements)).toEqual([]);
	});
});
