import type { Tube } from './types';
import type { Band } from '$lib/types';
import {
	Vector3,
	Triangle,
	BufferGeometry,
	Float32BufferAttribute,
	Mesh,
	MeshPhysicalMaterial,
	DoubleSide,
	Raycaster
} from 'three';

export type FacetDirection = 'inside' | 'outside';
export type SideOrientation = 'inside' | 'outside' | 'mixed';

/**
 * Build a mesh from a tube's facet triangles
 */
const buildTubeMesh = (tube: Tube): Mesh => {
	const positions: number[] = [];

	tube.bands.forEach((band) => {
		band.facets.forEach((facet) => {
			const { a, b, c } = facet.triangle;
			positions.push(a.x, a.y, a.z);
			positions.push(b.x, b.y, b.z);
			positions.push(c.x, c.y, c.z);
		});
	});

	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
	geometry.computeVertexNormals();

	const material = new MeshPhysicalMaterial({
		side: DoubleSide,
		transparent: true,
		opacity: 0.5
	});

	return new Mesh(geometry, material);
};

/**
 * Check if a facet is facing inside or outside using raycasting
 */
const checkFacetDirection = (
	facet: { triangle: Triangle },
	mesh: Mesh,
	raycaster: Raycaster
): FacetDirection => {
	const { triangle } = facet;

	// Get the triangle's centroid
	const centroid = new Vector3();
	triangle.getMidpoint(centroid);

	// Get the triangle's normal
	const normal = new Vector3();
	triangle.getNormal(normal);

	// Offset the ray origin slightly along the normal to avoid self-intersection
	const rayOrigin = centroid.clone().add(normal.clone().multiplyScalar(0.001));

	// Set up the raycaster
	raycaster.set(rayOrigin, normal);

	// Check for intersections with the mesh
	const intersections = raycaster.intersectObject(mesh);

	// If there's an intersection, the facet is facing inside
	return intersections.length > 0 ? 'inside' : 'outside';
};

/**
 * Determine sideOrientation for a band based on middle facets
 */
const determineBandOrientation = (
	band: Band,
	mesh: Mesh,
	raycaster: Raycaster
): SideOrientation => {
	const facetCount = band.facets.length;
	const middleIndex = Math.floor(facetCount / 2);
	const middleIndices =
		facetCount >= 2 ? [middleIndex - 1, middleIndex] : facetCount === 1 ? [0] : [];

	let insideCount = 0;
	let outsideCount = 0;

	middleIndices.forEach((facetIndex) => {
		const facet = band.facets[facetIndex];
		if (!facet) return;

		const direction = checkFacetDirection(facet, mesh, raycaster);
		if (direction === 'inside') {
			insideCount++;
		} else {
			outsideCount++;
		}
	});

	if (insideCount === 0) {
		return 'outside';
	} else if (outsideCount === 0) {
		return 'inside';
	} else {
		return 'mixed';
	}
};

/**
 * Audit all tubes and mutate each band with its sideOrientation
 */
export const auditSides = (tubes: Tube[]): void => {
	const raycaster = new Raycaster();

	tubes.forEach((tube) => {
		// Build mesh for this tube
		const mesh = buildTubeMesh(tube);

		tube.bands.forEach((band) => {
			// Determine and set the band's sideOrientation
			band.sideOrientation = determineBandOrientation(band, mesh, raycaster);
		});

		// Clean up mesh resources
		mesh.geometry.dispose();
		(mesh.material as MeshPhysicalMaterial).dispose();
	});
};
