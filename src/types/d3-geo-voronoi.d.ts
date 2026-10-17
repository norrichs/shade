// Minimal ambient types for d3-geo-voronoi (no @types package exists).
// Declares only the surface used by src/lib/voronoi/compute-voronoi-spherical.ts.
declare module 'd3-geo-voronoi' {
	export interface GeoVoronoiPolygonFeature {
		type: 'Feature';
		geometry: { type: 'Polygon'; coordinates: [number, number][][] } | null;
		properties?: {
			site?: [number, number];
			sitecoordinates?: [number, number];
			neighbours?: number[];
		};
	}

	export interface GeoVoronoiPolygons {
		type: 'FeatureCollection';
		features: GeoVoronoiPolygonFeature[];
	}

	export interface GeoVoronoi {
		polygons(data?: [number, number][]): GeoVoronoiPolygons;
	}

	export function geoVoronoi(data?: [number, number][]): GeoVoronoi;
}
