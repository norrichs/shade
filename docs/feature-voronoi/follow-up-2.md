# Voronoi follow up

## Voronoi projection refactor

Defer this. Just brainstorming

Currently Vornoi tesselaton is calculated by projection from a center point onto the Surface. This assumes a roughly spherical topology. Distortions from spherical, or completely non-sphericial topologies, such as toroidal, result in distorted voronoi projections, or even errors.

Instead of projecting from a center point on the INSIDE of the surface,

## Inner curvature of Voronoi

The Voronoi pipeline projects voronoi edges onto a surface.
curveOffsetFactor config value is used to calculate another set of edges inset from the primary voronoi edges, and surfaceProjectionDivisions is used to calculate linearly interpolated edges between the primary and inner edges.  
Sections are built by subdividing the edges by `edgeDivision`

We'll add complication to this.

Add a configuration option `offsetCurved: boolean`

If true, instead of the inner edge being straight lines, composed of two points, it will be composed of bezier curves.

Follow this algorithm:

1. start with the 2d straight-line inner edges
2. find center points of each edge
3. connect center points of adjacent edges with quadratic bezier curves. The control handle for the quadratic curve will be the vertex that each edge shares.
4. subdivide the curve where it intersects the line from the outer voronoi cell vertex and the center / seed point
5. sample the curves according to edgeDivisions

## Adaptive Voronoi Edge divisions

currenctly, Vornonoi geometry is divided along the axis of Voronoi cell edges by an `edgeDivisions: number` config variable.

Change that to `edgeDivisions: [number, number]`

The first number should be treated as `minimum` edge divisions, and the second as `maximum` edge divisions.

Validate inputs to so that edgeDivisions[0] <= edgeDivisions[1]

When generating voronoi geometry, before "dividing" the voronoi cell edges, first find the minumum and maximum length edges. The minimum length edge will be divided by edgeDivisions[0], and the maxiumum length edge will be divided by edgeDivisions[1]
All other edges will be divided by division number equal to or between the min and max, linearly interpolated.

Default config is `edgeDivisions: [6,6]`, reproducing the current default `edgeDivisions: 6`

New Voronoi generation method

1. generate random seeds with current methods
2. use the current method to map map voronoi diagram on to the surface and subdivide the the curves (edgeDivisions). Adaptive subdivisions shoul carry through here.
3. gather all of the points forming the divided voronoi edges
4. calculate the average plane for that sample of points, using either `principle component analysis` of `single value decomposition` (TBD)
5. calculate the normal vector for the average plane (sourceDirection)
6. extend that vector some distance (sourceDistance), scaled to the overall size of the surface. Exact distance doesn't matter, but the distance should be approx some scale (doesn't need to be configurable. Just use a constant. Try 10x) larger than the "size" of the surface, sampled at the seed points. E.g. if the longest distance between 2 seed points is 200, then `sourceDistance` should be 2000
7. at 1/2 of sourceDistance, in sourceDirection, extablish a plane perpendicular to sourceDirection, i.e. parallel to the average plane. This is the `projectorPlane`
8. cast rays from the `source` to the vertices and subdivided points of the voronoi edges on the surface, as well as the seed point
9. find intersections of the rays with the `projectorPlane`
10. this is a 2d representation of the voronoi cell
11. Now we can calculate the inset edges by curveOffsetFactor. We can also find the subdivided edges by surfaceProjectionDivisions, all on the projectionPlane
12. ray cast from the source back through the inner edge points on projectionPlane, finding intersections with the surface. In this step, we will need to be VERY careful to choose the correct intersections. Since we are not raycasting from a center point out to a roughly spherical surface, and the source distance is large relative to the size of the surface, we will almost always have multiple surface intersections. We CAN expect that the intersections we want are roughly in between the points on the surface we already know about - the voronoi edge points and the seed point
13. we should be able to cleanly feed the intersection points generated in step 12 into existing tube generation pipelines

NOTE: this new projection method is valueable for several reasons

- does not depend on a roughly spherical surface shape. This new method should be compatible with toroidal and concave surface topologies, for instance
- curve offset geometries can be extended to use sampled bezier curves, or other shapes, which would be difficult with current methods.

For now, the goal is rough parity with existing voronoi mapping.  
Extensions involving other geometries are to follow. Consider that intention.
