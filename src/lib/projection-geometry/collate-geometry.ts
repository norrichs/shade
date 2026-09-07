import { BufferGeometry, Object3D, Vector3 } from 'three';
import type {
	Polyhedron,
	Edge,
	Polygon,
	Projection,
	Tube,
	GlobuleAddress_Band,
	GlobuleAddress_Facet,
	Section
} from './types';
import type { Band, Facet } from '$lib/types';
import {
	type ShowGlobuleTubeGeometries,
	type ShowProjectionGeometries,
	type ShowVoronoiGeometries
} from '$lib/stores/viewControlStore';

export const collateGeometry = (
	{
		projection,
		polyhedron,
		tubes,
		surfaceProjectionTubes,
		surface
	}: {
		projection: Projection;
		polyhedron: Polyhedron;
		tubes: Tube[];
		surfaceProjectionTubes?: Tube[];
		surface: Object3D;
	},
	show: ShowProjectionGeometries
) => {
	if (!show.any) return {};
	return {
		surface: show.surface ? surface : undefined,
		projection: show.projection
			? collateProjectionGeometry(projection, new Vector3(0, 0, 0))
			: undefined,
		surfaceProjection:
			show.surfaceProjection && surfaceProjectionTubes?.length
				? collateAddressedBandGeometry(surfaceProjectionTubes.map((tube) => tube.bands).flat())
				: show.surfaceProjection
					? collateSurfaceProjectionGeometry(projection)
					: undefined,
		surfaceProjectionFacets:
			show.surfaceProjection && surfaceProjectionTubes?.length
				? collateFacetGeometry(surfaceProjectionTubes.map((tube) => tube.bands).flat())
				: undefined,
		polygons: show.polygons ? polyhedron.polygons.map((p) => collatePolygonGeometry(p)) : undefined,
		sections: show.sections
			? collateSectionGeometry(tubes.map((tube) => tube.sections).flat(1))
			: undefined,
		// Addressed so band meshes can carry the Assembler cross-view highlight and be
		// clicked in a bands-only view (facets off).
		bands: show.bands
			? collateAddressedBandGeometry(tubes.map((tube) => tube.bands).flat())
			: undefined,
		facets: show.facets ? collateFacetGeometry(tubes.map((tube) => tube.bands).flat()) : undefined
	};
};

export const collateGlobuleTubeGeometry = (
	globuleTubes: Tube[],
	show: ShowGlobuleTubeGeometries
) => {
	if (!show.any) return {};
	return {
		sections: show.sections
			? collateSectionGeometry(globuleTubes.map((tube) => tube.sections).flat(1))
			: undefined,
		// Addressed so band meshes can carry the Assembler highlight — the globule-tube
		// view is normally bands-only, with facets off.
		bands: show.bands
			? collateAddressedBandGeometry(globuleTubes.map((tube) => tube.bands).flat())
			: undefined,
		facets: show.facets
			? collateFacetGeometry(globuleTubes.map((tube) => tube.bands).flat())
			: undefined
	};
};

export const collateVoronoiGeometry = (
	voronoiTubes: Tube[],
	surfaceProjectionTubes: Tube[],
	show: ShowVoronoiGeometries
) => {
	if (!show.any) return {};
	// One-sided rim tubes (open-surface boundary edges) have a single band; split them
	// out so the renderer can colour them distinctly. (Valid discriminator while
	// surfaceProjectionDivisions === 0, where normal tubes have 2 bands.)
	const rimTubes = voronoiTubes.filter((tube) => tube.bands.length === 1);
	const mainTubes = voronoiTubes.filter((tube) => tube.bands.length !== 1);
	return {
		sections: show.sections
			? collateSectionGeometry(voronoiTubes.map((tube) => tube.sections).flat(1))
			: undefined,
		// Addressed so band meshes can carry the Assembler cross-view highlight and be
		// clicked in a bands-only view — which is how the voronoi view is normally
		// used, so unaddressed band meshes left it with no highlight at all.
		bands: show.bands
			? collateAddressedBandGeometry(mainTubes.map((tube) => tube.bands).flat())
			: undefined,
		rimBands: show.bands
			? collateAddressedBandGeometry(rimTubes.map((tube) => tube.bands).flat())
			: undefined,
		facets: show.facets
			? collateFacetGeometry(voronoiTubes.map((tube) => tube.bands).flat())
			: undefined,
		surfaceProjectionFacets: show.surfaceProjection
			? collateFacetGeometry(surfaceProjectionTubes.map((tube) => tube.bands).flat())
			: undefined
	};
};

export const collateProjectionGeometry = (projection: Projection, center: Vector3) => {
	const projectionPoints: Vector3[] = [];

	projection.polygons.forEach((polygon) => {
		polygon.edges.forEach((edge) => {
			edge.sections.forEach((section) => {
				projectionPoints.push(center, section.intersections.curve, section.intersections.edge);
			});
		});
	});

	const projectionGeometry = new BufferGeometry().setFromPoints(projectionPoints);
	projectionGeometry.computeVertexNormals();

	return projectionGeometry;
};

export const collateSurfaceProjectionGeometry = (projection: Projection) => {
	const points: Vector3[] = [];

	projection.polygons.forEach((polygon) => {
		polygon.edges.forEach((edge) => {
			for (let i = 0; i < edge.sections.length - 1; i++) {
				const { edge: e0, curve: c0 } = edge.sections[i].intersections;
				const { edge: e1, curve: c1 } = edge.sections[i + 1].intersections;
				points.push(e0, c0, e1);
				points.push(c0, c1, e1);
			}
		});
	});

	const geometry = new BufferGeometry().setFromPoints(points);
	geometry.computeVertexNormals();
	return geometry;
};

