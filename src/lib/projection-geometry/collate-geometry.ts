import { BufferGeometry, Object3D, Vector3 } from 'three';
import type {
	Polyhedron,
	Edge,
	Polygon,
	Projection,
	Tube,
	GlobuleAddress_Facet,
	Section
} from './types';
import type { Band, Facet } from '$lib/types';
import {
	type ShowGlobuleTubeGeometries,
	type ShowProjectionGeometries
} from '$lib/stores/viewControlStore';

export const collateGeometry = (
	{
		projection,
		polyhedron,
		tubes,
		surface
	}: {
		projection: Projection;
		polyhedron: Polyhedron;
		tubes: Tube[];
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
		polygons: show.polygons ? polyhedron.polygons.map((p) => collatePolygonGeometry(p)) : undefined,
		sections: show.sections
			? collateSectionGeometry(tubes.map((tube) => tube.sections).flat(1))
			: undefined,
		bands: show.bands ? collateBandGeometry(tubes.map((tube) => tube.bands).flat()) : undefined,
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
		bands: show.bands
			? collateBandGeometry(globuleTubes.map((tube) => tube.bands).flat())
			: undefined,
		facets: show.facets
			? collateFacetGeometry(globuleTubes.map((tube) => tube.bands).flat())
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
