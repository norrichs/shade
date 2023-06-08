export const rad = (deg: number): number => Math.PI / 180 * deg
export const deg = (rad: number): number => 180 / Math.PI * rad

export const getPolar = (x: number, y: number, cx = 0, cy = 0): { r: number; theta: number } => {
	const r = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2));
	const sinx = Math.sin(x - cx);
	const cosy = Math.cos(y - cy);
	const theta =
		sinx >= 0 && cosy >= 0
			? Math.asin(sinx)
			: sinx >= 0 && cosy < 0
			? Math.PI - Math.asin(sinx)
			: sinx < 0 && cosy < 0
			? Math.PI + Math.asin(sinx)
			: Math.PI * 2 + Math.asin(sinx);
	return { r, theta };
};