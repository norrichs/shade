extend the OutlinedPatternConfig based pattern generation pipeline and types to handle a new class of patterns

These new patterns will build on top of OutlinedPattern functionality, adding in prodedurally generated internal geometry

The first will be a "randomized circle hole" pattern

new params

- margin
- circle minimum size
- circle masimum size
- inter circle distance

Based on those params, we'll work within the `outlined pattern` pipeline
That pipeline ALREADY generates an OUTLINE of a band, to which tab geometry is appended, resulting in a single combined path that outlines the bare band as well as the tabs.
What this generated pattern will do is

- randomly distribute seed points within the base Band outline bounds
- from each seed point, draw a circle with center at the seed point. The radius of each circle will be such that no 2 circle edges are closer than `inter circle distance`, no circle is closer to the outline boundary than `margin`, and all circle radii are between `minimum` and `maximum`

Research an efficient method for doing this. This is kindof a `packing algorithm` kind of problem. It's related to voronoi tiling. We already have some voronoi algorithms in the codebase that might be leveraged, if they are already efficient enough.

use superpowers to brainstorm and plan this work.
