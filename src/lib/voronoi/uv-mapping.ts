import { Vector3 } from 'three';

export function toUV(point: Vector3, center: Vector3): [number, number] {
	const dir = point.clone().sub(center).normalize();
	const phi = Math.acos(Math.max(-1, Math.min(1, dir.z)));
	const theta = Math.atan2(dir.y, dir.x);
	const u = ((theta + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI);
	const v = phi / Math.PI;
	return [u, v];
}

export function fromUVToDirection(u: number, v: number): Vector3 {
	const theta = u * 2 * Math.PI - Math.PI / 2;
	const phi = v * Math.PI;
	const sinPhi = Math.sin(phi);
	return new Vector3(
		sinPhi * Math.cos(theta),
		sinPhi * Math.sin(theta),
		Math.cos(phi)
	);
}