export const collateEdgePoints = (edgePoints: Vector3[], curvePoints: Vector3[]) => {
	const points: Vector3[] = [];
	for (let i = 0; i < edgePoints.length - 1; i++) {
		points.push(
			edgePoints[i],
			edgePoints[i + 1],
			curvePoints[i],
			curvePoints[i + 1],
			curvePoints[i],
			edgePoints[i + 1]
		);
	}
	return points;
};

export const collatePolygonGeometry = (polygon: Polygon) => {
	const polygonPoints = polygon.edges
		.map((edge: Edge) => collateEdgePoints(edge.edgePoints, edge.curvePoints))
		.flat();
	const polygonGeometry = new BufferGeometry().setFromPoints(polygonPoints);
	polygonGeometry.computeVertexNormals();
	return polygonGeometry;
};

export const collatePolyhedronGeometry = (polyhedron: Polyhedron) => {
	const polyhedronPoints = polyhedron.polygons
		.map((polygon) =>
			polygon.edges.map((edge: Edge) => collateEdgePoints(edge.edgePoints, edge.curvePoints))
		)
		.flat(2);
	const polyhedronGeometry = new BufferGeometry().setFromPoints(polyhedronPoints);
	polyhedronGeometry.computeVertexNormals();
	return polyhedronGeometry;
};

export const collateCrossSectionPoints = (points: Vector3[], center: Vector3) => {
	const geometryPoints: Vector3[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		geometryPoints.push(points[i], center, points[i + 1]);
	}
	return geometryPoints;
};

export const collateSectionGeometry = (sections: Section[]) => {
	const geometryPoints: Vector3[] = [];
	sections.forEach(({ points }) => {
		const v0 = points[0];
		const v1 = points[Math.floor(points.length / 2)];
		const center = new Vector3((v0.x + v1.x) / 2, (v0.y + v1.y) / 2, (v0.z + v1.z) / 2);
		for (let i = 0; i < points.length - 1; i++) {
			geometryPoints.push(points[i], center, points[i + 1]);
		}
	});
	const sectionGeometry = new BufferGeometry().setFromPoints(geometryPoints);
	sectionGeometry.computeVertexNormals();
	return sectionGeometry;
};

export const collateBandGeometry = (bands: Band[]): BufferGeometry[] => {
	const bandsGeometry: BufferGeometry[] = [];
	bands.forEach((band) => {
		const geometryPoints: Vector3[] = [];
		band.facets.forEach(({ triangle: { a, b, c } }: Facet) => {
			geometryPoints.push(a.clone(), b.clone(), c.clone());
		});
		const bandGeometry = new BufferGeometry().setFromPoints(geometryPoints);
		bandGeometry.computeVertexNormals();
		bandsGeometry.push(bandGeometry);
	});
	return bandsGeometry;
};

/**
 * Band geometry paired with the band's address, so band meshes can take part in
 * address-driven colouring and clicking (the Assembler cross-view highlight).
 * `collateBandGeometry` drops the address, which is why a band mesh can only ever
 * paint one fixed colour.
 *
 * Bands generated by `generateProjectionBands` carry an `address`; where they do not,
 * fall back to the address their facets carry. A band with neither still gets its
 * geometry — this feeds ordinary band rendering, so skipping it would make the mesh
 * vanish — but with `address: undefined`, so it paints its fallback colour and takes
 * no part in highlighting. Guessing an index would highlight the wrong band.
 */
export const collateAddressedBandGeometry = (
	bands: Band[]
): { address?: GlobuleAddress_Band; geometry: BufferGeometry }[] => {
	const out: { address?: GlobuleAddress_Band; geometry: BufferGeometry }[] = [];
	bands.forEach((band) => {
		// `Band.address` also admits the legacy `GeometryAddress` shape, which has no
		// globule/tube — take it only when it carries the globule triple, else fall back.
		const bandAddress = band.address as Partial<GlobuleAddress_Band> | undefined;
		const facetAddress = band.facets[0]?.address;
		const address: GlobuleAddress_Band | undefined =
			typeof bandAddress?.globule === 'number' &&
			typeof bandAddress?.tube === 'number' &&
			typeof bandAddress?.band === 'number'
				? { globule: bandAddress.globule, tube: bandAddress.tube, band: bandAddress.band }
				: facetAddress
					? { globule: facetAddress.globule, tube: facetAddress.tube, band: facetAddress.band }
					: undefined;

		const geometryPoints: Vector3[] = [];
		band.facets.forEach(({ triangle: { a, b, c } }: Facet) => {
			geometryPoints.push(a.clone(), b.clone(), c.clone());
		});
		const geometry = new BufferGeometry().setFromPoints(geometryPoints);
		geometry.computeVertexNormals();
		out.push({ address, geometry });
	});
	return out;
};

export const collateFacetGeometry = (
	bands: Band[]
): { address: GlobuleAddress_Facet; geometry: BufferGeometry }[] => {
	const facetGeometry: { address: GlobuleAddress_Facet; geometry: BufferGeometry }[] = [];
	bands.forEach((band) => {
		band.facets.forEach(({ address, triangle: { a, b, c } }) => {
			const geometry = new BufferGeometry().setFromPoints([a.clone(), b.clone(), c.clone()]);
			geometry.computeVertexNormals();
			facetGeometry.push({ geometry, address });
		});
	});
	return facetGeometry;
};
