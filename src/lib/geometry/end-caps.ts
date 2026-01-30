import {
	Vector3,
	Triangle,
	BufferGeometry,
	Mesh,
	MeshBasicMaterial,
	Float32BufferAttribute,
	DoubleSide
} from 'three';
import type { Level } from '$lib/types';

export interface EndCapConfig {
	enabled: boolean;
	topCap: boolean; // Add cap to first level
	bottomCap: boolean; // Add cap to last level
	capOffset?: number; // Distance from level to cap center (default: 0)
}

export interface EndCapGeometry {
	triangles: Triangle[];
	mesh: Mesh; // For adding to surface Object3D
}

/**
 * Generate end cap triangles from a level
 * Creates a triangular fan from level vertices to a center point
 */
export function generateEndCap(
	level: Level,
	direction: 'top' | 'bottom',
	offset: number = 0
): EndCapGeometry {
	const triangles: Triangle[] = [];

	// Calculate cap center point
	// Offset along Z-axis from level center
	const capCenter = level.center.clone();
	if (direction === 'top') {
		capCenter.z += offset;
	} else {
		capCenter.z -= offset;
	}

	// Create triangular fan
	// Each triangle connects: capCenter → vertex[i] → vertex[i+1]
	const vertices = level.vertices;
	for (let i = 0; i < vertices.length; i++) {
		const v1 = vertices[i];
		const v2 = vertices[(i + 1) % vertices.length]; // Wrap around

		// Triangle winding order matters for normals
		// Top cap: counter-clockwise from above
		// Bottom cap: clockwise from below (reversed)
		let triangle: Triangle;
		if (direction === 'top') {
			triangle = new Triangle(capCenter, v1, v2);
		} else {
			triangle = new Triangle(capCenter, v2, v1);
		}

		triangles.push(triangle);
	}

	// Create mesh for ray intersection
	const mesh = createCapMesh(triangles);

	return { triangles, mesh };
}

/**
 * Create a Three.js mesh from cap triangles
 * Used for adding to surface Object3D for ray intersection
 */
function createCapMesh(triangles: Triangle[]): Mesh {
	const geometry = new BufferGeometry();

	// Convert triangles to vertices array
	const vertices: number[] = [];
	triangles.forEach((triangle) => {
		vertices.push(
			triangle.a.x,
			triangle.a.y,
			triangle.a.z,
			triangle.b.x,
			triangle.b.y,
			triangle.b.z,
			triangle.c.x,
			triangle.c.y,
			triangle.c.z
		);
	});

	// Set position attribute
	geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));

	// Compute normals for proper rendering (optional, for debugging)
	geometry.computeVertexNormals();

	// Create mesh with basic material
	// Material doesn't matter much since caps are only for ray intersection
	const material = new MeshBasicMaterial({
		color: 0x888888,
		transparent: true,
		opacity: 0.3,
		side: DoubleSide
	});

	return new Mesh(geometry, material);
}

/**
 * Generate both top and bottom caps for a globule
 */
export function generateGlobuleEndCaps(
	levels: Level[],
	config: EndCapConfig
): {
	topCap: EndCapGeometry | null;
	bottomCap: EndCapGeometry | null;
} {
	if (!config.enabled || levels.length === 0) {
		return { topCap: null, bottomCap: null };
	}

	const topCap = config.topCap
		? generateEndCap(levels[0], 'top', config.capOffset ?? 0)
		: null;

	const bottomCap = config.bottomCap
		? generateEndCap(levels[levels.length - 1], 'bottom', config.capOffset ?? 0)
		: null;

	return { topCap, bottomCap };
}
