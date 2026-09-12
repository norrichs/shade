Make a change to the tiledGridPattern.
Make a plan for implementing this new behavior
Use superpowers to write up a spec and implemenation plan.
Do this work on a new branch

## New behavior

When patterns are generated using this pattern definition, we will drop some segments.

Currently, the pattern is applied to quads. Currently it's pretty much invariant with respect to band-level pattern generation, except maybe for selectiveline including PathSegment nodes where 2 quads in the band meet.

We want to add in some band-level pattern modification to support the following behavior:

Where 2 bands meet along their edge (not their end), one of the bands (the band with lower index) will drop line segments. Specifcally, drop odd number indexed EDGE line segments, unless the segment is part of the final row of the final quad of the band.

The pattern already implements support for extending the unit pattern to have multiple rows and columns per quad.

In the case of 1 row, 1 column, we would be dropping a segment from every other quad, except the last quad
In the case of 1 row, 2 columns, we would still be dropping a segment from every other quad except the last. Only 1 per quad, in the LAST column
In the case of 2 rows, 2 columns, we still drop ONLY 1 from each quad. The first rows of each quad would not lose as segment
In the case of 3 rows, 2 columns, we'ed drop a segment from the 2nd row of the first quad, then drop from the 1st and 3rd rows of the second quad, then the 2nd row of the 3rd quad, etc.

For Tubes that are truly tubular, such as in a Globule geometry, or individual tubes in a Projection geometry, EACH band gets this treatment.
For tubes that are not truly tubular, such as from a `surface projection` or `surface voronoi` geometry, the LAST band in the tube does not get the treatment.  
Stated another way, we only drop segments from bands that have adjacent partner bands (end partner and start partner are NOT implicated)
