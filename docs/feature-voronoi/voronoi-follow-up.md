# Voronoi follow up

Workflow prompt:
- use superpowers to brainstorm and plan this grab-bag of upgrades following up on the addition of the voronoi geometry feature
- plan with parallel development in mind.  Use worktrees and superagents as needed to facilitate parallel development.  You are the orchestrator.
- use Opus model for for brainstorming and planning
- use Sonnet model for implementation of clear plans
- write artifacts to the docs/feature-voronoi/ folder


## Add edge curves to voronoi

This feature is very poorly defined so far.  Defer to later

possible implementation:

1) configure edge curves as a 2d - voronoi cell outer, curved offset inner.  Outer defined below
2) for a voronoi cell in 3d, find the centroid and an averaged normal of all vertices (average normal vector of all triangles formed by between vertices and centroid).
3) use a long distance vector with that average normal direction to set a raycaster.
4) at the 1/2 distance, form the voronoi cell projector plan, connecting rays fromthe source to the 3d voronoi vertices
5) project through points on the inner curve to find intersection points on the surface
6) also project divisions

## Voronoi random point algorithm
Goal: randomly distribute points over 3d geometry of arbitrary topology
Algorithm:
- initialize a counter at 0
- build an object by looping through all tube-band-facets.
  - for each facet, calculate the facet triangle area (scale the numeric value of the area so that we can represent as integer).  
  - add an object entry with numeric key equal to the current counter value.  Value is object with facet address and area
  - increment the counter by that area, as integer, floor 1
- to derive points
  - pick random numbers scaled to the final cuumalitive area represented by the counter
  - use that random number value to pick a facet from the object (value >= key && value < next_key)
  - pick a point ON that triangle surface.  I care less about this.  Each triangle we're picking from has a random number and width range associated with it.
    Example:
    - random index: 225
    - facet key: 220
    - facet width: 15
    - within_triangle_subdivision (ratio):  0.33 (i.e. (225-220) / 15 = 0.333333 )
  - use the within_triangle_subdivision to pick a point on the triangle.  This should be efficient, and needn't be high resolution
- Relaxation should also be applied to  the randomly chosen numbers.  That can probably happen at the random picking level, before deriving the 3d points, since numeric closeness is correlated with geometrical closeness.

UI - add it as an option to the voronoi config.  Make this algorithm the default

## Voronoi UI
- Put voronoi config in it's own floating editor instead of the menubar accessed editor.
- check whether multiple voronoi configs is actually doing anything. If not, just support 1.  Right now multiple can be created, but I don't know why.
- initialize a default voronoi config on boot (should be random seed)

## Pattern grouping
- When patterns are
 grouped by end connection, give each group a sequental code string ('0000', '0001', '0002', ...)

## Pattern tags
- add an external tag option to render the group code if it exists. (see above)  Render the group code joined with a space to the text of the self-tag (tube and band numbers)
- move self-tags.  Instead of anchoring to the band-start, anchor them to the middle quad of the band.  Specifically, anchor to the one of the outer edges of the middle quad,(round down if even number).  Choose whichever edge does NOT have a tab, or the side without a partner, or the side with adjacent partner with a higher band number.  The self tag should still be positioned so that the stem is perpendicular to the edge it is anchored to.

## Smart adjacent tab layout
Currently, adjacent tabs (tabs not at band ends), are laid out as either `before` or `after`
Tubes have multiple bands.  Call the point where bands meet a "seam".  There is a center seam (e.g, for tube with 4 bands, 0, 1,2,3, the center seam is between 1 and 2)
Add a new property `tab layout` with options `inner` and `outer`
- if `inner`, then the center seam tab is allocated per `before` and `after` rules.  The other seams have tabs allocated such that bands nearer in index to the center seam get tabs on the edge shared with a tab FARTHER from the center seam.
- if `outer`, then the center seam is allocated the same, and the other seams get tabs allocated opposite

Example:

Tube with bands 0, 1, 2, 3, 4, 5
Config: `before`, and `inner`
0 - no tabs
1 - tab on edge shared with 0 (inner)
2 - tab on edge shared with 1 (inner)
3 - tab on edge shared with 2 (before) and on edge shared with 4 (inner)
4 - tab on edge shared with 5
5 - no tabs



## Pattern map export
- Generate a downloadable csv with relevant details to reconstruct the pattern.
- UI flow: Render a button in the top nav bar.  Usually it has a "Make CSV" label.  On clicking that, the CSV is generated and prepared for download.  When ready, the label changes to "Download CSV".  On click, the file is downloaded.
- if grouped by connection:
  - row represents ring group, with columns:
    - column 1: ring code
    - column 2: partner group codes.  
      For example, if a ring has 3 members: `t0/b1`, `t3/b1`, `t5/b1`, each band might have 2 adjacent band partners.  Each of those is associated with another ring group, so we'd list 6 ring codes in this column (de-dupe)
    - subsequent columns: list tube / band of the constituent members of the ring.
- if grouped in tube / band order
  - row represents a band, with columns:
    - tube / band address
    - adjacent tube/band addresses
    - end partner tube/band addresses


## Pattern layout 
toggleable option to switch between :
- non-line wrapping (current mode, where svg patterns are laid out in a single row)
- line wrapping.  Configurable with a set-width.  line wrap the patterns, breaking at the set width. Will need to be aware of actual rendered height of each line

## surfaceProjection "fillAll" option.
- for either surfaceProjection pipeline, have a fillAll config option.  
- when true and pattern type is "outlined", create a new pattern band that fills in the empty interior of a surface projection polygon.  Each vertex on the interior side of the band is at the centroid surface intersection point.  quads are triangular...



