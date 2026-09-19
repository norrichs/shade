# Fix it items

## Add edge curves to voronoi

possible implementation:

1. configure edge curves as a 2d - voronoi cell outer, curved offset inner. Outer defined below
2. for a voronoi cell in 3d, find the centroid and an averaged normal of all vertices (average normal vector of all triangles formed by between vertices and centroid).
3. use a long distance vector with that average normal direction to set a raycaster.
4. at the 1/2 distance, form the voronoi cell projector plan, connecting rays fromthe source to the 3d voronoi vertices
5. project through points on the inner curve to find intersection points on the surface
6. also project divisions

## Voronoi enablement

- Put voronoi config in it's own floating editor
- check whether multiple voronoi configs is actually doing anything. If not, just support 1
- initialize a default voronoi config on boot (should be random seed)

## Pattern tags

- When grouped by end connection, give each group a sequental code string ('0000', '0001', '0002', ...)
- add an external tag option to render the group code

## Pattern map export

- Generate a downloadable csv with relevant details to reconstruct the pattern.
- if grouped by connection, then each row is a ring group, with code in column 1. Column 2 lists partner groups. (via adjacency) Subsequent columns list tube/band members

## Pattern layout

- line wrapping (give a set width to wrap on)

## surfaceProjection "fillAll" option.

- for either surfaceProjection pipeline, have a fillAll config option.
- when true and pattern type is "outlined", create a new pattern band that fills in the empty interiro of a surface projection polygon. Each vertex on the interior side of the band is at the centroid surface intersection point. quads are triangular...
