# Voronoi follow up

## Voronoi projection refactor

Defer this. Just brainstorming

Currently Vornoi tesselaton is calculated by projection from a center point onto the Surface.  This assumes a roughly spherical topology. Distortions from spherical, or completely non-sphericial topologies, such as toroidal, result in distorted voronoi projections, or even errors.

Instead of projecting from a center point on the INSIDE of the surface, 

## Inner curvature of Voronoi

The Voronoi pipeline projects voronoi edges onto a surface.
Curve offset


## Adaptive Voronoi Edge divisions

currenctly, Vornonoi geometry is divided along the axis of Voronoi cell edges by an `edgeDivisions: number` config variable.

Change that to `edgeDivisions: [number, number]`

The first number should be treated as `minimum` edge divisions, and the second as `maximum` edge divisions.

Validate inputs to so that edgeDivisions[0] <= edgeDivisions[1]

When generating voronoi geometry, before "dividing" the voronoi cell edges, first find the minumum and maximum length edges.  The minimum length edge will be divided by edgeDivisions[0], and the maxiumum length edge will be divided by edgeDivisions[1]
All other edges will be divided by division number equal to or between the min and max, linearly interpolated.

Default config is `edgeDivisions: [6,6]`, reproducing the current default `edgeDivisions: 6`