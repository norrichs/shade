import { Vector3, Object3D, Mesh, SphereGeometry, MeshBasicMaterial, DoubleSide } from 'three';
import { chooseHit, selectSurfaceHit, type SurfaceHit } from '../select-surface-hit';

describe('chooseHit (pure)', () => {
	const cellNormal = new Vector3(0, 0, 1);

	it('returns null when there are no hits', () => {
		expect(chooseHit([], new Vector3(), cellNormal)).toBeNull();
	});

	it('picks the hit nearest the anchor', () => {
		const anchor = new Vector3(0, 0, 0);
		const hits: SurfaceHit[] = [
			{ point: new Vector3(0, 0, 9), normalWorld: new Vector3(0, 0, 1) },
			{ point: new Vector3(0, 0, 0.5), normalWorld: new Vector3(0, 0, 1) }
		];
		expect(chooseHit(hits, anchor, cellNormal)!.point.z).toBeCloseTo(0.5, 6);
	});

	it('breaks near-equidistant ties by normal agreement with the cell normal', () => {
		const anchor = new Vector3(0, 0, 0);
		const hits: SurfaceHit[] = [
			{ point: new Vector3(1, 0, 0), normalWorld: new Vector3(1, 0, 0) },
			{ point: new Vector3(0, 0, 1), normalWorld: new Vector3(0, 0, 1) }
		];
		const chosen = chooseHit(hits, anchor, cellNormal, 0.5);
		expect(chosen!.normalWorld.z).toBeCloseTo(1, 6);
	});

	it('does not apply the tiebreak when one hit is clearly nearer', () => {
		const anchor = new Vector3(0, 0, 0);
		const hits: SurfaceHit[] = [
			{ point: new Vector3(0, 0, 5), normalWorld: new Vector3(0, 0, 1) },
			{ point: new Vector3(0.2, 0, 0), normalWorld: new Vector3(1, 0, 0) }
		];
		const chosen = chooseHit(hits, anchor, cellNormal, 0.5);
		expect(chosen!.point.x).toBeCloseTo(0.2, 6);
	});
});

describe('selectSurfaceHit (raycast wrapper)', () => {
	function sphereSurface(radius: number): Object3D {
		const surface = new Object3D();
		const mesh = new Mesh(
			new SphereGeometry(radius, 32, 32),
			new MeshBasicMaterial({ side: DoubleSide })
		);
		surface.add(mesh);
		surface.updateMatrixWorld(true);
		return surface;
	}

	it('returns the hit nearest the anchor among multiple surface intersections', () => {
		const surface = sphereSurface(100);
		const source = new Vector3(0, 0, 500);
		const through = new Vector3(0, 0, 0);
		const anchor = new Vector3(0, 0, 100);
		const hit = selectSurfaceHit({
			surface,
			source,
			through,
			anchor,
			cellNormal: new Vector3(0, 0, 1)
		});
		expect(hit).not.toBeNull();
		expect(hit!.z).toBeCloseTo(100, 0);
	});

	it('returns null when the ray misses the surface', () => {
		const surface = sphereSurface(100);
		const source = new Vector3(0, 1000, 500);
		const through = new Vector3(0, 1000, 0);
		const hit = selectSurfaceHit({
			surface,
			source,
			through,
			anchor: new Vector3(0, 1000, 0),
			cellNormal: new Vector3(0, 0, 1)
		});
		expect(hit).toBeNull();
	});
});
